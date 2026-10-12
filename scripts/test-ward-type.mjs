// Тест: какой ward type (0/1) — OBSERVER? Ранние варды (t<=30с) почти всегда
// бесплатные стартовые наблюдатели; сантри на блок кемпов ставят реже.
const readFileSync = (await import('node:fs')).readFileSync
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/(\w):/, '$1:')

const seed = readFileSync(decodeURIComponent(ROOT) + 'scripts/imp-dataset.jsonl', 'utf8')
  .split('\n').filter(Boolean).map((l) => JSON.parse(l).id)

const Q = `query ($id: Long!) { match(id: $id) { players { position stats { wards { time type } } } } }`

const post = async (query, variables) => {
  const res = await fetch('http://localhost:5173/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  const j = await res.json()
  if (j.errors?.length) throw new Error(j.errors.map((e) => e.message).join('; '))
  return j.data
}

// берём 12 случайных матчей из середины
const picks = seed.filter((_, i) => i % Math.floor(seed.length / 12) === 0).slice(0, 12)
let early = { 0: 0, 1: 0 }
let all = { 0: 0, 1: 0 }
let firstByPos5 = { 0: 0, 1: 0 }

for (const id of picks) {
  try {
    const d = await post(Q, { id })
    for (const p of d.match.players) {
      const wards = p.stats?.wards ?? []
      const sorted = [...wards].sort((a, b) => a.time - b.time)
      if (p.position === 'POSITION_5' && sorted.length) firstByPos5[sorted[0].type]++
      for (const w of wards) {
        all[w.type]++
        if (w.time <= 30) early[w.type]++
      }
    }
  } catch (e) {
    console.log('пропуск', id, e.message)
  }
}
console.log('все варды:            type0=%d type1=%d', all[0], all[1])
console.log('ранние (t<=30с):      type0=%d type1=%d', early[0], early[1])
console.log('первый вард поз.5:    type0=%d type1=%d', firstByPos5[0], firstByPos5[1])

// справочник предметов: smoke/dust/wards id
try {
  const res = await fetch('https://raw.githubusercontent.com/odota/dotaconstants/master/build/items.json')
  const items = await res.json()
  const wanted = /smoke|dust|ward_observer|ward_sentry|tango|flask|clarity|faerie|smoke_of_deceit/i
  const byId = Object.entries(items).filter(([, v]) => v && typeof v === 'object' && wanted.test(v.name ?? ''))
  console.log('\n=== предметы (id → name) ===')
  for (const [id, v] of byId) console.log(` ${id}: ${v.name}`)
} catch (e) {
  console.log('items.json не получен:', e.message)
}
