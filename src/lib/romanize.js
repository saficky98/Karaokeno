import { transliterate } from 'transliteration'
import { KOREAN_RE, koreanToLatin } from './romanizeKorean.js'

// Písma, u kterých ukazujeme přepis výslovnosti latinkou. Cyrilici
// vynecháváme — publikum appky ji čte. U hebrejštiny a arabštiny máme
// vlastní přepis (viz níže), ostatní písma zvládá knihovna transliteration.
const FOREIGN_SCRIPTS =
  /[\u0370-\u03ff\u1f00-\u1fff\u0590-\u05ff\u0600-\u06ff\u0750-\u077f\u0900-\u097f\u0980-\u09ff\u0a00-\u0a7f\u0a80-\u0aff\u0b00-\u0b7f\u0b80-\u0bff\u0c00-\u0c7f\u0c80-\u0cff\u0d00-\u0d7f\u0d80-\u0dff\u0e00-\u0e7f\u0e80-\u0eff\u1000-\u109f\u10a0-\u10ff\u1200-\u137f\u1780-\u17ff\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\u1100-\u11ff]/u

const HEBREW_RE = /[\u0590-\u05ff]/
const ARABIC_RE = /[\u0600-\u06ff\u0750-\u077f]/
const GREEK_RE = /[\u0370-\u03ff\u1f00-\u1fff]/
const KANA_RE = /[\u3040-\u30ff]/
const HAN_RE = /[\u3400-\u9fff]/

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
  // Pozn.: את je ve písních skoro vždy předmětová částice „et" — tvar „at"
  // („ty", ž.) je vzácnější, deterministický slovník musí zvolit častější.
  'על': 'al', 'עם': 'im', 'אם': 'im', 'את': 'et', 'זה': 'ze', 'זאת': 'zot',
  'מה': 'ma', 'מי': 'mi', 'הוא': 'hu', 'היא': 'hi', 'יש': 'yesh',
  'אין': 'ein', 'גם': 'gam', 'רק': 'rak', 'עוד': 'od', 'כמו': 'kmo',
  'אבל': 'aval', 'כי': 'ki', 'אז': 'az', 'שם': 'sham', 'פה': 'po',
  'אני': 'ani', 'אתה': 'ata', 'אנחנו': 'anachnu',
  'אתם': 'atem', 'אתן': 'aten', 'אותי': 'oti', 'אותך': 'otcha',
  'אותו': 'oto', 'אותה': 'ota', 'אותנו': 'otanu', 'כולם': 'kulam',
  'הכל': 'hakol', 'היום': 'hayom', 'הלילה': 'halayla', 'לילה': 'layla',
  'יום': 'yom', 'ימים': 'yamim', 'עולם': 'olam', 'לב': 'lev',
  'אהבה': 'ahava', 'אוהב': 'ohev', 'אוהבת': 'ohevet', 'אוהבים': 'ohavim',
  'חיים': 'chayim', 'חלום': 'chalom', 'חלומות': 'chalomot', 'דרך': 'derech',
  'בית': 'bayit', 'שיר': 'shir', 'שרה': 'shara', 'שר': 'shar', 'קול': 'kol',
  'רוח': 'ruach', 'נשמה': 'neshama', 'ים': 'yam', 'שמיים': 'shamayim',
  'עיניים': 'einayim', 'דמעות': 'demaot', 'בוא': 'bo', 'בואי': 'boi',
  'בואו': 'bou', 'תמיד': 'tamid', 'אחרי': 'acharei', 'לפני': 'lifnei',
  'בלי': 'bli', 'בשביל': 'bishvil', 'רוצה': 'rotse', 'צריך': 'tsarich',
  'יכול': 'yachol', 'יכולה': 'yechola', 'עכשיו': 'achshav', 'כאן': 'kan',
  'מאוד': 'meod', 'טוב': 'tov', 'טובה': 'tova', 'יפה': 'yafe',
  'אור': 'or', 'חושך': 'choshech', 'ילד': 'yeled', 'ילדה': 'yalda',
  'מלך': 'melech', 'מלכה': 'malka',
  // — rozšíření: nejčastější slova z písňových textů, kde heuristika
  //   nemá šanci trefit správné samohlásky —
  'שלו': 'shelo', 'שלה': 'shela', 'שלנו': 'shelanu', 'שלכם': 'shelachem',
  'שלהם': 'shelahem', 'לנו': 'lanu', 'לכם': 'lachem', 'להם': 'lahem',
  'בי': 'bi', 'בך': 'becha', 'בו': 'bo', 'בה': 'ba', 'בנו': 'banu',
  'אותם': 'otam', 'אותן': 'otan',
  'איך': 'eich', 'איפה': 'eifo', 'למה': 'lama', 'מתי': 'matai',
  'כמה': 'kama', 'ככה': 'kacha', 'אולי': 'ulai', 'אפשר': 'efshar',
  'רוצים': 'rotsim', 'צריכה': 'tsricha', 'יודע': 'yodea', 'יודעת': 'yodaat',
  'חושב': 'choshev', 'חושבת': 'choshevet', 'מרגיש': 'margish', 'מרגישה': 'margisha',
  'הזה': 'haze', 'הזאת': 'hazot', 'האלה': 'haele', 'שוב': 'shuv',
  'פעם': 'paam', 'פתאום': 'pitom', 'לבד': 'levad', 'יחד': 'yachad',
  'ביחד': 'beyachad', 'קצת': 'ktsat', 'הרבה': 'harbe', 'יותר': 'yoter',
  'פחות': 'pachot', 'הכי': 'hachi', 'ממש': 'mamash', 'באמת': 'beemet',
  'אמת': 'emet', 'כבר': 'kvar', 'עדיין': 'adayin',
  'שמש': 'shemesh', 'ירח': 'yareach', 'כוכב': 'kochav', 'כוכבים': 'kochavim',
  'ארץ': 'erets', 'עיר': 'ir', 'רחוב': 'rechov', 'מקום': 'makom',
  'זמן': 'zman', 'רגע': 'rega', 'שנה': 'shana', 'שנים': 'shanim',
  'מילים': 'milim', 'מילה': 'mila', 'סיפור': 'sipur', 'סוף': 'sof',
  'התחלה': 'hatchala', 'דבר': 'davar', 'דברים': 'dvarim',
  'ידיים': 'yadayim', 'יד': 'yad', 'גוף': 'guf', 'פנים': 'panim',
  'חיוך': 'chiyuch', 'שפתיים': 'sfatayim',
  'ילדים': 'yeladim', 'אישה': 'isha', 'איש': 'ish', 'אנשים': 'anashim',
  'חבר': 'chaver', 'חברה': 'chavera',
  'בוקר': 'boker', 'ערב': 'erev', 'שבת': 'shabat',
  'מוזיקה': 'muzika', 'לרקוד': 'lirkod', 'לשיר': 'lashir',
  'לחיות': 'lichyot', 'לאהוב': 'leehov',
  'תן': 'ten', 'תני': 'tni', 'קח': 'kach', 'תגיד': 'tagid', 'תגידי': 'tagidi',
  'עליי': 'alai', 'עליך': 'alecha', 'עלייך': 'alayich', 'עליו': 'alav',
  'עליה': 'aleha', 'אליי': 'elai', 'אליך': 'elecha', 'אליו': 'elav',
  'איתי': 'iti', 'איתך': 'itcha', 'איתו': 'ito', 'איתה': 'ita',
  'גדול': 'gadol', 'גדולה': 'gdola', 'קטן': 'katan', 'קטנה': 'ktana',
  'חדש': 'chadash', 'חדשה': 'chadasha',
  'תודה': 'toda', 'בבקשה': 'bevakasha', 'סליחה': 'slicha',
  'אלוהים': 'elohim', 'מלאך': 'malach',
  'אש': 'esh', 'מים': 'mayim', 'אדמה': 'adama', 'פרח': 'perach',
  'פרחים': 'prachim', 'גשם': 'geshem', 'חורף': 'choref', 'קיץ': 'kayits',
  'אביב': 'aviv',
  'לבן': 'lavan', 'שחור': 'shachor', 'כחול': 'kachol', 'אדום': 'adom',
  'אחד': 'echad', 'אחת': 'achat', 'שניים': 'shnayim', 'שתיים': 'shtayim',
  'ראשון': 'rishon', 'אחרון': 'acharon', 'אחרונה': 'achrona',
  'הביתה': 'habayta', 'בבית': 'babayit', 'בלב': 'balev', 'בלילה': 'balayla',
  'ביום': 'bayom', 'בעולם': 'baolam', 'העולם': 'haolam', 'החיים': 'hachayim',
  'הלב': 'halev', 'האהבה': 'haahava', 'השמיים': 'hashamayim', 'העיניים': 'haeinayim',
}

