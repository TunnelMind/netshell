#!/usr/bin/env node
/**
 * NetShell offline license generator.
 *
 * Generates a netshell-license.json that the app will accept without
 * contacting the license server. Drop the output file at:
 *   Windows:  %APPDATA%\NetShell\netshell-license.json
 *   macOS:    ~/Library/Application Support/NetShell/netshell-license.json
 *   Linux:    ~/.config/NetShell/netshell-license.json
 *
 * Usage:
 *   node scripts/keygen.js [key] [email] [tier] [years]
 *
 * Examples:
 *   node scripts/keygen.js                          # DEV-XXXX-XXXX-XXXX, free@dev, pro, 10yr
 *   node scripts/keygen.js JOSH-XXXX-XXXX-FREE josh@tunnelmind.ai pro 10
 *   node scripts/keygen.js BETA-XXXX-XXXX-0001 tester@example.com pro 2
 *
 * Private key is read from ~/.netshell-license.key (hex pkcs8 DER).
 * Set NETSHELL_LICENSE_KEY env var to override the key file path.
 */

const crypto = require('crypto')
const fs     = require('fs')
const path   = require('path')
const os     = require('os')

// ── Load private key ─────────────────────────────────────────────────────────

const keyFile = process.env.NETSHELL_LICENSE_KEY
  || path.join(os.homedir(), '.netshell-license.key')

if (!fs.existsSync(keyFile)) {
  console.error(`Private key not found at ${keyFile}`)
  console.error('Set NETSHELL_LICENSE_KEY env var or place key at ~/.netshell-license.key')
  process.exit(1)
}

const privHex = fs.readFileSync(keyFile, 'utf8').trim()
const privateKey = crypto.createPrivateKey({
  key: Buffer.from(privHex, 'hex'),
  format: 'der',
  type: 'pkcs8',
})

// ── Args ──────────────────────────────────────────────────────────────────────

const licenseKey = (process.argv[2] || randomKey()).toUpperCase()
const email      = process.argv[3] || 'dev@netshell.app'
const tier       = process.argv[4] || 'pro'
const years      = parseInt(process.argv[5] || '10', 10)

function randomKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const seg = () => Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  return `DEV-${seg()}-${seg()}-${seg()}`
}

// ── Build cert ────────────────────────────────────────────────────────────────

const now = Date.now()
const expiresAt = now + years * 365 * 24 * 60 * 60 * 1000

const cert = {
  email,
  expiresAt,
  graceDays: 365,          // very generous grace for dev builds
  issuedAt: now,
  key: licenseKey,
  seats: 99,
  tier,
}

// ── Sign ──────────────────────────────────────────────────────────────────────

function canonicalJson(obj) {
  return JSON.stringify(obj, Object.keys(obj).sort())
}

const sig = crypto
  .sign(null, Buffer.from(canonicalJson(cert)), privateKey)
  .toString('hex')

// ── Output ────────────────────────────────────────────────────────────────────

const stored = {
  activatedAt:   now,
  cert,
  lastCheckedAt: now,
  sig,
}

const outFile = path.join(process.cwd(), 'netshell-license.json')
fs.writeFileSync(outFile, JSON.stringify(stored, null, 2), 'utf8')

console.log(`\nLicense generated: ${outFile}`)
console.log(`  Key:     ${licenseKey}`)
console.log(`  Email:   ${email}`)
console.log(`  Tier:    ${tier}`)
console.log(`  Expires: ${new Date(expiresAt).toDateString()} (${years} years)`)
console.log(`\nDrop this file at:`)
console.log(`  Linux/Mac: ~/.config/NetShell/netshell-license.json`)
console.log(`  Windows:   %APPDATA%\\NetShell\\netshell-license.json`)
