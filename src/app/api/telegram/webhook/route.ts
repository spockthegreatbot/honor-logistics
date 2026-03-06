import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const BOT_TOKEN = process.env.HONOR_BOT_TOKEN!
const OPENAI_KEY = process.env.OPENAI_API_KEY!
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const BOT_USERNAME = 'Honor_Assistant_Bot'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

async function sendMessage(chatId: number, text: string, replyToMessageId?: number) {
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'Markdown',
      reply_to_message_id: replyToMessageId,
    }),
  })
}

function isBotMentioned(text: string, entities?: Array<{type: string; offset: number; length: number}>): boolean {
  // Check via entities (most reliable — Telegram provides these)
  if (entities?.some(e => e.type === 'mention')) {
    const mentioned = entities
      .filter(e => e.type === 'mention')
      .map(e => text.substring(e.offset, e.offset + e.length).toLowerCase())
    if (mentioned.some(m => m.includes('honorassistant') || m.includes('honor_assistant'))) {
      return true
    }
  }
  // Fallback: text match (case-insensitive, ignore underscores)
  const normalised = text.toLowerCase().replace(/_/g, '')
  return normalised.includes('@honorassistantbot')
}

function stripBotMention(text: string): string {
  return text
    .replace(/@Honor_Assistant_Bot/gi, '')
    .replace(/@HonorAssistantBot/gi, '')
    .replace(/@honorassistantbot/gi, '')
    .trim()
}

async function getContext() {
  const today = new Date().toISOString().split('T')[0]
  // Next 14 days
  const twoWeeks = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

  const [
    { data: todayJobs },
    { data: upcomingJobs },
    { data: pendingRunups },
    { data: inventoryRows },
    { data: openCycles },
    { data: recentJobs },
  ] = await Promise.all([
    // Today's jobs
    supabase
      .from('jobs')
      .select('job_number, job_type, status, scheduled_date, notes, end_customers(name), staff(name)')
      .eq('scheduled_date', today)
      .neq('status', 'cancelled')
      .order('scheduled_date'),
    // Upcoming jobs next 14 days (all types including collections/deliveries)
    supabase
      .from('jobs')
      .select('job_number, job_type, status, scheduled_date, notes, end_customers(name), staff(name)')
      .gt('scheduled_date', today)
      .lte('scheduled_date', twoWeeks)
      .neq('status', 'cancelled')
      .order('scheduled_date')
      .limit(30),
    // Pending run-ups
    supabase
      .from('jobs')
      .select('job_number, end_customers(name), serial_number, staff(name), scheduled_date')
      .eq('status', 'runup_pending')
      .limit(20),
    // Inventory count
    supabase
      .from('inventory')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true),
    // Open billing cycles
    supabase
      .from('billing_cycles')
      .select('cycle_name, period_end, grand_total, clients(name)')
      .eq('status', 'open')
      .limit(5),
    // Recent completed/dispatched jobs (last 7 days)
    supabase
      .from('jobs')
      .select('job_number, job_type, status, scheduled_date, end_customers(name)')
      .gte('scheduled_date', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0])
      .lt('scheduled_date', today)
      .in('status', ['completed', 'dispatched'])
      .order('scheduled_date', { ascending: false })
      .limit(10),
  ])

  return { todayJobs, upcomingJobs, pendingRunups, inventoryRows, openCycles, recentJobs }
}

const VALID_JOB_STATUSES = [
  'pending', 'new', 'runup_pending', 'runup_complete',
  'ready', 'dispatched', 'completed', 'cancelled', 'complete',
]

async function handleAction(action: string, params: Record<string, unknown>) {
  if (action === 'update_job_status') {
    const { job_number, status } = params
    // Validate params are safe strings
    if (typeof job_number !== 'string' || !job_number.trim()) return '❌ Invalid job number.'
    if (typeof status !== 'string' || !VALID_JOB_STATUSES.includes(status)) return `❌ Invalid status: ${status}.`
    const { data: job } = await supabase
      .from('jobs')
      .select('id')
      .ilike('job_number', `%${job_number}%`)
      .single()
    if (!job) return `❌ Job ${job_number} not found.`
    await supabase.from('jobs').update({ status, updated_at: new Date().toISOString() }).eq('id', job.id)
    return `✅ Job ${job_number} updated to *${status}*.`
  }
  return null
}

