// Flo subscription utility - source of truth for subscription status
// Import this on every page that needs to check Pro status

const CACHE_KEY = 'flo_sub_'
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export async function getSubscriptionStatus(supabase, userId) {
  // 1. Check sessionStorage cache first (fast, survives tab switches)
  const cacheKey = CACHE_KEY + userId
  const cached = sessionStorage.getItem(cacheKey)
  if (cached) {
    try {
      const { status, isPro, ts } = JSON.parse(cached)
      if (Date.now() - ts < CACHE_TTL) {
        return { status, isPro }
      }
    } catch {}
  }

  // 2. Read from Supabase profiles (source of truth)
  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_status')
    .eq('id', userId)
    .single()

  const status = profile?.subscription_status || 'free'
  const isPro = ['active', 'trialing'].includes(status)

  // 3. Cache in sessionStorage (persists across page navigations in same tab)
  sessionStorage.setItem(cacheKey, JSON.stringify({ status, isPro, ts: Date.now() }))

  return { status, isPro }
}

export function clearSubscriptionCache(userId) {
  if (userId) sessionStorage.removeItem(CACHE_KEY + userId)
  else {
    Object.keys(sessionStorage)
      .filter(k => k.startsWith(CACHE_KEY))
      .forEach(k => sessionStorage.removeItem(k))
  }
}
