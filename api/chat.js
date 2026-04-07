import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)

const rateLimit = new Map()
const WINDOW_MS = 60 * 60 * 1000
const MAX_REQUESTS = 20

function checkRateLimit(userId) {
  const now = Date.now()
  if (!rateLimit.has(userId)) rateLimit.set(userId, [])
  const requests = rateLimit.get(userId).filter(t => now - t < WINDOW_MS)
  requests.push(now)
  rateLimit.set(userId, requests)
  return requests.length <= MAX_REQUESTS
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGIN || '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // 1. Auth check — verify Supabase session token
  const authHeader = req.headers.authorization
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const token = authHeader.replace('Bearer ', '')
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid session' })
  }

  // 2. Per-user rate limit
  if (!checkRateLimit(user.id)) {
    return res.status(429).json({ error: 'Too many requests. You can ask up to 20 questions per hour.' })
  }

  // 3. Input validation
  const { messages, system, model, max_tokens } = req.body

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Invalid request body' })
  }

  const lastMessage = messages[messages.length - 1]?.content || ''
  if (typeof lastMessage !== 'string' || lastMessage.length > 2000) {
    return res.status(400).json({ error: 'Message too long. Max 2000 characters.' })
  }

  if (system && system.length > 10000) {
    return res.status(400).json({ error: 'System prompt too long.' })
  }

  // 4. Sanitize — only allow expected fields through to Anthropic
  const safeBody = {
    model: 'claude-sonnet-4-20250514',
    max_tokens: Math.min(max_tokens || 1000, 1000),
    messages: messages.slice(-10).map(m => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: String(m.content).slice(0, 2000)
    }))
  }

  if (system) safeBody.system = String(system).slice(0, 10000)

  // 5. Call Anthropic
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(safeBody)
    })

    if (!response.ok) {
      const err = await response.json()
      console.error('Anthropic error:', err)
      return res.status(502).json({ error: 'AI service error. Please try again.' })
    }

    const data = await response.json()
    res.json(data)
  } catch (err) {
    console.error('Server error:', err.message)
    res.status(500).json({ error: 'Something went wrong. Please try again.' })
  }
}
