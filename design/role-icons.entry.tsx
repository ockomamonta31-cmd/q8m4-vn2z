// Генерирует design/role-icons.html из настоящих компонентов, чтобы проверка
// иконок не расходилась с тем, что реально стоит в приложении.
//
//   npx esbuild design/role-icons.entry.tsx --bundle --platform=node --format=esm \
//     --loader:.css=text --outfile=.tmp-shots/role-icons.mjs && node .tmp-shots/role-icons.mjs > design/role-icons.html

import { renderToStaticMarkup } from 'react-dom/server'
import baseCss from '../src/styles/base.css'
import RoleIcon, { LaneBadge, RoleIconDefs } from '../src/components/RoleIcon'

const SIZES = [96, 48, 40, 24] as const
const LANES = ['safelane', 'mid', 'offlane', 'jungle', 'roaming']

const band = (cls: string, inner: string) => `<div class="band ${cls}">${inner}</div>`
const fig = (n: number, inner: string) => `<figure>${inner}<figcaption>${n}</figcaption></figure>`

const roleFigures = (size: number) =>
  [1, 2, 3, 4, 5].map((p) => fig(`${size}px · pos ${p}`, renderToStaticMarkup(<RoleIcon position={p} source="replay" size={size} />))).join('')

const laneFigures = (radiant: boolean) =>
  LANES.map((l) => fig(l, renderToStaticMarkup(<LaneBadge lane={l} radiant={radiant} size={40} />))).join('')

const cornerFigures = (radiant: boolean) =>
  LANES.map((l) => fig(l, renderToStaticMarkup(<RoleIcon position={1} source="replay" lane={l} radiant={radiant} size={40} />))).join('')

const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8" />
<title>Иконки ролей и линий — проверка</title>
<style>${baseCss}
  body { padding: 0 0 64px; }
  h1 { font: 400 28px/1.05 var(--display); padding: 24px; margin: 0; }
  h2 { font: 500 14px var(--ui); color: var(--text-dim); padding: 0 24px; margin: 32px 0 8px; }
  .band { padding: 24px; display: flex; gap: 24px; align-items: flex-end; flex-wrap: wrap; }
  .band.light { background: #c9cdd2; }
  .band.light .lane-badge rect { stroke: #7d868d; }
  .band.deep { background: var(--bg-deep); }
  figure { margin: 0; display: grid; gap: 8px; justify-items: center; width: 130px; }
  figcaption { font-size: 12px; color: var(--text-dim); text-align: center; }
  .band.light figcaption { color: #2b363f; }
</style></head>
<body>
${renderToStaticMarkup(<RoleIconDefs />)}
<h1>Иконки ролей и линий</h1>
<h2>Роли — 96px, детальный просмотр: тёмный / светлый / глубокий фон</h2>
${band('', roleFigures(96))}
${band('light', roleFigures(96))}
${band('deep', roleFigures(96))}
<h2>Роли — рабочие размеры</h2>
${SIZES.filter((s) => s !== 96).map((s) => band(s === 24 ? 'deep' : '', roleFigures(s))).join('\n')}
<h2>Линии — 40px отдельно</h2>
${band('', laneFigures(true))}
${band('deep', laneFigures(false))}
<h2>Линия как бейдж 16px на углу иконки роли 40px</h2>
${band('', cornerFigures(true))}
${band('deep', cornerFigures(false))}
</body></html>
`

process.stdout.write(html)
