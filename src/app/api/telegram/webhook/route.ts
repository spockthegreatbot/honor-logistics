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

async function getContext() {
  const today = new Date().toISOString().split('T')[0]

  const [{ data: todayJobs }, { data: pendingRunups }, { data: soh }, { data: openCycles }] = await Promise.all([
    supabase
      .from('jobs')
      .select('job_number, job_type, status, scheduled_date, end_customers(name), staff(name)')
      .eq('scheduled_date', today)
      .neq('status', 'cancelled')
      .order('scheduled_date'),
    supabase
      .from('jobs')
      .select('job_number, end_customers(name), machines(model), serial_number, staff(name)')
      .eq('status', 'runup_pending')
      .limit(20),
    supabase
      .from('inventory')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true),
    supabase
      .from('billing_cycles')
      .select('cycle_name, period_end, grand_total, client_id, clients(name)')
      .eq('status', 'open')
      .limit(5),
  ])

  return { todayJobs, pendingRunups, soh, openCycles }
}

async function handleAction(action: string, params: Record<string, string>) {
  if (action === 'update_job_status') {
    const { job_number, status } = params
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
  const today = new Date().toLocaleDateString('en-AU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Australia/Sydney' })

  const systemPrompt = `You are the Honor Logistics assistant bot for Honor Removals & Logistics, a printer delivery and logistics company in Mortdale, NSW.

Today is ${today} (Sydney time).

CURRENT DATA:
- Jobs today (${ctx.todayJobs?.length ?? 0}): ${JSON.stringify(ctx.todayJobs?.slice(0, 10))}
- Pending run-ups (${ctx.pendingRunups?.length ?? 0}): ${JSON.stringify(ctx.pendingRunups?.slice(0, 5))}
- Active inventory units: ${ctx.soh}
- Open billing cycles: ${JSON.stringify(ctx.openCycles)}

CAPABILITIES:
- Answer questions about jobs, stock, deliveries, run-ups, billing
- Update job status: when asked to mark a job as dispatched/complete/etc, output a JSON action block like: ACTION:{"action":"update_job_status","job_number":"HRL-2026-0001","status":"dispatched"}
- Give summaries of what's on today, what's pending, what needs attention

RULES:
- Keep replies concise and practical — these are warehouse/driver staff reading on phones
- Use emojis sparingly but helpfully (✅ ⚠️ 🚚 📦)
- If you don't have enough data to answer, say so clearly
- Don't make up job details you don't have
- The person talking to you is: ${senderName}`

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
      max_tokens: 500,
      temperature: 0.3,
    }),
  })

  const data = await response.json()
  return data.choices?.[0]?.message?.content ?? 'Sorry, I could not process that request.'
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const message = body.message || body.edited_message
    if (!message) return NextResponse.json({ ok: true })

    const chatId: number = message.chat.id
    const text: string = message.text ?? ''
    const messageId: number = message.message_id
    const senderName: string = message.from?.first_name ?? 'Staff'
    const isGroup = message.chat.type !== 'private'

    // In groups, only respond when @mentioned or /command used
    const isMentioned = text.includes(`@${BOT_USERNAME}`)
    const isCommand = text.startsWith('/')

    if (isGroup && !isMentioned && !isCommand) {
      return NextResponse.json({ ok: true })
    }

    // Strip bot mention from text
    const cleanText = text.replace(`@${BOT_USERNAME}`, '').trim()

    // Handle /help or empty mention
    if (!cleanText || cleanText === '/help' || cleanText === '/start') {
      await sendMessage(chatId, `👋 *Honor Logistics Assistant*\n\nHere's what I can do:\n\n📋 *Jobs* — "What jobs are on today?"\n🔧 *Run-Ups* — "Any pending run-ups?"\n📦 *Stock* — "How many units in storage?"\n🚚 *Update* — "Mark HRL-0023 as dispatched"\n💰 *Billing* — "What's in the open billing cycle?"\n\nIn the group, just mention me: @${BOT_USERNAME}`, messageId)
      return NextResponse.json({ ok: true })
    }

    // Send typing indicator
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendChatAction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, action: 'typing' }),
    })

    // Get context and ask GPT
    const ctx = await getContext()
    let reply = await askGPT(cleanText, ctx, senderName)

    // Check for ACTION block and execute
    const actionMatch = reply.match(/ACTION:(\{.*?\})/s)
    if (actionMatch) {
      try {
        const actionParams = JSON.parse(actionMatch[1])
        const actionResult = await handleAction(actionParams.action, actionParams)
        reply = reply.replace(/ACTION:\{.*?\}/s, '').trim()
        if (actionResult) reply = (reply ? reply + '\n\n' : '') + actionResult
      } catch { /* ignore parse errors */ }
    }

    await sendMessage(chatId, reply, messageId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Telegram webhook error:', err)
    return NextResponse.json({ ok: true })
  }
}
