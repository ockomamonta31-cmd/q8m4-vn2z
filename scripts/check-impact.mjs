// Run: node scripts/check-impact.mjs. Exercise the shipped TypeScript model.
import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
const { outputFiles } = buildSync({ entryPoints: ['src/api/impact.ts'], bundle: true, platform: 'node', format: 'esm', write: false })
const { personalImpact: score, personalImpactBreakdown: breakdown } = await import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'))
const support = {
  heroId: 100, kills: 10, deaths: 23, assists: 35, goldPerMinute: 358,
  experiencePerMinute: 856, numLastHits: 117, numDenies: 4, networth: 19607,
  level: 30, heroDamage: 26918, towerDamage: 141, heroHealing: 0,
  position: 5, seasonRank: 45, teamKills: 80, teamDamage: 407288,
}
const stats = { killEvents: [], deathEvents: [], wards: [], wardDestruction: [],
  itemPurchases: [], campStack: [], runes: [], courierKills: [], actionsPerMinute: [],
  tripsFountainPerMinute: [], pathPerMin: 0 }
for (const position of [0, 1, 2, 3, 4, 5]) {
  for (const seasonRank of [0, 15, 45, 65, 80]) {
    for (const duration of [1200, 2400, 4896]) {
      for (const rich of [false, true]) {
        const p = { ...support, position, seasonRank, ...(rich ? { stats } : {}) }
        const value = score(p, duration, null)
        assert(Number.isFinite(value) && Math.abs(value) <= 100)
        const d = breakdown(p, duration, null)
        assert.equal(value, d.score)
        assert.equal(d.factors.reduce((n, f) => n + f.contribution, 0), value)
        for (const key of ['assists', 'kills', 'numLastHits', 'heroDamage', 'towerDamage', 'heroHealing']) {
          assert(score({ ...p, [key]: p[key] + 20 }, duration, null) >= value, key + ' must not lower impact')
        }
        assert(score({ ...p, deaths: p.deaths + 5 }, duration, null) <= value)
        for (const f of d.factors) {
          const direction = f.label === 'Смерти' || f.section === 'Ошибки' ? -1 : 1
          assert(f.contribution * (f.actual - f.baseline) * direction >= -1e-9, 'wrong attribution sign: ' + f.label)
        }
        if (rich) assert(score({ ...p, stats: { ...stats, wards: Array(20).fill({ type: 0 }) } }, duration, null) >= value)
      }
    }
  }
}
assert.equal(score(support, 0, null), null)
assert.equal(score(support, NaN, null), null)
assert.equal(score(support, 4896, null), score({ ...support, seasonRank: 41 }, 4896, null), 'star five must stay in medal four')
const noRank = { ...support, seasonRank: 0 }
assert.notEqual(breakdown(noRank, 4896, null).factors.find(f => f.label === 'Ассисты').baseline,
  breakdown({ ...support, seasonRank: 45 }, 4896, null).factors.find(f => f.label === 'Ассисты').baseline,
  'unknown rank must not become a fabricated 45')
assert.notEqual(breakdown(support, 1800, null).factors.find(f => f.label === 'Ассисты').baseline,
  breakdown(support, 4896, null).factors.find(f => f.label === 'Ассисты').baseline,
  'duration must change the expected rate')
console.log('PASS impact: 180 contexts, signs, monotonicity, additive breakdown, ranks and duration')
