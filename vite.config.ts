import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
// Собственный API-сервер: данные Valve (Steam Web API) + своё хранилище
// матчей на диске. Подключается middleware'ом в тот же origin — без CORS.
// @ts-expect-error сервер написан на чистом JS без типов
import { apiMiddleware } from './server/index.mjs'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  void env
  return {
    plugins: [
      react(),
      {
        name: 'own-dota-api',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (!apiMiddleware(req, res)) next()
          })
        },
      },
    ],
    server: {
      port: 5173,
    },
  }
})
