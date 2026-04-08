# Flo — Smart Shopping Extension

A Chrome extension that tells you if a purchase is smart based on your Flo budget.

## Setup

### 1. Update your config
Open `popup.js` and update the three config values at the top:

```js
const SUPABASE_URL = 'https://your-project.supabase.co'
const SUPABASE_ANON_KEY = 'your-anon-key'
const FLO_API_URL = 'https://your-flo-app.vercel.app'
```

### 2. Add icons
Create a folder called `icons/` and add three PNG icons:
- `icon16.png` (16x16)
- `icon48.png` (48x48)  
- `icon128.png` (128x128)

You can use any simple icon or generate one at https://favicon.io

### 3. Load in Chrome
1. Open Chrome and go to `chrome://extensions`
2. Turn on **Developer mode** (top right toggle)
3. Click **Load unpacked**
4. Select this `flo-extension` folder
5. The Flo icon will appear in your toolbar

## How to use
1. Click the Flo icon in your toolbar
2. Sign in with your Flo account
3. Browse to any product on Amazon, Walmart, Target, eBay, or Best Buy
4. Click the Flo icon again
5. Hit "Should I buy this?" for an AI verdict based on your real budget

## Enable / Disable
Use the toggle in the top right of the popup to pause/resume the extension at any time.
