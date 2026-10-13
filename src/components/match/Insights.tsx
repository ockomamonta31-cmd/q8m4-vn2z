// Автоматические выводы о матче: три блока, первый — переломный момент.

import type { Insight } from '../../pages/match-model'

export default function Insights({ items }: { items: Insight[] }) {
  if (!items.length) return null

  return (
    <section className="ins" aria-label="Что решило матч">
      {items.slice(0, 3).map((item) => (
        <article className="ins-c" key={item.label}>
          <h2 className="ins-t">{item.label}</h2>
          <p className="ins-v">{item.value}</p>
          <p className="ins-n">{item.note}</p>
        </article>
      ))}
    </section>
  )
}
