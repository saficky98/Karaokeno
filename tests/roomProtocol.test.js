import { describe, expect, it } from 'vitest'
import { acceptGuestScore, isFresherScore, mergeGuest } from '../src/lib/roomProtocol.js'

const GUEST = { player: { name: 'Anna', avatar: '🎤', color: '#fff' }, songs: [{ id: 1, videoId: 'v1', title: 'Song' }] }

describe('mergeGuest', () => {
  it('přidá nového hosta jako hráče s playlistem', () => {
    const list = mergeGuest([], 'abc', GUEST)
    expect(list).toHaveLength(1)
    expect(list[0].id).toBe('g-abc')
    expect(list[0].songs[0].id).toBe('g-abc-1')
  })

  it('aktualizuje existujícího hosta na místě', () => {
    const first = mergeGuest([], 'abc', GUEST)
    const updated = mergeGuest(first, 'abc', { ...GUEST, player: { ...GUEST.player, name: 'Anna B' } })
    expect(updated).toHaveLength(1)
    expect(updated[0].name).toBe('Anna B')
  })

  it('prázdný příspěvek hosta odebere', () => {
    const first = mergeGuest([], 'abc', GUEST)
    expect(mergeGuest(first, 'abc', null)).toHaveLength(0)
  })

  it('použité písničky se do playlistu nevrací', () => {
    const list = mergeGuest([], 'abc', GUEST, ['g-abc-1'])
    expect(list[0].songs).toHaveLength(0)
  })

  it('vyhozený host se nevzkřísí ani po opětovném příspěvku (náhrobek)', () => {
    const first = mergeGuest([], 'abc', GUEST)
    const kicked = mergeGuest(first, 'abc', GUEST, [], ['abc'])
    expect(kicked).toHaveLength(0)
  })
})

describe('acceptGuestScore', () => {
  const plays = new Map([['p1', { title: 'Píseň' }]])

  it('zapíše skóre známého přehrání', () => {
    const out = acceptGuestScore({ finished: { key: 'p1', score: 4200 }, guestId: 'abc', plays, recorded: new Set() })
    expect(out.result).toMatchObject({ singerId: 'g-abc', score: 4200, title: 'Píseň', key: 'p1' })
  })

  it('stejné skóre podruhé nezapíše (retained zpráva chodí opakovaně)', () => {
    const recorded = new Set(['p1:g-abc'])
    expect(acceptGuestScore({ finished: { key: 'p1', score: 4200 }, guestId: 'abc', plays, recorded })).toBeNull()
  })

  it('neznámé přehrání ignoruje', () => {
    expect(acceptGuestScore({ finished: { key: 'zzz', score: 4200 }, guestId: 'abc', plays, recorded: new Set() })).toBeNull()
  })

  it('nulu a nesmysly ignoruje', () => {
    expect(acceptGuestScore({ finished: { key: 'p1', score: 0 }, guestId: 'abc', plays, recorded: new Set() })).toBeNull()
    expect(acceptGuestScore({ finished: null, guestId: 'abc', plays, recorded: new Set() })).toBeNull()
  })

  it('skóre ořízne na 10000', () => {
    const out = acceptGuestScore({ finished: { key: 'p1', score: 999999 }, guestId: 'abc', plays, recorded: new Set() })
    expect(out.result.score).toBe(10000)
  })
})

describe('isFresherScore', () => {
  it('první tick bere', () => {
    expect(isFresherScore(null, { key: 'p1', seq: 1 })).toBe(true)
  })

  it('starší seq zahazuje', () => {
    expect(isFresherScore({ key: 'p1', seq: 5 }, { key: 'p1', seq: 3 })).toBe(false)
  })

  it('nový klíč (další písnička) vždy bere', () => {
    expect(isFresherScore({ key: 'p1', seq: 5 }, { key: 'p2', seq: 1 })).toBe(true)
  })
})
