import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'

export const config = { api: { bodyParser: false } }

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', chunk => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end()

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)

  const rawBody = await getRawBody(req)
  const sig = req.headers['stripe-signature']

  let event
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('Webhook signature error:', err.message)
    return res.status(400).json({ error: `Webhook error: ${err.message}` })
  }

  const data = event.data.object

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const userId = data.client_reference_id || data.metadata?.userId
        if (userId) {
          await supabase.from('profiles').upsert({
            id: userId,
            subscription_status: 'active',
            stripe_customer_id: data.customer,
            subscription_id: data.subscription,
            subscription_updated_at: new Date().toISOString()
          })
        }
        break
      }
      case 'customer.subscription.updated': {
        const customerId = data.customer
        const status = data.status
        const { data: profiles } = await supabase.from('profiles').select('id').eq('stripe_customer_id', customerId)
        if (profiles?.length) {
          await supabase.from('profiles').update({
            subscription_status: status,
            subscription_updated_at: new Date().toISOString()
          }).eq('stripe_customer_id', customerId)
        }
        break
      }
      case 'customer.subscription.deleted': {
        const customerId = data.customer
        await supabase.from('profiles').update({
          subscription_status: 'cancelled',
          subscription_updated_at: new Date().toISOString()
        }).eq('stripe_customer_id', customerId)
        break
      }
      case 'invoice.payment_failed': {
        const customerId = data.customer
        await supabase.from('profiles').update({
          subscription_status: 'past_due',
          subscription_updated_at: new Date().toISOString()
        }).eq('stripe_customer_id', customerId)
        break
      }
    }
  } catch (err) {
    console.error('Webhook handler error:', err)
  }

  return res.status(200).json({ received: true })
}
