import 'dotenv/config'
import express from 'express'
import cors from 'cors'

const app = express()
app.use(cors({
  origin: '*',
  methods: ['POST', 'GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}))
app.use(express.json())
app.use(express.static('.'))

app.get('/', (req, res) => {
  res.sendFile(process.cwd() + '/index.html')
})

app.get('/test', (req, res) => {
  res.json({ ok: true })
})

app.post('/api/chat', async (req, res) => {
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(req.body)
    })
    const data = await response.json()
    console.log('Anthropic response:', JSON.stringify(data))
    res.json(data)
  } catch (err) {
    console.error('Server error:', err)
    res.status(500).json({ error: err.message })
  }
})

app.listen(3000, () => console.log('Running on http://localhost:3000'))