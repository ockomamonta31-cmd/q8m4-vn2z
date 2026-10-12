// Точный тип wards.type и все поля stats (+.purchase events для расходников)
const Q1 = `
query {
  mp: __type(name: "MatchPlayerType") {
    statsType: fields { name type { name kind ofType { name kind } } }
  }
}`

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

const d1 = await post(Q1)
const statsField = d1.mp.statsType.find((f) => f.name === 'stats')
const statsTypeName = statsField.type.kind === 'NON_NULL' ? statsField.type.ofType.name : statsField.type.name
console.log('stats тип:', statsTypeName)

const d2 = await post(`query { t: __type(name: "${statsTypeName}") { fields { name type { name kind ofType { name kind } } } } }`)
console.log('\n=== Поля stats ===')
for (const f of d2.t.fields) {
  const isList = f.type.kind === 'LIST' || f.type.kind === 'NON_NULL' && f.type.ofType?.kind === 'LIST'
  const nm = f.type.kind === 'NON_NULL' ? f.type.ofType?.name ?? f.type.ofType?.kind : f.type.name
  console.log(` ${f.name}${isList ? '[]' : ''}: ${nm}`)
}

// тип wards.type
const wardField = d2.t.fields.find((f) => f.name === 'wards')
if (wardField) {
  const innerName = wardField.type.ofType?.name ?? wardField.type.name
  const d3 = await post(`query { t: __type(name: "${innerName}") { fields { name type { name kind ofType { name } } } } }`)
  console.log('\n=== wards элемент ===', JSON.stringify(d3.t?.fields?.map((f) => f.name)))
  const typeF = d3.t?.fields?.find((f) => f.name === 'type')
  if (typeF) {
    const tn = typeF.type.kind === 'NON_NULL' ? typeF.type.ofType.name : typeF.type.name
    const d4 = await post(`query { t: __type(name: "${tn}") { kind enumValues { name } } }`)
    console.log('ward.type →', tn, d4.t?.kind, JSON.stringify(d4.t?.enumValues?.map((v) => v.name)))
  }
}
