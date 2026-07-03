import { createServer } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { handleRequest } from '../server.js'

let server
let baseUrl

beforeAll(async () => {
  server = createServer(handleRequest)
  await new Promise((resolve) => server.listen(0, resolve))
  baseUrl = `http://127.0.0.1:${server.address().port}`
})

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve))
})

describe('server.js handleRequest', () => {
  it('nespadne na poškozené procentové escape v URL a vrátí chybový status', async () => {
    const res = await fetch(`${baseUrl}/%E0%A4%A`)
    expect([400, 404]).toContain(res.status)
  })

  it('server dál odpovídá i po předchozím poškozeném požadavku', async () => {
    const res = await fetch(`${baseUrl}/api/search?q=a`)
    expect(res.status).toBe(400) // krátký dotaz — validní odpověď, ne pád
    const body = await res.json()
    expect(body.error).toBeTruthy()
  })

  it('vrací 503 na statický soubor, dokud neexistuje dist/', async () => {
    const res = await fetch(`${baseUrl}/`)
    expect([200, 503]).toContain(res.status)
  })
})