function hebrewWordToLatin(word) {
  // interpunkci kolem slova zachováme, jádro zkusíme najít ve slovníku;
  // klíč slovníku je bez vokalizace (niqqud/kantilace), aby vokalizovaný
  // text pořád trefil slovníková slova — tečky šin/sin ale necháváme,
  // protože mění souhlásku (סׂ ≠ שׁ) a slovo s nimi má číst engine
  const core = word.replace(/[^֐-׿]/gu, '')
  const bare = core.replace(/[֑-ֽֿ׀׃-ׇ]/g, '')
  const known = HEB_COMMON[bare]
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
    if (ch === 'ש') {
      if (chars[i + 1] === 'ׂ') { units.push('s'); i++; continue }
      if (chars[i + 1] === 'ׁ') { units.push('sh'); i++; continue }
      units.push('sh')
      continue
    }
    if (ch === 'ו') {
      if (chars[i + 1] === 'ו') { units.push('v'); i++; continue } // וו = souhláska v
      if (chars[i + 1] === 'ֹ' || chars[i + 1] === 'ֺ') { units.push('o'); i++; continue } // holam
      if (chars[i + 1] === 'ּ') { units.push('u'); i++; continue } // šuruk
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
    if (ch === 'ב') { units.push(i === 0 || chars[i + 1] === 'ּ' ? 'b' : 'v'); continue }
    if (ch === 'כ' || ch === 'ך') { units.push((i === 0 && ch === 'כ') || chars[i + 1] === 'ּ' ? 'k' : 'ch'); continue }
    if (ch === 'פ' || ch === 'ף') { units.push((i === 0 && ch === 'פ') || chars[i + 1] === 'ּ' ? 'p' : 'f'); continue }
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
    .map((token) => (HEBREW_RE.test(token) ? hebrewWordToLatin(token) : token))
    .join('')
}

// ---------- arabština ----------
// Běžné texty jsou bez samohláskových značek. Stejně jako u hebrejštiny proto
// kombinujeme slovník krátkých častých slov a zpívatelnou heuristiku.

const AR_LETTERS = {
  'ء': '', 'ؤ': 'u', 'ئ': 'i', 'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'a',
  'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h', 'خ': 'kh',
  'د': 'd', 'ذ': 'dh', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh',
  'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a*', 'غ': 'gh',
  'ف': 'f', 'ق': 'q', 'ك': 'k', 'ک': 'k', 'ل': 'l', 'م': 'm',
  'ن': 'n', 'ه': 'h', 'ة': 'a', 'ى': 'a', 'پ': 'p', 'چ': 'ch',
  'ژ': 'zh', 'گ': 'g',
}

const AR_DIACRITICS = {
  'َ': 'a', 'ً': 'an', 'ُ': 'u', 'ٌ': 'un', 'ِ': 'i', 'ٍ': 'in',
}

const AR_COMMON = {
  'و': 'wa', 'يا': 'ya', 'في': 'fi', 'من': 'min', 'على': 'ala',
  'الى': 'ila', 'إلى': 'ila', 'انا': 'ana', 'أنا': 'ana', 'انت': 'inta',
  'أنت': 'inta', 'هو': 'huwa', 'هي': 'hiya', 'نحن': 'nahnu', 'هذا': 'hadha',
  'هذه': 'hadhihi', 'ما': 'ma', 'لا': 'la', 'لم': 'lam', 'لن': 'lan',
  'كل': 'kul', 'كلها': 'kulha', 'عندي': 'indi', 'قلبي': 'qalbi',
  'حبيبي': 'habibi', 'حبيبتي': 'habibti', 'عمري': 'omri', 'روحي': 'ruhi',
  'نور': 'nur', 'العين': 'alain', 'الليل': 'allayl', 'ليل': 'layl',
  'ليلة': 'layla', 'دنيا': 'dunya', 'الحب': 'alhub', 'حب': 'hub',
  'بحبك': 'bahibbak', 'احبك': 'ahibbak', 'أحبك': 'ahibbak',
  'كمان': 'kaman', 'مرة': 'marra', 'بعد': 'baad', 'قبل': 'qabl',
  'اليوم': 'alyom', 'بكرة': 'bukra', 'تعال': 'taal', 'تعالي': 'taali',
  // — rozšíření: častá slova z arabských písní —
  'الله': 'allah', 'والله': 'wallah', 'يلا': 'yalla',
  'حياتي': 'hayati', 'حياة': 'hayat', 'عمر': 'omr',
  'انتي': 'inti', 'أنتي': 'inti', 'هم': 'hum',
  'ليه': 'leh', 'ليش': 'lesh', 'شو': 'shu', 'مين': 'min', 'وين': 'wen',
  'كيف': 'kif', 'متى': 'mata', 'هنا': 'huna', 'هناك': 'hunak',
  'عشق': 'ishq', 'غرام': 'gharam', 'شوق': 'shoq',
  'كتير': 'ktir', 'كثير': 'kathir', 'شوية': 'shwaya', 'خلاص': 'khalas',
  'يعني': 'yaani', 'بس': 'bas', 'لازم': 'lazem', 'ممكن': 'mumkin', 'مش': 'mish',
  'معايا': 'maaya', 'معاك': 'maak', 'معاكي': 'maaki',
  'قلب': 'qalb', 'قمر': 'qamar', 'القمر': 'alqamar', 'شمس': 'shams',
  'الشمس': 'ashshams', 'نجوم': 'nujum', 'سما': 'sama', 'سماء': 'samaa',
  'بحر': 'bahr', 'الدنيا': 'addunya', 'روح': 'ruh', 'الروح': 'arruh',
  'سنة': 'sana', 'يوم': 'yom', 'ليالي': 'layali', 'صباح': 'sabah', 'مساء': 'masaa',
  'اغنية': 'ughniya', 'كلام': 'kalam', 'كلمة': 'kalima', 'صوت': 'sot',
  'موسيقى': 'musiqa',
  'جميل': 'jamil', 'جميلة': 'jamila', 'حلو': 'helw', 'حلوة': 'helwa',
  'غالي': 'ghali', 'قريب': 'qarib', 'بعيد': 'baid', 'الليلة': 'allayla',
}

function arabicWordToLatin(word) {
  const core = word.replace(/[^\u0600-\u06ff\u0750-\u077f]/gu, '')
  const bare = core.replace(/[\u064b-\u065f\u0670ـ]/g, '')
  const known = AR_COMMON[bare] ?? AR_COMMON[core]
  if (known) return word.replace(core, known)
  return arabicLetters(word)
}

// „Sluneční" písmena: člen ال se před nimi asimiluje (الشمس → ash-shams).
const AR_SUN = 'تثدذرزسشصضطظلن'

function arabicLetters(word) {
  const chars = [...word]
  const units = []
  let start = 0
  if (chars[0] === 'ا' && chars[1] === 'ل' && AR_SUN.includes(chars[2] ?? '')) {
    const sun = AR_LETTERS[chars[2]] ?? chars[2]
    units.push('a', sun + sun) // zdvojení jako jeden celek, ať mezi ně nevleze „a"
    start = 3
  }
  for (let i = start; i < chars.length; i++) {
    const ch = chars[i]
    if (ch === 'ـ') continue
    if (AR_DIACRITICS[ch]) {
      units.push(AR_DIACRITICS[ch])
      continue
    }
    if (ch === 'ّ') {
      const prev = units[units.length - 1]
      if (prev && !isVowelEnd(prev)) units.push(prev)
      continue
    }
    if (/[\u0652\u0670]/.test(ch)) continue
    if (ch === 'و') {
      if (i > 0 && !isVowelEnd(units[units.length - 1])) units.push('u')
      else units.push('w')
      continue
    }
    if (ch === 'ي' || ch === 'ی') {
      if (i > 0 && !isVowelEnd(units[units.length - 1])) units.push('i')
      else units.push('y')
      continue
    }
    const mapped = AR_LETTERS[ch]
    if (mapped !== undefined) {
      if (mapped.endsWith('*')) {
        if (i === 0 || !isVowelEnd(units[units.length - 1])) units.push(mapped.slice(0, -1))
        continue
      }
      units.push(mapped)
      continue
    }
    units.push(ch.toLowerCase())
  }

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

function arabicToLatin(text) {
  return text
    .split(/(\s+)/)
    .map((token) => (ARABIC_RE.test(token) ? arabicWordToLatin(token) : token))
    .join('')
}

// ---------- japonština: kana ----------

const KANA_BASE = {
  'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
  'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
  'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go',
  'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so',
  'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',
  'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
  'だ': 'da', 'ぢ': 'ji', 'づ': 'zu', 'で': 'de', 'ど': 'do',
  'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
  'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
  'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
  'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po',
  'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
  'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
  'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
  'わ': 'wa', 'を': 'o', 'ん': 'n',
  'ぁ': 'a', 'ぃ': 'i', 'ぅ': 'u', 'ぇ': 'e', 'ぉ': 'o',
}

const KANA_DIGRAPHS = {
  'きゃ': 'kya', 'きゅ': 'kyu', 'きょ': 'kyo',
  'ぎゃ': 'gya', 'ぎゅ': 'gyu', 'ぎょ': 'gyo',
  'しゃ': 'sha', 'しゅ': 'shu', 'しょ': 'sho',
  'じゃ': 'ja', 'じゅ': 'ju', 'じょ': 'jo',
  'ちゃ': 'cha', 'ちゅ': 'chu', 'ちょ': 'cho',
  'にゃ': 'nya', 'にゅ': 'nyu', 'にょ': 'nyo',
  'ひゃ': 'hya', 'ひゅ': 'hyu', 'ひょ': 'hyo',
  'びゃ': 'bya', 'びゅ': 'byu', 'びょ': 'byo',
  'ぴゃ': 'pya', 'ぴゅ': 'pyu', 'ぴょ': 'pyo',
  'みゃ': 'mya', 'みゅ': 'myu', 'みょ': 'myo',
  'りゃ': 'rya', 'りゅ': 'ryu', 'りょ': 'ryo',
}

function toHiragana(ch) {
  const code = ch.codePointAt(0)
  if (code >= 0x30a1 && code <= 0x30f6) return String.fromCodePoint(code - 0x60)
  return ch
}

function firstConsonant(unit) {
  const match = unit.match(/^[bcdfghjklmnpqrstvwxyz]+/)
  return match?.[0]?.slice(-1) ?? ''
}

function kanaToLatin(text) {
  const chars = [...text]
  let out = ''
  let doubleNext = false
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]
    if (ch === 'ー') {
      const vowel = out.match(/[aeiou](?!.*[aeiou])/)?.[0] ?? ''
      out += vowel
      continue
    }
    const hira = toHiragana(ch)
    if (hira === 'っ') {
      doubleNext = true
      continue
    }
    const next = chars[i + 1] ? toHiragana(chars[i + 1]) : ''
    let unit = KANA_DIGRAPHS[hira + next]
    if (unit) i++
    else unit = KANA_BASE[hira] ?? ch
    if (doubleNext) {
      out += firstConsonant(unit)
      doubleNext = false
    }
    out += unit
  }
  return out
}

