import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

  const { userId } = req.body
  if (!userId) return res.status(400).json({ error: 'Missing userId' })

  try {
    // Get current profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('subscription_status, stripe_customer_id, subscription_id')
      .eq('id', userId)
      .single()

    const customerId = profile?.stripe_customer_id
    const subscriptionId = profile?.subscription_id

    // If no Stripe customer, they're free
    if (!customerId) {
      return res.status(200).json({ status: 'free', isPro: false })
    }

    // Verify directly with Stripe
    let stripeStatus = 'free'
    try {
      if (subscriptionId) {
        const sub = await stripe.subscriptions.retrieve(subscriptionId)
        stripeStatus = sub.status // active, trialing, past_due, canceled, etc
      } else {
        // Look up by customer
        const subs = await stripe.subscriptions.list({ customer: customerId, limit: 1 })
        if (subs.data.length > 0) stripeStatus = subs.data[0].status
      }
    } catch (stripeErr) {
      // Stripe lookup failed - use DB value as fallback
      stripeStatus = profile?.subscription_status || 'free'
    }

    // Sync to database
    const isPro = ['active', 'trialing'].includes(stripeStatus)
    await supabase.from('profiles').update({
      subscription_status: stripeStatus,
      subscription_updated_at: new Date().toISOString()
    }).eq('id', userId)

    return res.status(200).json({ status: stripeStatus, isPro })
  } catch (err) {
    console.error('Verify subscription error:', err)
    return res.status(500).json({ error: err.message })
  }
}
