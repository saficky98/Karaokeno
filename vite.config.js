import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Lokální /api/*: stejné serverové handlery, jen obalené pro
// Node server Vite. Titulky i vyhledávání tak fungují i v `npm run dev`
// a `npm run preview` — bez jakéhokoli hostingu.
function serverApi() {
  const routes = {
    '/api/captions': () => import('./api/captions.js'),
    '/api/search': () => import('./api/search.js'),
  }
  const attach = (server) => {
    for (const [path, load] of Object.entries(routes)) {
      server.middlewares.use(path, async (req, res) => {
        const { default: handler } = await load()
        // minimální res API nad node:http odpovědí
        res.status = (code) => ((res.statusCode = code), res)
        res.json = (data) => {
          res.setHeader('content-type', 'application/json')
          res.end(JSON.stringify(data))
        }
        // handler čte celé URL včetně prefixu
        req.url = `${path}${req.url === '/' ? '' : req.url}`
        try {
          await handler(req, res)
        } catch {
          res.status(500).json({ error: 'handler failed' })
        }
      })
    }
  }
  return { name: 'server-api', configureServer: attach, configurePreviewServer: attach }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serverApi()],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
  },
})
