import { transliterate } from 'transliteration'

// Přepis výslovnosti nabízíme jen u písem, kde je spolehlivý: řečtina,
// korejština (hangul), gruzínština, arménština. Arabština/hebrejština se
// píšou bez samohlásek a čínské znaky nemají jednoznačné čtení — tam by
// byl přepis nepřesný, takže ho raději neukazujeme vůbec.
const RELIABLE_SCRIPTS = /[Ͱ-Ͽἀ-῿가-힯Ⴀ-ჿ԰-֏]/u

export function needsTransliteration(text) {
  return RELIABLE_SCRIPTS.test(text || '')
}

export function romanize(text) {
  // knihovna u některých písem vkládá technické značky — pro čtení je vyhodíme
  return transliterate(text)
    .replace(/[`@ʾʿ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
