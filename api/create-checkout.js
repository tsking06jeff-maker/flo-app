import Stripe from 'stripe'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const { email, userId } = req.body
  if (!email || !userId) return res.status(400).json({ error: 'Missing email or userId' })

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      customer_email: email,
      client_reference_id: userId,
      success_url: `https://flo-app-rosy.vercel.app/subscribe-success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `https://flo-app-rosy.vercel.app/pricing.html?cancelled=true`,
      metadata: { userId, email },
      subscription_data: { metadata: { userId, email }, trial_period_days: 7 }
    })
    return res.status(200).json({ url: session.url })
  } catch (err) {
    console.error('Stripe error:', err)
    return res.status(500).json({ error: err.message })
  }
}
