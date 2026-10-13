// Быстрый CDP-пробник: node scripts/probe.mjs <url> <width> <js-выражение>
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'

const CHROME = [
  join(homedir(), 'AppData/Local/Google/Chrome/Application/chrome.exe'),
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p))

const [url, width = '390', expr = 'document.title'] = process.argv.slice(2)
const PORT = 9444

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'probe-'))}`,
  `--window-size=${width},844`, 'about:blank',
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const list = async () => { try { return (await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()).webSocketDebuggerUrl } catch { return null } }
let wsUrl = null
for (let i = 0; i < 60 && !wsUrl; i++) { wsUrl = await list(); if (!wsUrl) await sleep(250) }

const socket = new WebSocket(wsUrl)
await new Promise((r) => socket.addEventListener('open', r, { once: true }))
let nextId = 1
const waiting = new Map()
socket.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id) } })
const send = (method, params = {}, sessionId) => new Promise((resolve) => { const id = nextId++; waiting.set(id, (m) => resolve(m.result ?? m)); socket.send(JSON.stringify({ id, method, params, sessionId })) })

const { targetInfos } = await send('Target.getTargets')
const page = targetInfos.find((t) => t.type === 'page')
const { sessionId } = await send('Target.attachToTarget', { targetId: page.targetId, flatten: true })
const call = (m, p = {}) => send(m, p, sessionId)
await call('Page.enable')
await call('Page.navigate', { url })
await sleep(2500)
await call('Emulation.setDeviceMetricsOverride', { width: Number(width), height: 844, deviceScaleFactor: 1, mobile: false, scale: 1 })
await sleep(1200)
const r = await call('Runtime.evaluate', { returnByValue: true, expression: `(() => { ${expr} })()` })
console.log(JSON.stringify(r.result?.value ?? r, null, 2))
socket.close(); chrome.kill(); process.exit(0)