// ---------- řečtina ----------
// Moderní (novořecká) výslovnost — knihovna transliteration přepisuje
// antickou (η→e, υ→y, digrafy nechává), což je pro dnešní písně špatně.

const GR_SINGLE = {
  'α': 'a', 'β': 'v', 'γ': 'g', 'δ': 'd', 'ε': 'e', 'ζ': 'z', 'η': 'i',
  'θ': 'th', 'ι': 'i', 'κ': 'k', 'λ': 'l', 'μ': 'm', 'ν': 'n', 'ξ': 'x',
  'ο': 'o', 'π': 'p', 'ρ': 'r', 'σ': 's', 'ς': 's', 'τ': 't', 'υ': 'i',
  'φ': 'f', 'χ': 'h', 'ψ': 'ps', 'ω': 'o',
}
const GR_LETTER = /[α-ως]/
const GR_VOICED = /[αεηιουωβγδζλμνρ]/ // αυ/ευ zní av/ev před znělou, af/ef před neznělou

function greekToLatin(text) {
  // přízvuky/dýchání pro výslovnost nehrají roli — pryč s nimi (NFD),
  // velká písmena v přepisu pro zpěv nepotřebujeme
  const s = text.normalize('NFD').replace(/[̀-ͯͅ]/g, '').toLowerCase()
  const chars = [...s]
  let out = ''
  for (let i = 0; i < chars.length; i++) {
    const a = chars[i]
    const b = chars[i + 1] ?? ''
    const pair = a + b
    const atStart = i === 0 || !GR_LETTER.test(chars[i - 1] ?? '')
    if (pair === 'ου') { out += 'u'; i++; continue }
    if (pair === 'αι') { out += 'e'; i++; continue }
    if (pair === 'ει' || pair === 'οι' || pair === 'υι') { out += 'i'; i++; continue }
    if (pair === 'αυ' || pair === 'ευ' || pair === 'ηυ') {
      const base = pair === 'αυ' ? 'a' : pair === 'ευ' ? 'e' : 'i'
      const c = chars[i + 2] ?? ''
      out += base + (GR_VOICED.test(c) ? 'v' : 'f')
      i++
      continue
    }
    if (pair === 'μπ') { out += atStart ? 'b' : 'mb'; i++; continue }
    if (pair === 'ντ') { out += atStart ? 'd' : 'nd'; i++; continue }
    if (pair === 'γκ') { out += atStart ? 'g' : 'ng'; i++; continue }
    if (pair === 'γγ') { out += 'ng'; i++; continue }
    if (pair === 'τζ') { out += 'dz'; i++; continue }
    if (a === 'γ' && ('εηιυ'.includes(b) || ((b === 'α' || b === 'ο') && chars[i + 2] === 'ι'))) {
      out += 'y' // γ před předními samohláskami měkne (για → ya)
      continue
    }
    out += GR_SINGLE[a] ?? a
  }
  return out
}

