#!/usr/bin/env node
// Automatically backfill every cached match and pick up newly cached matches.
// Run beside the API/parser: npm run replay:auto
import { readdir, readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const DATA = join(ROOT, 'data')
const INTERVAL = Math.max(30, Number(process.env.REPLAY_SCAN_SECONDS) || 120) * 1000
const TARGET = process.argv[2] && /^\d+$/.test(process.argv[2]) ? process.argv[2] : null
const retryAt = new Map()
const failures = new Map()

function run(file, id) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(ROOT, 'gc', file), id], { stdio: 'inherit', env: process.env })
    child.once('error', reject)
    child.once('exit', (code) => code === 0 ? resolve() : reject(new Error(`${file} exited ${code}`)))
  })
}

async function scan() {
  let ids = TARGET ? [TARGET] : (await readdir(join(DATA, 'matches'))).filter((f) => /^\d+\.json$/.test(f)).map((f) => f.slice(0, -5))
  ids.sort((a, b) => Number(b) - Number(a))
  let todo = 0
  for (const id of ids) {
    const path = join(DATA, 'matches', `${id}.json`)
    let match
    try { match = JSON.parse(await readFile(path, 'utf8')) } catch { continue }
    if (match.players?.length !== 10 || match.players.every((p) => Array.isArray(p.purchaseEvents))) continue
    todo++
    if ((retryAt.get(id) ?? 0) > Date.now()) continue
    try {
      const replayPath = join(DATA, 'replays', `${id}.json`)
      try { await readFile(replayPath) } catch { await run('parse-replay.mjs', id) }
      await run('normalize-replay.mjs', id)
      retryAt.delete(id); failures.delete(id)
      console.log(`READY ${id}`)
    } catch (error) {
      const count = (failures.get(id) ?? 0) + 1
      failures.set(id, count)
      retryAt.set(id, Date.now() + Math.min(6 * 60 * 60_000, 60_000 * 2 ** Math.min(count - 1, 8)))
      console.error(`RETRY ${id} in ${Math.round((retryAt.get(id) - Date.now()) / 1000)}s: ${error.message}`)
    }
  }
  console.log(`SCAN ${new Date().toISOString()} pending=${todo}`)
}

await scan()
if (!TARGET && process.argv.includes('--once')) process.exit(0)
if (!TARGET) setInterval(() => scan().catch((error) => console.error(`SCAN ERROR: ${error.message}`)), INTERVAL)
