#!/usr/bin/env node
// Fetch a known Valve replay and parse it with OpenDota's Dota-aware parser.
// Usage: node server/gc/parse-replay.mjs MATCH_ID [CLUSTER REPLAY_SALT]

import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'

const [matchId, suppliedCluster, suppliedSalt] = process.argv.slice(2)
const integer = (x) => /^\d+$/.test(x ?? '') && Number.isSafeInteger(Number(x))
if (!integer(matchId) || Boolean(suppliedCluster) !== Boolean(suppliedSalt) || (suppliedCluster && ![suppliedCluster,suppliedSalt].every(integer))) {
  console.error('Usage: node server/gc/parse-replay.mjs MATCH_ID [CLUSTER REPLAY_SALT]')
  process.exit(2)
}
let cluster = suppliedCluster, salt = suppliedSalt
if (!cluster) {
  const res = await fetch(`https://api.opendota.com/api/matches/${matchId}`, { signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw new Error(`Replay metadata HTTP ${res.status}`)
  const metadata = await res.json()
  cluster = String(metadata.cluster ?? '')
  salt = String(metadata.replay_salt ?? '')
  if (!integer(cluster) || !integer(salt)) throw new Error(`Replay cluster/salt not published for match ${matchId} yet`)
}
const parser = process.env.DOTA_PARSER_URL || 'http://127.0.0.1:5600'
const base = new URL(parser)
if (!['http:', 'https:'].includes(base.protocol)) throw new Error('DOTA_PARSER_URL must be HTTP(S)')
const replayUrl = `http://replay${cluster}.valve.net/570/${matchId}_${salt}.dem.bz2`
const timeout = AbortSignal.timeout(10 * 60_000)
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const outDir = join(root, 'data', 'replays')
await mkdir(outDir, { recursive: true })
const tmp = join(outDir, `${matchId}.json.tmp`)
const out = join(outDir, `${matchId}.json`)

// The /blob endpoint discards full-game coordinates. The same parser inside
// its existing container can preserve them before aggregation in one pass.
const run = (command, args) => new Promise((resolve, reject) => {
  const child = spawn(command, args, { stdio: 'inherit' })
  child.once('error', reject)
  child.once('exit', code => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)))
})
if (process.env.REPLAY_SPATIAL_CONTAINER) {
  const container = process.env.REPLAY_SPATIAL_CONTAINER
  const remote = `/tmp/spatial-${matchId}.json`
  await run('docker', ['exec', container, 'java', '-Xmx4g', '-cp', '/tmp/spatial:/usr/src/parser/target/stats-0.1.0.jar', 'opendota.SpatialReplay', replayUrl, remote])
  await run('docker', ['cp', `${container}:${remote}`, tmp])
  const parsed = JSON.parse(await readFile(tmp, 'utf8'))
  if (parsed.movement?.version !== 1) throw new Error('Spatial parser did not supply trajectories')
  await rename(tmp, out)
  console.log(`Spatial replay saved: ${out}`)
  process.exit(0)
}

console.log(`Parser fetching Valve replay ${matchId} (cluster ${cluster})...`)
const parserUrl = new URL('/blob', base)
parserUrl.searchParams.set('replay_url', replayUrl)
const response = await fetch(parserUrl, { signal: timeout })
if (!response.ok) throw new Error(`Dota parser HTTP ${response.status}`)
const output = Buffer.from(await response.arrayBuffer())
if (!output.length) throw new Error('Dota parser returned an empty result')
JSON.parse(output.toString('utf8'))
await writeFile(tmp, output)
await rename(tmp, out)
console.log(`Parsed replay saved: ${out} (${output.length} bytes JSON)`)
