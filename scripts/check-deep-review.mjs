// Run: node scripts/check-deep-review.mjs — the on-demand breakdown shipped to the browser.
import assert from 'node:assert/strict'
import { buildSync } from 'esbuild'
const moduleOf = async path => {
  const { outputFiles } = buildSync({ entryPoints: [path], bundle: true, platform: 'node', format: 'esm', write: false })
  return import('data:text/javascript;base64,' + Buffer.from(outputFiles[0].text).toString('base64'))
}
const { deepReview } = await moduleOf('src/api/deepReview.ts')
const { standing, standingRank } = await moduleOf('src/api/heroNorms.ts')

assert.equal(standing([1.1, 1.4, 2, 2.6, 3.3], 2.0000000001, 1), 'ровно на медиане', 'совпадение на отображаемой точности не выдаётся за превышение')
// Rank 3 means "at or above the median": equality must not be promoted to a
// strength, and must land in the same bucket it is described by.
assert.equal(standingRank([1.1, 1.4, 2, 2.6, 3.3], 2.0000000001, 1), 3)

// Parsed replays index the lane by minute start: 0, 60, ... 540.
const minutes = (lh, extra = {}) => [...lh].map((value, i) => ({ t: i * 60, end: (i + 1) * 60, lh: value, xp: 300, damage: 100, taken: 200, attacks: 2, aliveSeconds: 60, ...extra }))
const hero = (id, over = {}) => ({ steamAccountId: id, heroId: id, isRadiant: true, position: 1, evidence: null, name: null, seasonRank: 0, stats: null, ...over })
const byTitle = (review, title) => review.sections.flatMap(s => s.items).find(i => i.title.includes(title))
const sectionOf = (review, id) => review.sections.find(s => s.id === id)

const blank = deepReview(hero(1), [])
assert.equal(blank.sections.length, 0, 'без разобранного реплея разделов нет')
assert.match(blank.lead, /не разобран/, 'честно сообщает, что реплей не разобран')
assert.equal(blank.gaps.length, 4, 'ограничения данных перечислены всегда')

const noEvidence = deepReview(hero(2, { evidence: { version: 1, curve: [], lane: {}, deaths: null } }), [])
assert.equal(noEvidence.sections.length, 0)

// Line: minute zero is never the "worst minute", and a flat line needs no callout.
const flat = hero(3, { evidence: { version: 1, curve: [], lane: {}, deaths: [], laneMinutes: minutes([5, 5, 5, 5, 5, 5, 5, 5, 5, 5]) } })
assert(sectionOf(deepReview(flat, []), 'lane'), 'поминутная линия попадает в разбор')
assert(!byTitle(deepReview(flat, []), 'Худшая минута'), 'ровная линия не даёт выдуманного провала')
const dip = hero(4, { evidence: { version: 1, curve: [], lane: {}, deaths: [], laneMinutes: minutes([5, 5, 0, 5, 5, 5, 5, 5, 5, 5], { attacks: 3 }) } })
const dipItem = byTitle(deepReview(dip, []), 'Худшая минута')
assert(dipItem, 'провал на минуте выделяется')
assert.equal(dipItem.t, 120)
assert.match(dipItem.fact, /В остальные минуты линии было в среднем 5/)

// The direct opposite number in a lane carries the mirrored label: safe lane vs off lane.
const carry = hero(5, { lane: 'safelane', evidence: { version: 1, curve: [], lane: {}, deaths: [], laneMinutes: minutes([5, 5, 5, 5, 5, 5, 5, 5, 5, 5]) } })
const offlaneRival = hero(6, { isRadiant: false, position: 3, lane: 'offlane', evidence: { version: 1, curve: [], lane: {}, deaths: [], laneMinutes: minutes([1, 1, 1, 1, 1, 1, 1, 1, 1, 1]) } })
const sameLabelRival = hero(7, { isRadiant: false, position: 1, lane: 'safelane', evidence: { version: 1, curve: [], lane: {}, deaths: [], laneMinutes: minutes([9, 9, 9, 9, 9, 9, 9, 9, 9, 9]) } })
const laneRival = byTitle(deepReview(carry, [offlaneRival, sameLabelRival]), 'Линия против')
assert(laneRival, 'соперник по линии найден')
assert.match(laneRival.fact, /50 добиваний/, 'считает свои добивания')
assert.match(laneRival.fact, /— 10 и 3000 \(позиция 3\)/, 'берёт соперника из зеркальной линии')
assert(!laneRival.fact.includes('90'), 'герой с тем же ярлыком линии, но из другой линии, не сравнивается')
assert.match(laneRival.advice, /объясняется ролью/, 'сравнение с другой ролью не подаётся как ошибка')

