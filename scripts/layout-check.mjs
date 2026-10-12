// Проверка вёрстки через DevTools Protocol: эмулирует вьюпорт, ищет
// горизонтальный переполнение и снимает скриншоты. Не часть приложения.
//
//   node scripts/layout-check.mjs http://localhost:8790/match/9040683473 390
//   node scripts/layout-check.mjs <url> <width> <height> [outPrefix] [cssSelector] [clickText]

import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'

const CHROME = [
  join(homedir(), 'AppData/Local/Google/Chrome/Application/chrome.exe'),
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find((p) => existsSync(p))

const [url = 'http://localhost:8790/', width = '390', height = '844', prefix = 'check', SELECTOR = '', CLICK = '', SCHEME = ''] = process.argv.slice(2)
const PORT = 9333

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${mkdtempSync(join(tmpdir(), 'lcheck-'))}`,
  `--window-size=${width},${height}`,
  'about:blank',
], { stdio: 'ignore' })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function connect() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()
      return list.webSocketDebuggerUrl
    } catch { await sleep(250) }
  }
  throw new Error('Chrome did not start')
}

const socket = new WebSocket(await connect())
await new Promise((r) => socket.addEventListener('open', r, { once: true }))

let nextId = 1
const waiting = new Map()
socket.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data)
  if (msg.id && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id) }
})

function send(method, params = {}, sessionId) {
  const id = nextId++
  return new Promise((resolve) => {
    waiting.set(id, (msg) => resolve(msg.result ?? msg))
    socket.send(JSON.stringify({ id, method, params, sessionId }))
  })
}

const { targetInfos } = await send('Target.getTargets')
const page = targetInfos.find((t) => t.type === 'page')
const { sessionId } = await send('Target.attachToTarget', { targetId: page.targetId, flatten: true })
const call = (method, params = {}) => send(method, params, sessionId)

await call('Page.enable')
if (SCHEME) await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: SCHEME }] })
await call('Page.navigate', { url })
await sleep(2500)
await call('Emulation.setDeviceMetricsOverride', { width: Number(width), height: Number(height), deviceScaleFactor: 1, mobile: false, scale: 1 })
await sleep(1200)
if (CLICK) {
  await call('Runtime.evaluate', {
    expression: `document.querySelector(${JSON.stringify(CLICK)})?.click()`,
  })
  await sleep(1400)
}

const probe = await call('Runtime.evaluate', {
  returnByValue: true,
  expression: `(() => {
    const doc = document.documentElement;
    const inScroller = (el) => {
      for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
        const ox = getComputedStyle(n).overflowX;
        if (ox === 'auto' || ox === 'scroll') return true;
      }
      return false;
    };
    const wide = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0) continue;
      if ((r.right > window.innerWidth + 1 || r.left < -1) && !inScroller(el)) {
        const cls = typeof el.className === 'string' ? el.className.split(/\\s+/).filter(Boolean).slice(0,3).join('.') : '';
        wide.push({ tag: el.tagName.toLowerCase(), cls, left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width) });
      }
    }
    const fonts = [...new Set([...document.querySelectorAll('h1,.board-score,.section-title,body')]
      .map((n) => getComputedStyle(n).fontFamily.split(',')[0].replace(/["']/g, '')))];
    return {
      innerWidth: window.innerWidth,
      scrollWidth: doc.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      overflow: doc.scrollWidth > window.innerWidth + 1,
      offenders: wide.slice(0, 14),
      fonts,
      contrast: {
        ink: getComputedStyle(document.body).color,
        bg: getComputedStyle(doc).getPropertyValue('--void').trim(),
      },
    };
  })()`,
})

console.log(JSON.stringify(probe.result?.value ?? probe, null, 2))

const shot = await call('Page.captureScreenshot', {
  format: 'png',
  captureBeyondViewport: !SELECTOR,
})
if (SELECTOR) {
  const box = await call('Runtime.evaluate', {
    returnByValue: true,
    expression: `(() => { const r = document.querySelector(${JSON.stringify(SELECTOR)})?.getBoundingClientRect(); return r ? { x: r.x, y: r.y + scrollY, width: r.width, height: r.height } : null })()`,
  })
  const b = box.result?.value
  if (b) {
    const clipped = await call('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: true,
      clip: { x: b.x, y: b.y, width: b.width, height: Math.min(b.height, 1400), scale: 1 },
    })
    const out = `.verification/${prefix}-${width}.png`
    writeFileSync(out, Buffer.from(clipped.data, 'base64'))
    console.log('screenshot:', out)
  } else {
    console.log('selector not found:', SELECTOR)
  }
} else if (shot.data) {
  const out = `.verification/${prefix}-${width}.png`
  writeFileSync(out, Buffer.from(shot.data, 'base64'))
  console.log('screenshot:', out)
}

socket.close()
chrome.kill()
process.exit(0)
