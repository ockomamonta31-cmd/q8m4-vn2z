// Список активных предметов: те, чьё применение вообще встречается в
// разобранных реплеях. Нужен, чтобы не упрекать пассивный предмет в том, что
// он "лежал без применения".
//
//   node scripts/build-active-items.mjs
//
// Выход — server/data/constants/active_items.json.

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const references = JSON.parse(readFileSync(join(ROOT, 'server/data/constants/coach_references.json'), 'utf8'))
const keys = new Set()
for (const example of references.examples ?? []) {
  for (const [key, count] of Object.entries(example.evidence?.itemUses ?? {})) if (count > 0) keys.add(key)
}
const items = [...keys].sort()
writeFileSync(join(ROOT, 'server/data/constants/active_items.json'), JSON.stringify({
  version: 1,
  source: `keys with a positive count in itemUses across ${references.examples?.length ?? 0} parsed reference games`,
  items,
}))
console.log(`active_items: ${items.length} предметов`)
