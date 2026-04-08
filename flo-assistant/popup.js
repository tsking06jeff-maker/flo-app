const SUPABASE_URL = 'https://vtcsqcvjjlnbkqsdhrer.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0Y3NxY3ZqamxuYmtxc2RocmVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NzY5NjksImV4cCI6MjA5MTE1Mjk2OX0.j6DUpG__NLmNNqXXJp54ogA0-PsQBx4NUj3YDBWqWqU'
const FLO_APP_URL = 'https://flo-app-rosy.vercel.app'
const FLO_API_URL = 'https://flo-app-rosy.vercel.app/api/chat'

let currentSession = null
let currentProduct = null
let enabled = true

const store = {
  get: keys => new Promise(r => chrome.storage.local.get(keys, r)),
  set: obj => new Promise(r => chrome.storage.local.set(obj, r)),
  remove: keys => new Promise(r => chrome.storage.local.remove(keys, r))
}

async function fetchUser(accessToken) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${accessToken}` }
  })
  return res.json()
}

async function refreshToken(refreshTk) {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ refresh_token: refreshTk })
    })
    const data = await res.json()
    if (!data.access_token) return null
    const user = await fetchUser(data.access_token)
    if (!user?.id) return null
    const session = { ...data, user }
    currentSession = session
    await store.set({ flo_session: session })
    return session
  } catch { return null }
}

async function db(path) {
  if (!currentSession) return []
  let res = await fetch(`${SUPABASE_URL}${path}`, {
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${currentSession.access_token}` }
  })
  if (res.status === 401) {
    const newSession = await refreshToken(currentSession.refresh_token)
    if (!newSession) { await store.remove(['flo_session']); currentSession = null; showScreen('login'); return [] }
    res = await fetch(`${SUPABASE_URL}${path}`, {
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${newSession.access_token}` }
    })
  }
  const data = await res.json()
  return Array.isArray(data) ? data : []
}

function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'))
  const el = document.getElementById('screen-' + name)
  if (el) el.classList.add('active')
}

function updateToggleLabel() {
  const label = document.getElementById('toggle-label')
  if (label) label.textContent = enabled ? 'On' : 'Off'
}

async function init() {
  const stored = await store.get(['flo_enabled', 'flo_session'])
  enabled = stored.flo_enabled !== false
  currentSession = stored.flo_session || null
  document.getElementById('enabled-toggle').checked = enabled
  document.getElementById('settings-toggle').checked = enabled
  updateToggleLabel()
  if (!currentSession) { showScreen('login'); return }
  if (!currentSession.user?.id) {
    const newSession = await refreshToken(currentSession.refresh_token)
    if (!newSession) { await store.remove(['flo_session']); currentSession = null; showScreen('login'); return }
  }
  document.getElementById('toggle-wrap').style.display = 'flex'
  if (!enabled) { showScreen('disabled'); return }
  showScreen('main')
  await loadMainScreen()
}

async function loadMainScreen() {
  const productArea = document.getElementById('product-area')
  const aiArea = document.getElementById('ai-area')
  const budgetArea = document.getElementById('budget-area')
  productArea.innerHTML = '<div style="color:#64748b;font-size:0.78rem;padding:8px 0;">Detecting product...</div>'
  aiArea.innerHTML = ''; budgetArea.innerHTML = ''
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    currentProduct = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PRODUCT' })
  } catch { currentProduct = null }
  if (!currentProduct?.price) {
    productArea.innerHTML = `<div class="no-product"><div class="no-product-icon">🛍</div><div class="no-product-text">Browse a product page on Amazon, Walmart, Target, eBay, or Best Buy to get advice.</div></div>`
    await loadBudgetSummary(budgetArea); return
  }
  productArea.innerHTML = `<div class="product-card"><div class="product-site">${currentProduct.site||'Product'}</div>${currentProduct.title?`<div class="product-title">${currentProduct.title}</div>`:''}<div class="product-price">${currentProduct.price}</div></div>`
  aiArea.innerHTML = `<button class="btn-analyze" id="analyze-btn">Should I buy this? →</button>`
  document.getElementById('analyze-btn').addEventListener('click', analyzeProduct)
  await loadBudgetSummary(budgetArea)
}

async function loadBudgetSummary(budgetArea) {
  const uid = currentSession?.user?.id; if (!uid) return
  const [budgets, txns] = await Promise.all([
    db(`/rest/v1/budgets?user_id=eq.${uid}&limit=1&select=income,savings_goal`),
    db(`/rest/v1/transactions?user_id=eq.${uid}&select=amount`)
  ])
  const budget = budgets[0]; if (!budget) return
  const spent = txns.reduce((s,t) => s+Number(t.amount), 0)
  const remaining = budget.income - budget.savings_goal - spent
  budgetArea.innerHTML = `<div class="budget-bar"><div class="budget-item"><div class="budget-val">$${Number(budget.income).toLocaleString()}</div><div class="budget-lbl">Income</div></div><div class="divider-v"></div><div class="budget-item"><div class="budget-val">$${Math.round(spent).toLocaleString()}</div><div class="budget-lbl">Spent</div></div><div class="divider-v"></div><div class="budget-item"><div class="budget-val ${remaining>=0?'green':'red'}">$${Math.abs(Math.round(remaining)).toLocaleString()}</div><div class="budget-lbl">${remaining>=0?'Left':'Over'}</div></div></div>`
}

async function analyzeProduct() {
  const uid = currentSession?.user?.id; if (!uid || !currentProduct?.price) return
  const aiArea = document.getElementById('ai-area')
  aiArea.innerHTML = '<div class="ai-result loading">Asking Flo AI...</div>'
  const [budgets, categories, txns] = await Promise.all([
    db(`/rest/v1/budgets?user_id=eq.${uid}&limit=1`),
    db(`/rest/v1/categories?user_id=eq.${uid}`),
    db(`/rest/v1/transactions?user_id=eq.${uid}&select=amount,categories(name)&order=created_at.desc&limit=20`)
  ])
  const budget = budgets[0]
  const totalSpent = txns.reduce((s,t) => s+Number(t.amount), 0)
  const remaining = budget ? budget.income - budget.savings_goal - totalSpent : 0
  const bycat = {}; txns.forEach(t => { const n=t.categories?.name||'Misc'; bycat[n]=(bycat[n]||0)+Number(t.amount) })
  const system = `You are Flo, a concise AI financial advisor in a browser extension.\nProduct: ${currentProduct.title||'a product'} — ${currentProduct.price} on ${currentProduct.site}\nIncome: $${budget?.income||0}/mo | Savings: $${budget?.savings_goal||0}/mo | Spent: $${totalSpent.toFixed(2)} | Remaining: $${remaining.toFixed(2)}\nCategories: ${categories.map(c=>c.name+' $'+c.budget).join(', ')||'none'}\nSpending: ${Object.entries(bycat).map(([k,v])=>k+' $'+v.toFixed(2)).join(', ')||'none'}\nStart with YES or NO. Then 1-2 short sentences. Be direct.`
  try {
    const res = await fetch(FLO_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${currentSession.access_token}` },
      body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 200, system, messages: [{ role: 'user', content: `Should I buy this ${currentProduct.price} item?` }] })
    })
    if (!res.ok) throw new Error(`${res.status}`)
    const data = await res.json()
    const reply = data.content?.[0]?.text || 'Could not get a response.'
    const upper = reply.toUpperCase()
    const isYes = upper.startsWith('YES'), isNo = upper.startsWith('NO')
    const cls = isYes?'yes':isNo?'no':'neutral'
    const icon = isYes?'✓ Go for it':isNo?'✗ Skip it':'→ Consider this'
    aiArea.innerHTML = `<div class="ai-result ${cls}"><div class="ai-verdict">${icon}</div>${reply.replace(/^(YES|NO)[.!,]?\s*/i,'')}</div><button class="btn-analyze" id="analyze-btn">Ask again</button>`
    document.getElementById('analyze-btn').addEventListener('click', analyzeProduct)
  } catch {
    aiArea.innerHTML = `<div class="ai-result neutral">Couldn't reach Flo. Check your connection.</div><button class="btn-analyze" id="analyze-btn">Try again</button>`
    document.getElementById('analyze-btn').addEventListener('click', analyzeProduct)
  }
}

