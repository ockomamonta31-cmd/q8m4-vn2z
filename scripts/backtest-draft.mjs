// Бэктест нашей же оценки драфта по нашей же базе: прогоняем evaluateDraft()
// по всем кэшированным матчам и сверяем предсказание с фактом.
//
// Это же, что видит страница матча, — тот же код, те же пороги. На выходе:
//   matchAccuracy — как часто команда с большей оценкой выиграла;
//   laneAccuracy  — как часто предсказанный победитель линии выиграл её по
//                   факту (GPM/опыт/ЛХ/нетворс пары);
//   calibration   — по бакетам доли силы: с какой частотой Radiant выигрывал.
//
// Калибровка пишется обратно в hero_profile.json, и фронтенд превращает долю
// силы в вероятность по этим же числам, а не по нашей фантазии.
//
// Запуск: npm run draft:backtest

import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

// TS-модель импортируется как есть: собираем бандл esbuild'ом и исполняем.
const bundle = join(ROOT, '.tmp-shots', 'backtest-bundle.mjs')
mkdirSync(dirname(bundle), { recursive: true })
/** npx на Windows — .cmd: запускаем через cmd.exe, но аргументами, не строкой. */
function run(command, args) {
  const win = process.platform === 'win32'
  execFileSync(win ? 'cmd.exe' : command, win ? ['/c', command, ...args] : args, { cwd: ROOT, stdio: 'inherit', encoding: 'utf8' })
}

run('npx', ['esbuild', 'scripts/backtest-draft.run.ts', '--bundle', '--platform=node', '--format=esm', `--outfile=${bundle}`, '--log-level=warning'])
const out = execFileSync(process.execPath, [bundle], { cwd: ROOT, encoding: 'utf8', maxBuffer: 1 << 30 })
process.stdout.write(out)