// Deaths keep the measured window instead of inventing a cause.
const death = {
  t: 480, from: 460, damage: 200, taken: 500, attacks: 2, ownSpells: [], enemySpells: [], items: [], nearestAlly: { heroId: 11, distance: 3000 },
  allyDamage: 0, allySpells: [], lhNextMinute: 4, xpNextMinute: 300,
  decision: { t: 462, attackStart: 470, nearbyAllies: 0, nearestAlly: null, health: 200, maxHealth: 900, attackers: [{ heroId: 11, firstContact: 470 }, { heroId: 12, firstContact: 476 }] },
}
const dead = hero(8, { evidence: { version: 1, curve: [], lane: {}, laneMinutes: minutes([5, 5, 5, 5, 5, 5, 5, 5, 5, 5]), deathWindows: [death], deaths: [{ t: 480, goldFed: 300, lostGold: 300, secondsDead: 20, killer: 'npc_dota_hero_axe', dieback: false }] } })
const deathItem = sectionOf(deepReview(dead, []), 'deaths').items[0]
assert.equal(deathItem.status, 'review')
assert.match(deathItem.title, /8:00/)
assert.match(deathItem.fact, /живых союзников в радиусе 1600 ед\. — 0/)
assert.match(deathItem.fact, /отдано 300 золота/)
assert.match(deathItem.advice, /остался один против нескольких героев/)
const clean = hero(9, { evidence: { version: 1, curve: [], lane: {}, deaths: [] } })
assert.equal(sectionOf(deepReview(clean, []), 'deaths').items[0].status, 'good', 'матч без смертей отмечается как удача')

// Support metrics and starter items.
const support = hero(10, { position: 5, evidence: {
  version: 1, curve: [], lane: {}, deaths: [], itemUses: { dust: 0 },
  wards: [{ t: 60, type: 'observer', x: 0, y: 0 }, { t: 600, type: 'observer', x: 0, y: 0 }, { t: 200, type: 'sentry', x: 0, y: 0 }],
} })
const gaps = byTitle(deepReview(support, []), 'Окна без Observer')
assert(gaps, 'пауза дольше семи минут между Observer отмечается')
assert.match(gaps.fact, /1:00 → 10:00 \(9 мин\)/)
const closeWards = hero(11, { position: 5, evidence: { ...support.evidence, wards: [{ t: 60, type: 'observer', x: 0, y: 0 }, { t: 300, type: 'observer', x: 0, y: 0 }] } })
assert(!byTitle(deepReview(closeWards, []), 'Окна без Observer'), 'регулярный обзор не даёт ложной паузы')
assert.equal(deepReview(hero(12, { position: 1, evidence: support.evidence }), []).sections.find(s => s.id === 'support'), undefined, 'поддержка разбирается только у позиций 4–5')
const supportLane = hero(14, { position: 5, lane: 'safelane', evidence: { version: 1, curve: [], lane: {}, deaths: [], laneMinutes: minutes([0, 0, 0, 1, 0, 0, 0, 0, 0, 0], { attacks: 4 }) } })
assert(!byTitle(deepReview(supportLane, []), 'Худшая минута'), 'провал по добиваниям не выдаётся поддержке за ошибку')

const curve = [[600, 600, 5000, 3000, 30, 0, 1000, 0, 0, 0], [1200, 1200, 9000, 6000, 60, 0, 3000, 0, 0, 500]]
const buyer = hero(13, { evidence: { version: 1, curve, lane: {}, deaths: [], purchases: null }, purchaseEvents: [{ time: -30, itemId: 29 }, { time: 0, itemId: 29 }, { time: 150, itemId: 29 }] })
const timings = byTitle(deepReview(buyer, []), 'Тайминги предметов')
assert(timings, 'покупки после начала игры показываются')
assert(!/-\d/.test(timings.fact.replace(/—/g, '')), 'стартовые предметы до гонга не выдаются за тайминг')
assert.match(timings.fact, /2:30/)

// Hero norms compare this match with how stronger players play the same hero.
const normed = { ...hero(44, { position: 1 }), goldPerMinute: 816, experiencePerMinute: 959, numLastHits: 306, heroDamage: 28100, towerDamage: 5000, deaths: 3 }
const normReview = deepReview(normed, [], 1779)
const normSection = sectionOf(normReview, 'norm')
assert(normSection, 'норма по герою попадает в разбор')
assert.match(normSection.lead, /Ancient и выше/)
const gpmItem = byTitle(normReview, 'Золото в минуту')
assert.equal(gpmItem.status, 'good', 'темп выше 90-го перцентиля отмечается как сильная сторона')
assert.match(gpmItem.fact, /выше 90-го перцентиля/)
assert(!/неизвестно/.test(gpmItem.fact), 'выборка и перцентили названы явно')
assert.equal(sectionOf(deepReview({ ...normed, heroId: 999 }, [], 1779), 'norm'), undefined, 'без нормы по герою раздел не появляется')
const slow = { ...normed, goldPerMinute: 200 }
assert.equal(byTitle(deepReview(slow, [], 1779), 'Золото в минуту').status, 'review', 'отставание по темпу отмечается')
assert.equal(normed.goldPerMinute, 816, 'норма не меняет измеренные значения игрока')

console.log('check-deep-review: ok')
