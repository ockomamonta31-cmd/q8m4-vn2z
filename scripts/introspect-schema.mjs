// Интроспекция схемы: тип wards.type (enum), все поля stats (расходники?), partyId
const QUERY = `
query {
  t0: __type(name: "WardType") { enumValues { name } }
  t1: __type(name: "PlayerStatsType") { fields { name type { name kind ofType { name kind } } } }
  t2: __type(name: "MatchPlayerType") { fields { name } }
}`

const res = await fetch('http://localhost:5173/graphql', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ query: QUERY }),
})
const json = await res.json()
if (json.errors?.length) console.error(json.errors.map((e) => e.message).join('; '))

const d = json.data
console.log('=== WardType ===')
console.log((d?.t0?.enumValues ?? []).map((v) => v.name).join(', ') || '(не найден)')

console.log('\n=== PlayerStatsType поля ===')
const fields = d?.t1?.fields ?? []
for (const f of fields) {
  const inner = f.type.kind === 'NON_NULL' ? f.type.ofType?.name : f.type.name
  const list = f.type.kind === 'NON_NULL' ? f.type.ofType?.kind : f.type.kind
  console.log(` ${f.name}: ${list === 'LIST' ? '[' : ''}${inner ?? f.type.ofType?.kind ?? '?'}`)
}

console.log('\n=== MatchPlayerType поля (все) ===')
console.log((d?.t2?.fields ?? []).map((f) => f.name).join(', '))
