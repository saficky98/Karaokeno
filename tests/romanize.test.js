import { describe, it, expect } from 'vitest'
import { needsTransliteration, romanize } from '../src/lib/romanize.js'

describe('romanize', () => {
  it('přepisuje častá hebrejská slova zpívatelně', () => {
    expect(romanize('שלום עולם אני שר הלילה')).toBe('shalom olam ani shar halayla')
  })

  it('rozlišuje hebrejské שׂ a שׁ, když jsou v textu značky', () => {
    expect(romanize('שׂיר שׁיר')).toBe('sir shir')
  })

  it('přepisuje základní arabštinu se samohláskami pro zpěv', () => {
    expect(romanize('حبيبي يا نور العين')).toBe('habibi ya nur alain')
  })

  it('umí přepsat čistou japonskou kanu', () => {
    expect(romanize('ありがとう')).toBe('arigatou')
  })

  it('u japonštiny s kanji neukazuje zavádějící čínské čtení', () => {
    expect(romanize('愛してる')).toBe('')
  })

  it('rozpozná další nelatinková písma pro přepis', () => {
    expect(needsTransliteration('বাংলা தமிழ் తెలుగు')).toBe(true)
  })
})