async function doLogin() {
  const email = document.getElementById('login-email').value.trim()
  const password = document.getElementById('login-password').value
  const msg = document.getElementById('login-msg')
  const btn = document.getElementById('login-btn')
  if (!email || !password) { msg.textContent = 'Fill in both fields.'; return }
  btn.disabled = true; btn.textContent = 'Signing in...'; msg.textContent = ''
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
      body: JSON.stringify({ email, password })
    })
    const data = await res.json()
    if (!data.access_token) { msg.textContent = data.error_description||data.msg||'Sign in failed.'; btn.disabled=false; btn.textContent='Sign in'; return }
    const user = await fetchUser(data.access_token)
    if (!user?.id) { msg.textContent = 'Could not load profile. Try again.'; btn.disabled=false; btn.textContent='Sign in'; return }
    currentSession = { ...data, user }
    await store.set({ flo_session: currentSession })
    document.getElementById('toggle-wrap').style.display = 'flex'
    document.getElementById('settings-email').textContent = user.email || email
    showScreen('main'); await loadMainScreen()
  } catch { msg.textContent = 'Connection error. Try again.'; btn.disabled=false; btn.textContent='Sign in' }
}

async function doSignout() {
  await store.remove(['flo_session'])
  currentSession = null
  document.getElementById('toggle-wrap').style.display = 'none'
  document.getElementById('login-email').value = ''
  document.getElementById('login-password').value = ''
  document.getElementById('login-msg').textContent = ''
  showScreen('login')
}

function openDashboard() {
  chrome.tabs.create({ url: FLO_APP_URL + '/index.html' })
}

document.getElementById('enabled-toggle').addEventListener('change', async function() {
  enabled = this.checked; document.getElementById('settings-toggle').checked = enabled; updateToggleLabel()
  await store.set({ flo_enabled: enabled })
  if (!currentSession) return
  if (enabled) { showScreen('main'); await loadMainScreen() } else showScreen('disabled')
})

document.getElementById('settings-toggle').addEventListener('change', async function() {
  enabled = this.checked; document.getElementById('enabled-toggle').checked = enabled; updateToggleLabel()
  await store.set({ flo_enabled: enabled })
})

document.getElementById('settings-btn').addEventListener('click', () => {
  const active = document.querySelector('.screen.active')?.id
  if (active === 'screen-settings') { showScreen(currentSession ? 'main' : 'login') }
  else { if (currentSession) document.getElementById('settings-email').textContent = currentSession.user?.email||'—'; showScreen('settings') }
})

document.getElementById('login-password').addEventListener('keydown', e => { if (e.key==='Enter') doLogin() })

window.doLogin = doLogin
window.doSignout = doSignout
window.analyzeProduct = analyzeProduct
window.openDashboard = openDashboard
window.showScreen = showScreen

init()
