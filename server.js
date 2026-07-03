import { createReadStream, existsSync } from 'node:fs'
import { stat } from 'node:fs/promises'
import { createServer } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import captionsHandler from './api/captions.js'
import searchHandler from './api/search.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const distDir = path.join(__dirname, 'dist')
const port = Number(process.env.PORT || 4173)

const apiRoutes = {
  '/api/captions': captionsHandler,
  '/api/search': searchHandler,
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function addJsonHelpers(res) {
  res.status = (code) => {
    res.statusCode = code
    return res
  }
  res.json = (data) => {
    if (!res.hasHeader('content-type')) res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify(data))
  }
}

async function handleApi(req, res, handler) {
  addJsonHelpers(res)
  try {
    await handler(req, res)
  } catch {
    if (!res.headersSent) res.status(500).json({ error: 'handler failed' })
    else res.end()
  }
}

function resolveStaticPath(urlPath) {
  const requested = urlPath === '/' ? '/index.html' : urlPath
  const filePath = path.resolve(distDir, `.${requested}`)
  if (filePath !== distDir && !filePath.startsWith(`${distDir}${path.sep}`)) return null
  return filePath
}

async function serveStatic(req, res) {
  if (!existsSync(distDir)) {
    res.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('Nejdřív spusť npm run build, aby vznikla složka dist/.')
    return
  }

  const url = new URL(req.url, 'http://localhost')
  let filePath = resolveStaticPath(decodeURIComponent(url.pathname))
  if (!filePath) {
    res.writeHead(403).end()
    return
  }

  try {
    const info = await stat(filePath)
    if (info.isDirectory()) filePath = path.join(filePath, 'index.html')
  } catch {
    filePath = path.extname(filePath) ? null : path.join(distDir, 'index.html')
  }

  if (!filePath) {
    res.writeHead(404).end()
    return
  }

  try {
    const info = await stat(filePath)
    if (!info.isFile()) throw new Error('not a file')
    res.writeHead(200, {
      'content-type': MIME[path.extname(filePath)] ?? 'application/octet-stream',
      'cache-control': filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
    })
    createReadStream(filePath).pipe(res)
  } catch {
    res.writeHead(404).end()
  }
}

createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  const apiHandler = apiRoutes[url.pathname]
  if (apiHandler) {
    handleApi(req, res, apiHandler)
    return
  }
  serveStatic(req, res)
}).listen(port, () => {
  console.log(`Karaokeno běží na http://localhost:${port}`)
})
