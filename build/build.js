#!/usr/bin/env node
const fs = require('fs')
const path = require('path')
const JavaScriptObfuscator = require('javascript-obfuscator')

const SRC = process.env.SRC || 'C:\\Users\\clxmp\\Desktop\\finance-assistant'
const DIST = path.join(__dirname, 'dist')

const JS_TO_OBFUSCATE = ['Supabase.js']
const EXT_JS_TO_OBFUSCATE = ['extension/content.js', 'extension/popup.js']
const COPY_AS_IS = [
  'index.html','login.html','setup.html','account.html','charts.html',
  'reports.html','planner.html','auth-confirm.html','terms.html','privacy.html',
  'api/chat.js','extension/popup.html','extension/manifest.json','extension/icons',
]

const OBFUSCATOR_OPTIONS = {
  compact: true,
  controlFlowFlattening: true,
  controlFlowFlatteningThreshold: 0.4,
  deadCodeInjection: true,
  deadCodeInjectionThreshold: 0.2,
  debugProtection: false,
  disableConsoleOutput: false,
  identifierNamesGenerator: 'hexadecimal',
  renameGlobals: false,
  rotateStringArray: true,
  selfDefending: false,
  shuffleStringArray: true,
  splitStrings: true,
  splitStringsChunkLength: 10,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.75,
  transformObjectKeys: false,
  unicodeEscapeSequence: false,
}

function ensureDir(d) { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }) }

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) { console.warn(`  ⚠ Not found: ${src}`); return }
  const stat = fs.statSync(src)
  if (stat.isDirectory()) {
    ensureDir(dest)
    fs.readdirSync(src).forEach(f => copyRecursive(path.join(src, f), path.join(dest, f)))
  } else {
    ensureDir(path.dirname(dest))
    fs.copyFileSync(src, dest)
  }
}

function obfuscateFile(srcPath, destPath) {
  if (!fs.existsSync(srcPath)) { console.warn(`  ⚠ Not found: ${srcPath}`); return }
  const code = fs.readFileSync(srcPath, 'utf8')
  try {
    const result = JavaScriptObfuscator.obfuscate(code, OBFUSCATOR_OPTIONS)
    ensureDir(path.dirname(destPath))
    fs.writeFileSync(destPath, result.getObfuscatedCode())
    const o = (code.length/1024).toFixed(1), n = (result.getObfuscatedCode().length/1024).toFixed(1)
    console.log(`  ✓ ${path.basename(srcPath)}  ${o}kb → ${n}kb`)
  } catch (err) {
    console.error(`  ✗ Failed: ${srcPath}:`, err.message)
    fs.copyFileSync(srcPath, destPath)
  }
}

console.log('\n🌊 Flo build starting...\n')
if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true })
ensureDir(DIST); ensureDir(path.join(DIST,'api')); ensureDir(path.join(DIST,'extension'))

console.log('📋 Copying static files...')
COPY_AS_IS.forEach(file => {
  copyRecursive(path.join(SRC, file), path.join(DIST, file))
  if (fs.existsSync(path.join(SRC, file))) console.log(`  ✓ ${file}`)
})

console.log('\n🔒 Obfuscating JS...')
JS_TO_OBFUSCATE.forEach(f => obfuscateFile(path.join(SRC, f), path.join(DIST, f)))

console.log('\n🔒 Obfuscating extension JS...')
EXT_JS_TO_OBFUSCATE.forEach(f => obfuscateFile(path.join(SRC, f), path.join(DIST, f)))

console.log('\n✅ Build complete! Output:', DIST)
console.log('Deploy the dist/ contents to Vercel, use dist/extension/ in Edge/Chrome\n')
