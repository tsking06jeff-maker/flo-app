// ── Config ── UPDATE THESE WITH YOUR VALUES
const SUPABASE_URL = 'https://vtcsqcvjjlnbkqsdhrer.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0Y3NxY3ZqamxuYmtxc2RocmVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NzY5NjksImV4cCI6MjA5MTE1Mjk2OX0.j6DUpG__NLmNNqXXJp54ogA0-PsQBx4NUj3YDBWqWqU'
const FLO_API_URL = 'https://flo-app-rosy.vercel.app/index.html' // e.g. https://flo-app.vercel.app

// ── Supabase helpers ──
async function supabaseRequest(path, options = {}) {
  const session = await getSession()
  const headers = {
    'Content-Type': 'application/json',
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${session?.access_token || SUPABASE_ANON_KEY}`,
    ...options.headers
  }
  const res = await fetch(SUPABASE_URL + path, { ...options, headers })
  return res.json()
}

async function signIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
    body: JSON.stringify({ email, password })
  })
  return res.json()
}

async function getSession() {
  return new Promise(resolve => chrome.storage.local.get(['flo_session'], r => resolve(r.flo_session || null)))
}

async function saveSession(session) {
  return new Promise(resolve => chrome.storage.local.set({ flo_session: session }, resolve))
}

async function clearSession() {
  return new Promise(resolve => chrome.storage.local.remove(['flo_session'], resolve))
}

// ── State ──
let enabled = true
let currentSession = null
let currentProduct = null

// ── Init ──
async function init() {
  const stored = await new Promise(resolve => chrome.storage.local.get(['flo_enabled', 'flo_session'], resolve))
  enabled = stored.flo_enabled !== false
  currentSession = stored.flo_session || null

  // Sync toggles
  document.getElementById('enabled-toggle').checked = enabled
  document.getElementById('settings-toggle').checked = enabled
  updateToggleLabel()

  if (!currentSession) {
    showScreen('login')
    return
  }

  // Show toggle and settings
  document.getElementById('toggle-wrap').style.display = 'flex'

  if (!enabled) {
    showScreen('disabled')
    return
  }

  showScreen('main')
  await loadMainScreen()
}

async function loadMainScreen() {
  const productArea = document.getElementById('product-area')
  const aiArea = document.getElementById('ai-area')
  const budgetArea = document.getElementById('budget-area')

  productArea.innerHTML = '<div style="color:#64748b;font-size:0.78rem;padding:8px 0;">Detecting product...</div>'
  aiArea.innerHTML = ''
  budgetArea.innerHTML = ''

  // Detect product from current tab
  let product = null
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    product = await chrome.tabs.sendMessage(tab.id, { type: 'GET_PRODUCT' })
    currentProduct = product
  } catch (e) {
    currentProduct = null
  }

  if (!product || !product.price) {
    productArea.innerHTML = `
      <div class="no-product">
        <div class="no-product-icon">🛍</div>
        <div class="no-product-text">Browse a product page on Amazon, Walmart, Target, eBay, or Best Buy to get smart spending advice.</div>
      </div>`
    loadBudgetSummary()
    return
  }

  // Show product
  productArea.innerHTML = `
    <div class="product-card">
      <div class="product-site">${product.site || 'Product'}</div>
      ${product.title ? `<div class="product-title">${product.title}</div>` : ''}
      <div class="product-price">${product.price}</div>
    </div>`

  // Show analyze button
  aiArea.innerHTML = `<button class="btn-analyze" id="analyze-btn" onclick="analyzeProduct()">Should I buy this? →</button>`

  loadBudgetSummary()
}

async function loadBudgetSummary() {
  if (!currentSession) return
  const budgetArea = document.getElementById('budget-area')

  try {
    const budgets = await supabaseRequest(
      `/rest/v1/budgets?user_id=eq.${currentSession.user.id}&limit=1&select=income,savings_goal`
    )
    const txns = await supabaseRequest(
      `/rest/v1/transactions?user_id=eq.${currentSession.user.id}&select=amount`
    )

    const budget = budgets?.[0]
    if (!budget) return

    const spent = txns?.reduce((s, t) => s + Number(t.amount), 0) || 0
    const remaining = budget.income - budget.savings_goal - spent

    budgetArea.innerHTML = `
      <div class="budget-bar">
        <div class="budget-item">
          <div class="budget-val">$${Number(budget.income).toLocaleString()}</div>
          <div class="budget-lbl">Income</div>
        </div>
        <div class="divider-v"></div>
        <div class="budget-item">
          <div class="budget-val">$${Math.round(spent).toLocaleString()}</div>
          <div class="budget-lbl">Spent</div>
        </div>
        <div class="divider-v"></div>
        <div class="budget-item">
          <div class="budget-val ${remaining >= 0 ? 'green' : 'red'}">$${Math.abs(Math.round(remaining)).toLocaleString()}</div>
          <div class="budget-lbl">${remaining >= 0 ? 'Left' : 'Over'}</div>
        </div>
      </div>`
  } catch (e) {
    console.error('Budget load error', e)
  }
}

async function analyzeProduct() {
  if (!currentProduct || !currentProduct.price) return

  const aiArea = document.getElementById('ai-area')
  aiArea.innerHTML = '<div class="ai-result loading">Asking Flo AI...</div>'

  const btn = document.getElementById('analyze-btn')
  if (btn) btn.disabled = true

  try {
    // Get full financial context
    const [budgets, categories, txns] = await Promise.all([
      supabaseRequest(`/rest/v1/budgets?user_id=eq.${currentSession.user.id}&limit=1`),
      supabaseRequest(`/rest/v1/categories?user_id=eq.${currentSession.user.id}`),
      supabaseRequest(`/rest/v1/transactions?user_id=eq.${currentSession.user.id}&select=amount,categories(name)&order=created_at.desc&limit=20`)
    ])

    const budget = budgets?.[0]
    const totalSpent = txns?.reduce((s, t) => s + Number(t.amount), 0) || 0
    const remaining = budget ? budget.income - budget.savings_goal - totalSpent : 0
    const bycat = {}
    txns?.forEach(t => {
      const n = t.categories?.name || 'Misc'
      bycat[n] = (bycat[n] || 0) + Number(t.amount)
    })

    const system = `You are Flo, a concise AI financial advisor embedded in a browser extension. The user is considering a purchase while shopping online.

User's financial data:
- Monthly income: $${budget?.income || 0}
- Savings goal: $${budget?.savings_goal || 0}/mo
- Total spent this month: $${totalSpent.toFixed(2)}
- Remaining budget: $${remaining.toFixed(2)}
- Categories: ${categories?.map(c => c.name + ' $' + c.budget).join(', ') || 'none'}
- Spending by category: ${Object.entries(bycat).map(([k, v]) => k + ' $' + v.toFixed(2)).join(', ') || 'none yet'}

The user is looking at: ${currentProduct.title || 'a product'} priced at ${currentProduct.price} on ${currentProduct.site}.

Give a direct YES or NO verdict first (one word, all caps), then 1-2 sentences explaining why. Consider their remaining budget, savings goals, and spending patterns. Be honest but friendly.`

    const res = await fetch(`${FLO_API_URL}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentSession.access_token}`
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        system,
        messages: [{ role: 'user', content: `Should I buy this ${currentProduct.price} item?` }]
      })
    })

    const data = await res.json()
    const reply = data.content?.[0]?.text || 'Could not get a response.'

    // Determine sentiment
    const upper = reply.toUpperCase()
    const isYes = upper.startsWith('YES') || upper.includes('GO AHEAD') || upper.includes('GOOD BUY')
    const isNo = upper.startsWith('NO') || upper.includes('SKIP') || upper.includes('AVOID') || upper.includes('DON\'T')

    const cls = isYes ? 'yes' : isNo ? 'no' : 'neutral'
    const icon = isYes ? '✓' : isNo ? '✗' : '→'
    const verdict = isYes ? 'Go for it' : isNo ? 'Skip it' : 'Consider this'

    aiArea.innerHTML = `
      <div class="ai-result ${cls}">
        <div class="ai-verdict"><span>${icon}</span> ${verdict}</div>
        ${reply}
      </div>
      <button class="btn-analyze" onclick="analyzeProduct()">Ask again</button>`

  } catch (err) {
    aiArea.innerHTML = `
      <div class="ai-result neutral">Couldn't reach Flo. Make sure you're connected.</div>
      <button class="btn-analyze" onclick="analyzeProduct()">Try again</button>`
  }
}

// ── Login ──
async function doLogin() {
  const email = document.getElementById('login-email').value.trim()
  const password = document.getElementById('login-password').value
  const msg = document.getElementById('login-msg')
  const btn = document.getElementById('login-btn')

  if (!email || !password) { msg.textContent = 'Please fill in both fields.'; return }

  btn.disabled = true
  btn.textContent = 'Signing in...'
  msg.textContent = ''

  try {
    const data = await signIn(email, password)
    if (data.error) { msg.textContent = data.error.message || 'Sign in failed.'; btn.disabled = false; btn.textContent = 'Sign in'; return }

    currentSession = data
    await saveSession(data)

    document.getElementById('toggle-wrap').style.display = 'flex'
    document.getElementById('settings-email').textContent = email
    showScreen('main')
    await loadMainScreen()
  } catch (e) {
    msg.textContent = 'Connection error. Try again.'
    btn.disabled = false
    btn.textContent = 'Sign in'
  }
}

// ── Sign out ──
async function doSignout() {
  await clearSession()
  currentSession = null
  document.getElementById('toggle-wrap').style.display = 'none'
  document.getElementById('login-email').value = ''
  document.getElementById('login-password').value = ''
  showScreen('login')
}

// ── Toggle ──
function updateToggleLabel() {
  document.getElementById('toggle-label').textContent = enabled ? 'On' : 'Off'
}

document.getElementById('enabled-toggle').addEventListener('change', async function() {
  enabled = this.checked
  document.getElementById('settings-toggle').checked = enabled
  updateToggleLabel()
  await new Promise(resolve => chrome.storage.local.set({ flo_enabled: enabled }, resolve))
  if (!currentSession) return
  if (enabled) { showScreen('main'); await loadMainScreen() }
  else showScreen('disabled')
})

document.getElementById('settings-toggle').addEventListener('change', async function() {
  enabled = this.checked
  document.getElementById('enabled-toggle').checked = enabled
  updateToggleLabel()
  await new Promise(resolve => chrome.storage.local.set({ flo_enabled: enabled }, resolve))
})

// ── Settings ──
document.getElementById('settings-btn').addEventListener('click', () => {
  const current = document.querySelector('.screen.active')?.id
  if (current === 'screen-settings') {
    showScreen(currentSession ? 'main' : 'login')
  } else {
    if (currentSession) {
      document.getElementById('settings-email').textContent = currentSession.user?.email || '—'
    }
    showScreen('settings')
  }
})

function openDashboard() {
  chrome.tabs.create({ url: FLO_API_URL })
}

// ── Screen helper ──
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'))
  document.getElementById('screen-' + name).classList.add('active')
}

// ── Keyboard shortcut (Enter to login) ──
document.getElementById('login-password').addEventListener('keydown', e => {
  if (e.key === 'Enter') doLogin()
})

// ── Expose globals for onclick handlers ──
window.doLogin = doLogin
window.doSignout = doSignout
window.analyzeProduct = analyzeProduct
window.openDashboard = openDashboard
window.showScreen = showScreen

// ── Start ──
init()
