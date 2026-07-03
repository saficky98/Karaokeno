import { transliterate } from 'transliteration'

// Písma, u kterých ukazujeme přepis výslovnosti latinkou. Cyrilici
// vynecháváme — publikum appky ji čte. U hebrejštiny máme vlastní přepis
// (viz níže), ostatní písma zvládá knihovna transliteration.
const FOREIGN_SCRIPTS =
  /[Ͱ-Ͽἀ-῿가-힯ᄀ-ᇿა-ჿ԰-֏֐-׿؀-ۿݐ-ݿ぀-ゟ゠-ヿ一-鿿฀-๿ऀ-ॿ]/u

export function needsTransliteration(text) {
  return FOREIGN_SCRIPTS.test(text || '')
}

// ---------- hebrejština ----------
// Písňové texty jsou bez vokalizace (niqqud), takže výslovnost skládáme:
// 1. souhlásky podle standardní izraelské výslovnosti (ש → sh, צ → ts…),
// 2. ו a י uvnitř slova čteme jako samohlásky o/i (matres lectionis),
// 3. do shluků souhlásek doplníme „a", aby se přepis dal zpívat
//    (שלום → sh-l-o-m → „shalom").

const HEB_LETTERS = {
  'א': 'a*', // * = jen na začátku slova, jinak se vypouští
  'ע': 'a*',
  'ג': 'g', 'ד': 'd', 'ה': 'h', 'ז': 'z', 'ח': 'ch', 'ט': 't',
  'ל': 'l', 'מ': 'm', 'ם': 'm', 'נ': 'n', 'ן': 'n', 'ס': 's',
  'צ': 'ts', 'ץ': 'ts', 'ק': 'k', 'ר': 'r', 'ש': 'sh', 'ת': 't',
}

// Vokalizační znaménka — když v textu výjimečně jsou, použijeme je.
const HEB_NIQQUD = {
  'ְ': 'e', 'ֱ': 'e', 'ֲ': 'a', 'ֳ': 'o', 'ִ': 'i',
  'ֵ': 'e', 'ֶ': 'e', 'ַ': 'a', 'ָ': 'a', 'ֹ': 'o',
  'ֺ': 'o', 'ֻ': 'u',
}

const isVowelEnd = (unit) => /[aeiou]$/.test(unit ?? '')
const isLatinUnit = (unit) => /^[a-z]+$/.test(unit ?? '')

// Nejčastější krátká slova, kde heuristika nemá šanci (chybí jim samohláska).
const HEB_COMMON = {
  'לא': 'lo', 'לי': 'li', 'לך': 'lecha', 'לו': 'lo', 'לה': 'la',
  'של': 'shel', 'שלי': 'sheli', 'שלך': 'shelcha', 'כל': 'kol', 'אל': 'el',
  'על': 'al', 'עם': 'im', 'אם': 'im', 'את': 'et', 'זה': 'ze', 'זאת': 'zot',
  'מה': 'ma', 'מי': 'mi', 'הוא': 'hu', 'היא': 'hi', 'יש': 'yesh',
  'אין': 'ein', 'גם': 'gam', 'רק': 'rak', 'עוד': 'od', 'כמו': 'kmo',
  'אבל': 'aval', 'כי': 'ki', 'אז': 'az', 'שם': 'sham', 'פה': 'po',
}

function hebrewWordToLatin(word) {
  // interpunkci kolem slova zachováme, jádro zkusíme najít ve slovníku
  const core = word.replace(/[^֐-׿]/gu, '')
  const known = HEB_COMMON[core]
  if (known) return word.replace(core, known)
  return hebrewLetters(word)
}

function hebrewLetters(word) {
  const chars = [...word]
  const units = []
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]
    if (HEB_NIQQUD[ch]) {
      units.push(HEB_NIQQUD[ch])
      continue
    }
    if (/[ּֽׁׂׅׄ]/.test(ch)) continue // dagesh, tečky šin/sin…
    if (ch === 'ו') {
      if (chars[i + 1] === 'ו') { units.push('v'); i++; continue } // וו = souhláska v
      // uvnitř slova po souhlásce = samohláska „o", jinak souhláska „v"
      if (i > 0 && !isVowelEnd(units[units.length - 1])) units.push('o')
      else units.push('v')
      continue
    }
    if (ch === 'י') {
      if (i > 0 && !isVowelEnd(units[units.length - 1])) units.push('i')
      else units.push('y')
      continue
    }
    // beged-kefet: na začátku slova tvrdě (b/k/p), uvnitř měkce (v/ch/f)
    if (ch === 'ב') { units.push(i === 0 ? 'b' : 'v'); continue }
    if (ch === 'כ' || ch === 'ך') { units.push(i === 0 && ch === 'כ' ? 'k' : 'ch'); continue }
    if (ch === 'פ' || ch === 'ף') { units.push(i === 0 && ch === 'פ' ? 'p' : 'f'); continue }
    const mapped = HEB_LETTERS[ch]
    if (mapped !== undefined) {
      if (mapped.endsWith('*')) {
        // א/ע: s následným ו/י tvoří samohlásku o/i (אוֹ → „o", אִי → „i"),
        // samostatně zní jen na začátku slova jako „a"
        if (chars[i + 1] === 'ו' && chars[i + 2] !== 'ו') { units.push('o'); i++; continue }
        if (chars[i + 1] === 'י') { units.push('i'); i++; continue }
        if (i === 0) units.push(mapped.slice(0, -1))
        continue
      }
      units.push(mapped)
      continue
    }
    units.push(ch.toLowerCase()) // interpunkce, číslice, latinka…
  }

  // Shluky souhlásek proložíme „a": [sh, l, o, m] → „shalom"
  let out = ''
  for (let i = 0; i < units.length; i++) {
    out += units[i]
    const next = units[i + 1]
    if (
      next &&
      isLatinUnit(units[i]) &&
      isLatinUnit(next) &&
      !isVowelEnd(units[i]) &&
      !/^[aeiou]/.test(next)
    ) {
      out += 'a'
    }
  }
  return out
}

function hebrewToLatin(text) {
  return text
    .split(/(\s+)/)
    .map((token) => (/[֐-׿]/.test(token) ? hebrewWordToLatin(token) : token))
    .join('')
}

// ---------- veřejné API ----------

// Přepis se počítá při každém překreslení karaoke — cache je nutnost.
const cache = new Map()

export function romanize(text) {
  const key = text || ''
  const hit = cache.get(key)
  if (hit !== undefined) return hit

  let out
  if (/[֐-׿]/.test(key)) {
    out = hebrewToLatin(key)
  } else {
    // knihovna u některých písem vkládá technické značky — pro čtení je vyhodíme
    out = transliterate(key).replace(/[`@ʾʿ]/g, '')
  }
  out = out.replace(/\s+/g, ' ').trim()

  if (cache.size > 800) cache.clear()
  cache.set(key, out)
  return out
}
