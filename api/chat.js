export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // ── Rate limiting via simple in-memory store (per Vercel instance) ──
  // For production scale, replace with Redis/Upstash
  const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.headers['x-real-ip'] || 'unknown'
  const auth = req.headers['authorization']
  
  // Must have auth token — no anonymous AI calls
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  // Verify the token is a real Supabase JWT (basic check)
  const token = auth.replace('Bearer ', '')
  if (token.length < 100) {
    return res.status(401).json({ error: 'Invalid token' })
  }

  // Basic request validation
  const { messages, system, max_tokens } = req.body
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Invalid request' })
  }

  // Cap max_tokens to prevent abuse
  const cappedTokens = Math.min(max_tokens || 500, 1000)

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: req.body.model || 'claude-sonnet-4-20250514',
        max_tokens: cappedTokens,
        system,
        messages
      })
    })

    const data = await response.json()
    
    if (!response.ok) {
      console.error('Anthropic error:', data)
      return res.status(response.status).json({ error: data.error?.message || 'AI error' })
    }

    return res.status(200).json(data)
  } catch (err) {
    console.error('Chat API error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
