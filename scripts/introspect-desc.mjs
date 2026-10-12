// Описания полей ward.type, itemPurchases, корневые query для предметов
const post = async (query) => {
  const res = await fetch('http://localhost:5173/graphql', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const json = await res.json()
  if (json.errors?.length) console.error(json.errors.map((e) => e.message).join('; '))
  return json.data
}

// 1) описание поля type у ward-события
const d1 = await post(`query {
  t: __type(name: "MatchPlayerStatsWardEventType") {
    fields { name description type { name kind ofType { name } } }
  }
}`)
console.log('=== MatchPlayerStatsWardEventType ===')
for (const f of d1.t.fields) console.log(` ${f.name}: ${f.description ?? '(нет описания)'}`)

// 2) itemPurchases поля
const d2 = await post(`query {
  t: __type(name: "MatchPlayerItemPurchaseEventType") {
    fields { name description type { name kind ofType { name } } }
  }
}`)
console.log('\n=== MatchPlayerItemPurchaseEventType ===')
for (const f of d2.t.fields) console.log(` ${f.name}: ${JSON.stringify(f.type)}  ${f.description ?? ''}`)

// 3) корневые query — есть ли справочник предметов
const d3 = await post(`query { t: __type(name: "Query") { fields { name } } }`)
const names = d3.t.fields.map((f) => f.name)
console.log('\n=== Query: предметы/справочники ===')
console.log(names.filter((n) => /item|constant|hero|ability/i.test(n)).join(', '))

// 4) описание самого enum WardType
const d4 = await post(`query { t: __type(name: "WardType") { description enumValues { name description } } }`)
console.log('\n=== WardType enum ===', JSON.stringify(d4.t, null, 1))
