// Теги героев — снимок Valve (атрибут, тип атаки, роли) из game files, лежит
// статичным JSON в server/data/constants/hero_meta.json, так же, как список
// героев и предметов. В рантайме никуда не ходим.

export type HeroMeta = { id: number; attr: string; attack: string; roles: string[] }

export const ATTR_RU: Record<string, string> = {
  str: 'Сила', agi: 'Ловкость', int: 'Интеллект', all: 'Универсальный',
}

export const ATTACK_RU: Record<string, string> = { melee: 'ближний', ranged: 'дальний' }

/** Подписи Valve-ролей: это перевод тегов самой Valve, а не наша классификация. */
export const TAG_RU: Record<string, string> = {
  Carry: 'Керри',
  Support: 'Поддержка',
  Disabler: 'Дизейблер',
  Nuker: 'Нюкер',
  Initiator: 'Инициатор',
  Durable: 'Плотный',
  Escape: 'Побег',
  Pusher: 'Пушер',
}

/** Порядок, в котором теги показываем: от «кто фармит» к «кто дерётся». */
export const TAG_ORDER = ['Carry', 'Support', 'Nuker', 'Disabler', 'Initiator', 'Pusher', 'Durable', 'Escape'] as const

let promise: Promise<Map<number, HeroMeta>> | null = null

export function getHeroMeta(): Promise<Map<number, HeroMeta>> {
  if (promise) return promise
  promise = import('../../server/data/constants/hero_meta.json')
    .then((m) => new Map<number, HeroMeta>((m.default as HeroMeta[]).map((h) => [h.id, h])))
    .catch(() => new Map<number, HeroMeta>())
  return promise
}
