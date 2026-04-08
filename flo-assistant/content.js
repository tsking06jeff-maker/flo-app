// ── CONFIG — update these ──
const SUPABASE_URL = 'https://vtcsqcvjjlnbkqsdhrer.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ0Y3NxY3ZqamxuYmtxc2RocmVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1NzY5NjksImV4cCI6MjA5MTE1Mjk2OX0.j6DUpG__NLmNNqXXJp54ogA0-PsQBx4NUj3YDBWqWqU'
const FLO_API_URL = 'https://flo-app-rosy.vercel.app/index.html' // e.g. https://flo-app.vercel.app

const SHOPPING_SITES = ['amazon', 'walmart', 'target', 'ebay', 'bestbuy', 'etsy']
const host = window.location.hostname
const isShopping = SHOPPING_SITES.some(s => host.includes(s))

// Respond to popup requests
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'GET_PRODUCT') sendResponse(detectProduct())
  return true
})

if (isShopping) {
  if (document.readyState === 'complete') {
    setTimeout(initFloWidget, 1500)
  } else {
    window.addEventListener('load', () => setTimeout(initFloWidget, 1500))
  }
}

function detectProduct() {
  const result = { price: null, title: null, site: null }
  const h = window.location.hostname

  if (h.includes('amazon')) {
    result.site = 'Amazon'
    const t = document.getElementById('productTitle') || document.querySelector('h1')
    if (t) result.title = t.textContent.trim().slice(0, 100)
    const sels = ['#priceblock_ourprice','#priceblock_dealprice','#price_inside_buybox','.priceToPay .a-offscreen','#corePrice_feature_div .a-offscreen','.a-price .a-offscreen']
    for (const s of sels) { const el = document.querySelector(s); if (el) { const m = el.textContent.match(/\$[\d,]+\.?\d{0,2}/); if (m) { result.price = m[0]; break } } }
  } else if (h.includes('walmart')) {
    result.site = 'Walmart'
    const t = document.querySelector('h1[itemprop="name"]') || document.querySelector('h1')
    if (t) result.title = t.textContent.trim().slice(0, 100)
    const el = document.querySelector('[itemprop="price"]')
    if (el) { const v = el.getAttribute('content') || el.textContent; const m = v.match(/[\d,]+\.?\d{0,2}/); if (m) result.price = '$' + m[0] }
  } else if (h.includes('target')) {
    result.site = 'Target'
    const t = document.querySelector('h1[data-test="product-title"]') || document.querySelector('h1')
    if (t) result.title = t.textContent.trim().slice(0, 100)
    const el = document.querySelector('[data-test="product-price"]')
    if (el) { const m = el.textContent.match(/\$[\d,]+\.?\d{0,2}/); if (m) result.price = m[0] }
  } else if (h.includes('ebay')) {
    result.site = 'eBay'
    const t = document.querySelector('h1.x-item-title__mainTitle') || document.querySelector('h1')
    if (t) result.title = t.textContent.trim().slice(0, 100)
    const el = document.querySelector('.x-price-primary .ux-textspans')
    if (el) { const m = el.textContent.match(/\$[\d,]+\.?\d{0,2}/); if (m) result.price = m[0] }
  } else if (h.includes('bestbuy')) {
    result.site = 'Best Buy'
    const t = document.querySelector('.sku-title h1') || document.querySelector('h1')
    if (t) result.title = t.textContent.trim().slice(0, 100)
    const el = document.querySelector('.priceView-customer-price span')
    if (el) { const m = el.textContent.match(/\$[\d,]+\.?\d{0,2}/); if (m) result.price = m[0] }
  } else {
    result.site = h.replace('www.', '')
    const t = document.querySelector('h1')
    if (t) result.title = t.textContent.trim().slice(0, 100)
    const prices = document.body.innerText.match(/\$\d{1,4}(?:,\d{3})*(?:\.\d{2})?/g)
    if (prices) { const r = prices.find(p => { const n = parseFloat(p.replace(/[$,]/g, '')); return n > 0.99 && n < 50000 }); if (r) result.price = r }
  }
  return result
}

function getStorage(keys) {
  return new Promise(resolve => chrome.storage.local.get(keys, resolve))
}

function setStorage(obj) {
  return new Promise(resolve => chrome.storage.local.set(obj, resolve))
}