// ---------- veřejné API ----------

// Přepis se počítá při každém překreslení karaoke — cache je nutnost.
const cache = new Map()

export function romanize(text) {
  const key = text || ''
  const hit = cache.get(key)
  if (hit !== undefined) return hit

  let out
  if (HEBREW_RE.test(key)) {
    out = hebrewToLatin(key)
  } else if (ARABIC_RE.test(key)) {
    out = arabicToLatin(key)
  } else if (KANA_RE.test(key)) {
    // Japonština: kanu přepíšeme rovnou, kanji necháme projít beze změny —
    // knihovna by je četla čínsky, což je pro japonskou píseň zavádějící.
    // Správné čtení kanji doplní server (/api/romanize) přes warmRomanizeCache.
    out = kanaToLatin(key)
  } else if (GREEK_RE.test(key)) {
    out = greekToLatin(key)
  } else if (KOREAN_RE.test(key)) {
    out = koreanToLatin(key)
  } else {
    // knihovna u některých písem vkládá technické značky — pro čtení je vyhodíme
    out = transliterate(key).replace(/[`@ʾʿ]/g, '')
  }
  out = out.replace(/\s+/g, ' ').trim()

  if (cache.size > 2000) cache.clear()
  cache.set(key, out)
  return out
}

// ---------- serverové doladění japonštiny ----------
// Čtení kanji závisí na kontextu — to zvládne jen slovníkový analyzátor na
// serveru (/api/romanize). Výsledky se zapíšou rovnou do cache, takže další
// volání romanize() už vrací správné rómadži. Bez serveru (statický hosting,
// offline) se nic neděje — zůstane lokální přepis kany s kanji beze změny.
const warmedLines = new Set()

export async function warmRomanizeCache(lines) {
  if (!Array.isArray(lines) || lines.length === 0) return
  const texts = lines.filter((line) => typeof line === 'string')
  // bez jediné kany nejde o japonštinu (čínštinu na ja-server neposílat)
  if (!texts.some((line) => KANA_RE.test(line))) return
  const targets = [...new Set(texts.filter((line) => HAN_RE.test(line) && !warmedLines.has(line)))]
    .slice(0, 200)
  if (targets.length === 0) return
  targets.forEach((line) => warmedLines.add(line))
  try {
    const res = await fetch('/api/romanize', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ lang: 'ja', lines: targets }),
    })
    if (!res.ok) return
    const data = await res.json()
    data?.lines?.forEach((romaji, i) => {
      if (typeof romaji === 'string' && romaji.trim()) {
        cache.set(targets[i], romaji.replace(/\s+/g, ' ').trim())
      }
    })
  } catch {
    // server nedostupný — tichý fallback na lokální přepis
  }
}
