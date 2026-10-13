// Автоматические выводы о матче.
//
// Раньше это была сетка из четырёх одинаковых «иконка + заголовок + текст» —
// ленивый контейнер, который детектор читает как генерацию. Теперь вывод
// иерархичен: первый (переломный момент) ведёт блоком крупнее, остальные
// идут плотным списком строк. Боковая цветная планка убрана: состояние уже
// сказано лагерем в тексте, а не рамкой.

import type { Insight } from '../../pages/match-model'

export default function Insights({ items }: { items: Insight[] }) {
  if (!items.length) return null
  const [lead, ...rest] = items

  return (
    <section className="insights" aria-label="Что решило матч">
      <article className={`insight-lead ${lead.tone}`}>
        <h2 className="insight-lead-label">{lead.label}</h2>
        <p className="insight-lead-value">{lead.value}</p>
        <p className="insight-lead-note">{lead.note}</p>
      </article>

      {rest.length > 0 && (
        <ul className="insight-list">
          {rest.map((item, i) => (
            <li className={`insight-row ${item.tone}`} key={`${item.label}-${i}`}>
              <span className="insight-row-label">{item.label}</span>
              <span className="insight-row-value">{item.value}</span>
              <span className="insight-row-note">{item.note}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
