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
    // 1. Get their Stripe customer ID and subscription
    const { data: profile } = await supabase
      .from('profiles')
      .select('stripe_customer_id, subscription_id, subscription_status')
      .eq('id', userId)
      .single()

    // 2. Cancel Stripe subscription immediately if active
    if (profile?.subscription_id) {
      try {
        await stripe.subscriptions.cancel(profile.subscription_id)
        console.log('Cancelled subscription:', profile.subscription_id)
      } catch (stripeErr) {
        console.warn('Could not cancel subscription (may already be cancelled):', stripeErr.message)
      }
    }

    // 3. Also cancel any other active subscriptions on the customer
    if (profile?.stripe_customer_id) {
      try {
        const subs = await stripe.subscriptions.list({
          customer: profile.stripe_customer_id,
          status: 'active'
        })
        for (const sub of subs.data) {
          await stripe.subscriptions.cancel(sub.id)
        }
        // Also check trialing
        const trialing = await stripe.subscriptions.list({
          customer: profile.stripe_customer_id,
          status: 'trialing'
        })
        for (const sub of trialing.data) {
          await stripe.subscriptions.cancel(sub.id)
        }
      } catch (e) {
        console.warn('Could not list/cancel customer subscriptions:', e.message)
      }
    }

    // 4. Delete all user data from Supabase
    await supabase.from('transactions').delete().eq('user_id', userId)
    await supabase.from('categories').delete().eq('user_id', userId)
    await supabase.from('budgets').delete().eq('user_id', userId)
    await supabase.from('profiles').delete().eq('id', userId)

    // 5. Delete auth user (requires service role)
    const { error: authErr } = await supabase.auth.admin.deleteUser(userId)
    if (authErr) {
      console.error('Could not delete auth user:', authErr.message)
      return res.status(500).json({ error: 'Could not delete account: ' + authErr.message })
    }

    return res.status(200).json({ success: true })
  } catch (err) {
    console.error('Delete account error:', err)
    return res.status(500).json({ error: err.message })
  }
}