async function initFloWidget() {
  const stored = await getStorage(['flo_enabled', 'flo_session'])
  if (stored.flo_enabled === false) return

  const product = detectProduct()
  if (!product.price) return

  // Inject font
  const font = document.createElement('link')
  font.rel = 'stylesheet'
  font.href = 'https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600&display=swap'
  document.head.appendChild(font)

  // Inject styles
  const style = document.createElement('style')
  style.textContent = `
    #flo-widget { position:fixed;bottom:24px;right:24px;z-index:2147483647;font-family:'Sora',-apple-system,sans-serif;animation:flo-in 0.4s cubic-bezier(.16,1,.3,1); }
    @keyframes flo-in { from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)} }
    #flo-widget *{box-sizing:border-box;margin:0;padding:0;font-family:'Sora',-apple-system,sans-serif;}
    #flo-card{background:#fff;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,0.14);width:300px;overflow:hidden;border:1px solid #e2e8f0;}
    #flo-hdr{background:#0ea5e9;padding:10px 14px;display:flex;align-items:center;justify-content:space-between;}
    #flo-hdr-l{display:flex;align-items:center;gap:8px;}
    #flo-mark{width:22px;height:22px;background:rgba(255,255,255,0.25);border-radius:6px;display:flex;align-items:center;justify-content:center;}
    #flo-ttl{color:#fff;font-size:13px;font-weight:600;letter-spacing:.5px;}
    #flo-x{background:none;border:none;color:rgba(255,255,255,0.8);cursor:pointer;font-size:18px;line-height:1;padding:0 2px;}
    #flo-x:hover{color:#fff;}
    #flo-bd{padding:12px 14px;}
    #flo-price{font-size:22px;font-weight:600;color:#0ea5e9;letter-spacing:-.5px;}
    #flo-name{font-size:11px;color:#64748b;margin-top:2px;line-height:1.4;}
    #flo-analyze{width:100%;padding:10px;border-radius:8px;border:none;background:#0ea5e9;color:#fff;font-size:13px;font-weight:600;cursor:pointer;margin-top:10px;transition:background .15s;}
    #flo-analyze:hover{background:#0284c7;}
    #flo-analyze:disabled{background:#7dd3fc;cursor:not-allowed;}
    #flo-res{margin-top:10px;border-radius:10px;padding:10px 12px;font-size:12px;line-height:1.6;display:none;}
    #flo-res.yes{background:#f0fdf4;border:1px solid #bbf7d0;color:#166534;}
    #flo-res.no{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;}
    #flo-res.neutral{background:#f0faff;border:1px solid #bae6fd;color:#0c4a6e;}
    #flo-verdict{font-size:13px;font-weight:600;margin-bottom:3px;}
    #flo-bar{display:flex;justify-content:space-between;margin-top:10px;background:#f8fafc;border-radius:8px;padding:8px 10px;}
    .fb-item{text-align:center;}
    .fb-val{font-size:12px;font-weight:600;color:#0f172a;}
    .fb-val.green{color:#16a34a;}
    .fb-val.red{color:#dc2626;}
    .fb-lbl{font-size:10px;color:#94a3b8;margin-top:1px;text-transform:uppercase;letter-spacing:.04em;}
    #flo-login-area{padding:12px 14px;}
    #flo-login-ttl{font-size:13px;font-weight:600;margin-bottom:3px;}
    #flo-login-sub{font-size:11px;color:#64748b;margin-bottom:10px;}
    .flo-inp{width:100%;background:#f0faff;border:1.5px solid #e2e8f0;border-radius:8px;padding:8px 10px;font-size:12px;outline:none;margin-bottom:7px;color:#0f172a;}
    .flo-inp:focus{border-color:#38bdf8;}
    #flo-login-btn{width:100%;padding:10px;border-radius:8px;border:none;background:#0ea5e9;color:#fff;font-size:13px;font-weight:600;cursor:pointer;}
    #flo-login-btn:hover{background:#0284c7;}
    #flo-login-btn:disabled{background:#7dd3fc;cursor:not-allowed;}
    #flo-login-msg{font-size:11px;color:#dc2626;margin-top:6px;min-height:14px;}
    #flo-min{position:fixed;bottom:24px;right:24px;z-index:2147483647;background:#0ea5e9;border-radius:50%;width:48px;height:48px;display:none;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 16px rgba(14,165,233,.4);border:none;}
  `
  document.head.appendChild(style)

  const session = stored.flo_session

  const widget = document.createElement('div')
  widget.id = 'flo-widget'

  if (!session) {
    widget.innerHTML = `
      <div id="flo-card">
        <div id="flo-hdr"><div id="flo-hdr-l"><div id="flo-mark"><svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 7 Q5 3 7 7 Q9 11 12 7" stroke="white" stroke-width="2" fill="none" stroke-linecap="round"/></svg></div><span id="flo-ttl">FLO</span></div><button id="flo-x">×</button></div>
        <div id="flo-login-area">
          <div id="flo-login-ttl">Sign in to get advice</div>
          <div id="flo-login-sub">Use your Flo account for personalized recommendations</div>
          <input class="flo-inp" id="flo-email" type="email" placeholder="Email" />
          <input class="flo-inp" id="flo-pass" type="password" placeholder="Password" />
          <button id="flo-login-btn">Sign in</button>
          <div id="flo-login-msg"></div>
        </div>
      </div>`
  } else {
    widget.innerHTML = `
      <div id="flo-card">
        <div id="flo-hdr"><div id="flo-hdr-l"><div id="flo-mark"><svg width="14" height="14" viewBox="0 0 14 14"><path d="M2 7 Q5 3 7 7 Q9 11 12 7" stroke="white" stroke-width="2" fill="none" stroke-linecap="round"/></svg></div><span id="flo-ttl">FLO</span></div><button id="flo-x">×</button></div>
        <div id="flo-bd">
          <div id="flo-price">${product.price}</div>
          <div id="flo-name">${(product.title || product.site || '').slice(0, 65)}</div>
          <button id="flo-analyze">Should I buy this? →</button>
          <div id="flo-res"><div id="flo-verdict"></div><div id="flo-reason"></div></div>
          <div id="flo-bar">
            <div class="fb-item"><div class="fb-val" id="fb-spent">...</div><div class="fb-lbl">Spent</div></div>
            <div class="fb-item"><div class="fb-val" id="fb-left">...</div><div class="fb-lbl">Left</div></div>
            <div class="fb-item"><div class="fb-val" id="fb-income">...</div><div class="fb-lbl">Income</div></div>
          </div>
        </div>
      </div>`
  }

  document.body.appendChild(widget)

  // Minimize button
  const minBtn = document.createElement('button')
  minBtn.id = 'flo-min'
  minBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 20 20"><path d="M3 10 Q7 4 10 10 Q13 16 17 10" stroke="white" stroke-width="2.5" fill="none" stroke-linecap="round"/></svg>`
  document.body.appendChild(minBtn)

  // Close
  document.getElementById('flo-x').addEventListener('click', () => {
    widget.style.display = 'none'
    minBtn.style.display = 'flex'
  })

  // Restore
  minBtn.addEventListener('click', () => {
    widget.style.display = 'block'
    minBtn.style.display = 'none'
  })

  if (!session) {
    // Login handler
    document.getElementById('flo-login-btn').addEventListener('click', async () => {
      const email = document.getElementById('flo-email').value.trim()
      const pass = document.getElementById('flo-pass').value
      const msg = document.getElementById('flo-login-msg')
      const btn = document.getElementById('flo-login-btn')
      if (!email || !pass) { msg.textContent = 'Fill in both fields.'; return }
      btn.disabled = true; btn.textContent = 'Signing in...'
      try {
        const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': SUPABASE_ANON_KEY },
          body: JSON.stringify({ email, password: pass })
        })
        const data = await res.json()
        if (data.error) { msg.textContent = data.error.message || 'Failed.'; btn.disabled = false; btn.textContent = 'Sign in'; return }
        await setStorage({ flo_session: data })
        widget.remove(); minBtn.remove()
        await initFloWidget()
      } catch (e) { msg.textContent = 'Error. Try again.'; btn.disabled = false; btn.textContent = 'Sign in' }
    })

    document.getElementById('flo-pass').addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('flo-login-btn').click()
    })
  } else {
    // Load budget
    loadBudget(session)

    // Analyze button
    document.getElementById('flo-analyze').addEventListener('click', async () => {
      const btn = document.getElementById('flo-analyze')
      const res = document.getElementById('flo-res')
      btn.disabled = true; btn.textContent = 'Asking Flo...'
      res.style.display = 'none'

      try {
        const [budgets, categories, txns] = await Promise.all([
          fetch(`${SUPABASE_URL}/rest/v1/budgets?user_id=eq.${session.user.id}&limit=1`, { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${session.access_token}` } }).then(r => r.json()),
          fetch(`${SUPABASE_URL}/rest/v1/categories?user_id=eq.${session.user.id}`, { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${session.access_token}` } }).then(r => r.json()),
          fetch(`${SUPABASE_URL}/rest/v1/transactions?user_id=eq.${session.user.id}&select=amount,categories(name)&order=created_at.desc&limit=20`, { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${session.access_token}` } }).then(r => r.json())
        ])

        const budget = budgets?.[0]
        const totalSpent = txns?.reduce((s, t) => s + Number(t.amount), 0) || 0
        const remaining = budget ? budget.income - budget.savings_goal - totalSpent : 0
        const bycat = {}
        txns?.forEach(t => { const n = t.categories?.name || 'Misc'; bycat[n] = (bycat[n] || 0) + Number(t.amount) })

        const sys = `You are Flo, a concise AI financial advisor in a browser extension. The user is considering: ${product.title || 'a product'} priced at ${product.price} on ${product.site}.
Finances: Income $${budget?.income || 0}/mo | Savings goal $${budget?.savings_goal || 0}/mo | Spent $${totalSpent.toFixed(2)} | Remaining $${remaining.toFixed(2)}
Categories: ${categories?.map(c => c.name + ' $' + c.budget).join(', ') || 'none'}
Spending: ${Object.entries(bycat).map(([k,v]) => k + ' $' + v.toFixed(2)).join(', ') || 'none'}
Start with YES or NO. Then 1-2 short sentences. Be direct.`

        const aiRes = await fetch(`${FLO_API_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: 150, system: sys, messages: [{ role: 'user', content: `Should I buy this ${product.price} item?` }] })
        })

        const aiData = await aiRes.json()
        const reply = aiData.content?.[0]?.text || 'Could not get a response.'
        const up = reply.toUpperCase()
        const isYes = up.startsWith('YES')
        const isNo = up.startsWith('NO')
        const cls = isYes ? 'yes' : isNo ? 'no' : 'neutral'
        const icon = isYes ? '✓ Go for it' : isNo ? '✗ Skip it' : '→ Think about it'

        document.getElementById('flo-verdict').textContent = icon
        document.getElementById('flo-reason').textContent = reply.replace(/^(YES|NO)[.!,]?\s*/i, '')
        res.className = cls; res.style.display = 'block'
        btn.textContent = 'Ask again'; btn.disabled = false
      } catch (e) {
        document.getElementById('flo-verdict').textContent = 'Error'
        document.getElementById('flo-reason').textContent = 'Could not reach Flo. Try again.'
        res.className = 'neutral'; res.style.display = 'block'
        btn.textContent = 'Should I buy this? →'; btn.disabled = false
      }
    })
  }
}

async function loadBudget(session) {
  try {
    const [budgets, txns] = await Promise.all([
      fetch(`${SUPABASE_URL}/rest/v1/budgets?user_id=eq.${session.user.id}&limit=1`, { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${session.access_token}` } }).then(r => r.json()),
      fetch(`${SUPABASE_URL}/rest/v1/transactions?user_id=eq.${session.user.id}&select=amount`, { headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${session.access_token}` } }).then(r => r.json())
    ])
    const budget = budgets?.[0]
    const spent = txns?.reduce((s, t) => s + Number(t.amount), 0) || 0
    const remaining = budget ? budget.income - budget.savings_goal - spent : 0
    document.getElementById('fb-spent').textContent = '$' + Math.round(spent).toLocaleString()
    document.getElementById('fb-income').textContent = '$' + (budget?.income || 0).toLocaleString()
    const leftEl = document.getElementById('fb-left')
    leftEl.textContent = '$' + Math.abs(Math.round(remaining)).toLocaleString() + (remaining < 0 ? ' over' : '')
    leftEl.className = 'fb-val ' + (remaining >= 0 ? 'green' : 'red')
  } catch (e) { console.error('Flo budget error:', e) }
}
