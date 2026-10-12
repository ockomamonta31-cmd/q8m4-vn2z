#!/usr/bin/env node
// Одноразовая генерация статичных констант в server/data/constants/.
// После генерации сервер ничем внешним не зависит — читает только свои файлы.
//
// Герои: снимок OpenDota core (статичный JSON в git — не API, не сервис).
// Предметы: локальный дамп constants (items.json в корне проекта).

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = dirname(fileURLToPath(import.meta.url))
const OUT = join(ROOT, 'data', 'constants')
mkdirSync(OUT, { recursive: true })

// --- Герои ---

async function genHeroes() {
  const url = 'https://raw.githubusercontent.com/odota/core/master/json/heroes_api.json'
  const res = await fetch(url)
  if (!res.ok) throw new Error(`heroes: HTTP ${res.status}`)
  const raw = await res.json()
  // odota: { result: { heroes: [{ id, name: "npc_dota_hero_antimage", localized_name: "Anti-Mage" }, ...] } }
  const heroes = (raw.heroes ?? raw.result?.heroes ?? [])
    .filter((h) => h && h.id)
    .map((h) => ({
      id: Number(h.id),
      shortName: String(h.name ?? '').replace(/^npc_dota_hero_/, ''),
      displayName: h.localized_name || h.name || `#${h.id}`,
    }))
  if (!heroes.some((h) => h.id === 155)) heroes.push({ id: 155, shortName: 'largo', displayName: 'Largo' })
  heroes.sort((a, b) => a.id - b.id)
  writeFileSync(join(OUT, 'heroes.json'), JSON.stringify(heroes))
  console.log(`heroes.json: ${heroes.length}`)
}

// --- Предметы ---

function genItems() {
  const raw = JSON.parse(readFileSync(join(ROOT, '..', 'items.json'), 'utf8'))
  const items = (raw?.data?.constants?.items ?? [])
    .map((it) => ({
      id: Number(it.id),
      displayName: it.displayName || it.shortName || `#${it.id}`,
      shortName: it.shortName || '',
    }))
    .filter((it) => Number.isFinite(it.id))
  writeFileSync(join(OUT, 'items.json'), JSON.stringify(items))
  console.log(`items.json: ${items.length}`)
}

genHeroes()
  .then(() => genItems())
  .catch((e) => {
    console.error('Ошибка:', e.message)
    process.exit(1)
  })
