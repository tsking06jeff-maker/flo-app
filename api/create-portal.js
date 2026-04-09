import Stripe from 'stripe'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const { customerId } = req.body
  if (!customerId) return res.status(400).json({ error: 'Missing customerId' })

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: 'https://flo-app-rosy.vercel.app/account.html'
    })
    return res.status(200).json({ url: session.url })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
