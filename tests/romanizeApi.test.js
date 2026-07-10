import { describe, expect, it, vi } from 'vitest'

// Analyzátor mockujeme — reálný kuromoji slovník (18 MB) do CI nepatří.
vi.mock('kuroshiro', () => ({
  default: class MockKuroshiro {
    async init() {}
    async convert(line) {
      return line === '愛してる' ? 'aishiteru' : `romaji:${line}`
    }
  },
}))
vi.mock('kuroshiro-analyzer-kuromoji', () => ({ default: class MockAnalyzer {} }))

import handler from '../api/romanize.js'

function makeReq(method, body) {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body))]
  return {
    method,
    async *[Symbol.asyncIterator]() {
      yield* chunks
    },
  }
}

function makeRes() {
  const res = { statusCode: 200, body: null }
  res.status = (code) => ((res.statusCode = code), res)
  res.json = (data) => ((res.body = data), res)
  return res
}

describe('/api/romanize', () => {
  it('odmítne jiné metody než POST', async () => {
    const res = makeRes()
    await handler(makeReq('GET'), res)
    expect(res.statusCode).toBe(405)
  })

  it('odmítne nevalidní tělo', async () => {
    const res = makeRes()
    await handler(makeReq('POST', { lang: 'ja' }), res)
    expect(res.statusCode).toBe(400)
  })

  it('odmítne jiný jazyk než ja', async () => {
    const res = makeRes()
    await handler(makeReq('POST', { lang: 'zh', lines: ['你好'] }), res)
    expect(res.statusCode).toBe(400)
  })

  it('přepíše japonské řádky a řádky bez japonštiny vrací null', async () => {
    const res = makeRes()
    await handler(makeReq('POST', { lang: 'ja', lines: ['愛してる', 'hello'] }), res)
    expect(res.statusCode).toBe(200)
    expect(res.body.lines).toEqual(['aishiteru', null])
  })

  it('druhý požadavek jde z cache (stejný výsledek)', async () => {
    const res = makeRes()
    await handler(makeReq('POST', { lang: 'ja', lines: ['愛してる'] }), res)
    expect(res.body.lines).toEqual(['aishiteru'])
  })
})
