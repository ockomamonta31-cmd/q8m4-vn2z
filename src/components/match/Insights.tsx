// Автоматические выводы о матче — короткие карточки на обзоре.

import type { Insight } from '../../pages/match-model'
import { Icon } from '../Icons'

const ICONS = {
  trend: Icon.Trend,
  crown: Icon.Crown,
  sword: Icon.Sword,
  rosh: Icon.Roshan,
  blood: Icon.Blood,
  flame: Icon.Flame,
  coin: Icon.Coin,
  target: Icon.Target,
}

export default function Insights({ items }: { items: Insight[] }) {
  if (!items.length) return null
  return (
    <section className="insights" aria-label="Что решило матч">
      {items.map((item, i) => {
        const Glyph = ICONS[item.icon] ?? Icon.Spark
        return (
          <article className={`insight ${item.tone}`} key={`${item.label}-${i}`}>
            <span className="insight-icon"><Glyph size={16} /></span>
            <div className="insight-body">
              <div className="insight-label">{item.label}</div>
              <div className="insight-value">{item.value}</div>
              <p className="insight-note">{item.note}</p>
            </div>
          </article>
        )
      })}
    </section>
  )
}