async function askGPT(userMessage: string, ctx: Awaited<ReturnType<typeof getContext>>, senderName: string) {
  const now = new Date()
  const today = now.toLocaleDateString('en-AU', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Australia/Sydney',
  })

  const systemPrompt = `You are Honor Assistant — the operations bot for Honor Removals & Logistics, a printer delivery and logistics company in Mortdale, NSW, Australia.

Today is ${today} (Sydney time).

## Live Data

**Today's Jobs (${ctx.todayJobs?.length ?? 0}):**
${ctx.todayJobs?.length ? JSON.stringify(ctx.todayJobs, null, 1) : 'None scheduled today'}

**Upcoming Jobs next 14 days (${ctx.upcomingJobs?.length ?? 0}) — includes ALL types (delivery, collection, run-up, install):**
${ctx.upcomingJobs?.length ? JSON.stringify(ctx.upcomingJobs, null, 1) : 'Nothing scheduled in next 14 days'}

**Pending Run-Ups (${ctx.pendingRunups?.length ?? 0} — need sign-off before dispatch):**
${ctx.pendingRunups?.length ? JSON.stringify(ctx.pendingRunups, null, 1) : 'None pending'}

**Active Inventory:** ${ctx.inventoryRows} units in warehouse

**Open Billing Cycles:**
${ctx.openCycles?.length ? JSON.stringify(ctx.openCycles, null, 1) : 'None open'}

**Recently Completed/Dispatched (last 7 days):**
${ctx.recentJobs?.length ? JSON.stringify(ctx.recentJobs, null, 1) : 'None'}

## Your Personality
- Direct, practical, Australian tone
- Short answers — staff are on phones in a warehouse
- Use emojis sparingly: ✅ ⚠️ 🚚 📦 🔧
- Lead with what matters most, not pleasantries
- You know the business: run-ups must be signed off before dispatch, EFEX is the primary client, billing cycles are 2 weeks

## What You Can Do
- Answer questions about jobs, inventory, deliveries, run-ups, billing
- Show upcoming jobs by day/week
- Update job status — output: ACTION:{"action":"update_job_status","job_number":"HRL-2026-XXXX","status":"dispatched"}
- Valid statuses: pending, runup_pending, runup_complete, dispatched, completed, cancelled

## Rules
- Never make up job details not in the data above
- If data isn't available, say "I don't have that data — check the app at honor-logistics.vercel.app"
- Keep replies under 200 words
- You're talking to: ${senderName}`

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_KEY}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      max_tokens: 600,
      temperature: 0.4,
    }),
  })

  const data = await response.json()
  return data.choices?.[0]?.message?.content ?? 'Sorry, something went wrong. Try again.'
}

export async function POST(req: NextRequest) {
  // C2: Verify Telegram webhook secret token
  const secret = req.headers.get('x-telegram-bot-api-secret-token')
  if (secret !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const message = body.message || body.edited_message
    if (!message) return NextResponse.json({ ok: true })

    const chatId: number = message.chat.id
    const text: string = message.text ?? ''
    const messageId: number = message.message_id
    const senderName: string = message.from?.first_name ?? 'Staff'
    const isGroup = message.chat.type !== 'private'
    const entities = message.entities

    // In groups: respond to @mentions or /commands only
    const mentioned = isBotMentioned(text, entities)
    const isCommand = text.startsWith('/')

    if (isGroup && !mentioned && !isCommand) {
      return NextResponse.json({ ok: true })
    }

    // Strip bot mention
    const cleanText = stripBotMention(text)

    // Handle /help, /start or empty mention
    if (!cleanText || cleanText === '/help' || cleanText === '/start') {
      await sendMessage(
        chatId,
        `📦 *Honor Assistant — What I can do:*\n\n` +
        `📋 "What jobs are on today?"\n` +
        `📅 "Show upcoming jobs this week"\n` +
        `🔧 "Any pending run-ups?"\n` +
        `📦 "How many units in storage?"\n` +
        `🚚 "Mark HRL-2026-0012 as dispatched"\n` +
        `💰 "What's in the open billing cycle?"\n\n` +
        `Just @mention me or reply to any of my messages.`,
        messageId
      )
      return NextResponse.json({ ok: true })
    }

    // Typing indicator
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
    })

    // Get context + ask GPT
    const ctx = await getContext()
    let reply = await askGPT(cleanText, ctx, senderName)

    // Execute ACTION blocks
    const actionMatch = reply.match(/ACTION:(\{[\s\S]*?\})/)
    if (actionMatch) {
      try {
        const actionParams = JSON.parse(actionMatch[1])
        // H3: Validate action structure before executing
        if (typeof actionParams === 'object' && actionParams !== null && typeof actionParams.action === 'string') {
          const actionResult = await handleAction(actionParams.action, actionParams as Record<string, unknown>)
          reply = reply.replace(/ACTION:\{[\s\S]*?\}/, '').trim()
          if (actionResult) reply = (reply ? reply + '\n\n' : '') + actionResult
        } else {
          reply = reply.replace(/ACTION:\{[\s\S]*?\}/, '').trim()
        }
      } catch { /* ignore */ }
    }

    await sendMessage(chatId, reply, messageId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Telegram webhook error:', err)
    return NextResponse.json({ ok: true })
  }
}
