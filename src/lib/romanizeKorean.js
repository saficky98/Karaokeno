// Korejština → latinka (revidovaná romanizace) s výslovnostními pravidly,
// která jsou při zpěvu opravdu slyšet: přesun koncové souhlásky před
// samohlásku (말이 → mari), oslabení ㅎ (좋아 → joa), nosová asimilace
// (합니다 → hamnida) a splynutí ㄹ/ㄴ (설날 → seollal). Knihovní přepis
// po slabikách tato pravidla ignoruje a dává nezpívatelné výsledky.

const INITIALS = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h']
const MEDIALS = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i']
const FINALS = ['', 'g', 'kk', 'gs', 'n', 'nj', 'nh', 'd', 'l', 'lg', 'lm', 'lb', 'ls', 'lt', 'lp', 'lh', 'm', 'b', 'bs', 's', 'ss', 'ng', 'j', 'ch', 'k', 't', 'p', 'h']

// Výslovnost koncovky v kodě (když nenásleduje samohláska).
const CODA = {
  g: 'k', kk: 'k', gs: 'k', n: 'n', nj: 'n', nh: 'n', d: 't', l: 'l',
  lg: 'k', lm: 'm', lb: 'l', ls: 'l', lt: 'l', lp: 'p', lh: 'l',
  m: 'm', b: 'p', bs: 'p', s: 't', ss: 't', ng: 'ng', j: 't', ch: 't',
  k: 'k', t: 't', p: 'p', h: 't',
}

// Rozklad koncových shluků: první část zůstává v kodě, druhá se před
// samohláskou přesouvá do nástupu další slabiky (읽어 → il-geo).
const SPLIT = {
  gs: ['g', 's'], nj: ['n', 'j'], nh: ['n', 'h'], lg: ['l', 'g'],
  lm: ['l', 'm'], lb: ['l', 'b'], ls: ['l', 's'], lt: ['l', 't'],
  lp: ['l', 'p'], lh: ['l', 'h'], bs: ['b', 's'],
}

export const KOREAN_RE = /[가-힯]/

export function koreanToLatin(text) {
  const syls = [...text].map((ch) => {
    const cp = ch.codePointAt(0)
    if (cp < 0xac00 || cp > 0xd7a3) return { raw: ch }
    const idx = cp - 0xac00
    return {
      ini: INITIALS[Math.floor(idx / 588)],
      med: MEDIALS[Math.floor((idx % 588) / 28)],
      fin: FINALS[idx % 28],
    }
  })

  for (let i = 0; i < syls.length; i++) {
    const s = syls[i]
    if (s.raw) continue
    const n = syls[i + 1]
    if (!n || n.raw) {
      s.coda = s.fin ? CODA[s.fin] : ''
      continue
    }
    if (n.ini === '') {
      // před samohláskou se poslední souhláska koncovky přesune do nástupu
      const parts = s.fin ? (SPLIT[s.fin] ?? [s.fin]) : []
      let move = parts.pop() ?? ''
      if (move === 'h') move = '' // ㅎ mezi samohláskami mizí (좋아 → joa)
      if (move === 'l') move = 'r' // ㄹ v nástupu zní r (말이 → mari)
      n.ini = move
      s.coda = parts.length ? CODA[parts[0]] : ''
      continue
    }
    let coda = CODA[s.fin] ?? ''
    let ini = n.ini
    // ㅎ + ㄱ/ㄷ/ㅈ → přídech (좋다 → jota)
    if ((s.fin === 'h' || s.fin === 'nh' || s.fin === 'lh') && (ini === 'g' || ini === 'd' || ini === 'j')) {
      ini = ini === 'g' ? 'k' : ini === 'd' ? 't' : 'ch'
      coda = s.fin === 'nh' ? 'n' : s.fin === 'lh' ? 'l' : ''
    }
    // ㄹ po jiné souhlásce než ㄹ zní n (대학로 → daehangno)
    if (ini === 'r' && coda && coda !== 'l') ini = 'n'
    // nosová asimilace: k/t/p před n/m → ng/n/m (합니다 → hamnida)
    if (coda === 'k' && (ini === 'n' || ini === 'm')) coda = 'ng'
    else if (coda === 't' && (ini === 'n' || ini === 'm')) coda = 'n'
    else if (coda === 'p' && (ini === 'n' || ini === 'm')) coda = 'm'
    // splynutí ㄹ/ㄴ → ll (설날 → seollal)
    if (coda === 'n' && ini === 'r') { coda = 'l'; ini = 'l' }
    if (coda === 'l' && (ini === 'n' || ini === 'r')) ini = 'l'
    s.coda = coda
    n.ini = ini
  }

  return syls
    .map((s) => (s.raw !== undefined ? s.raw : s.ini + s.med + (s.coda ?? '')))
    .join('')
}
