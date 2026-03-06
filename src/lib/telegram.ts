export async function sendTelegramAlert(text: string) {
  const token = process.env.HONOR_BOT_TOKEN
  const chatId = process.env.HONOR_GROUP_CHAT_ID
  if (!token || !chatId) return
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
    })
  } catch { /* silent fail */ }
}
