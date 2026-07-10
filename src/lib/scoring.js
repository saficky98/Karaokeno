// Čistá logika skórování — bez prohlížeče, aby šla testovat samostatně.
//
// Fun score 0–10 000 se skládá z:
//  (a) podíl času, kdy hráč opravdu zpívá (základ každého snímku)
//  (b) stabilita drženého tónu (malé výkyvy výšky = bonus)
//  (c) energie — hlasitost normalizovaná vůči průměru daného hráče,
//      takže tichý zpěvák není znevýhodněný proti tomu, kdo řve
//  (d) melodičnost — zpěv střídá tóny; monotónní bzučení dostane míň
//  (e) „hlasovost" — pískání (čistá sinusoida vysoko ve spektru) sráží
//      násobičem, zpěv s bohatými harmonickými ne
//  (f) načasování — zpívat se má, když běží řádek textu; zpěv v mezihře
//      dává jen zlomek (příznak `active` dodává PlayScreen z textu písně)
//
// Vstupy `flatness`, `highRatio` (spektrum z mic.js) a `active` jsou
// nepovinné — bez nich se rozměry (d)–(f) chovají neutrálně.

const ABSOLUTE_FLOOR = 0.003 // pod tímto RMS je vždy ticho (mic.js signál normalizuje)
const MAX_SCORE = 10000
const TRANSIENT_MIN_RMS = 0.035
const TRANSIENT_COOLDOWN = 0.18
const PITCHED_ONSET = 0.09
const UNPITCHED_ONSET = 0.35
const SCORE_BOOST = 1.35 // dorovnává neutrální načasování (0.8), ať se dá dosáhnout maxima
const EXPR_WINDOW = 8 // s — okno, ve kterém se měří melodičnost

const clamp01 = (x) => Math.max(0, Math.min(1, x))

export class ScoreEngine {
  constructor(durationSec = 180) {
    this.duration = Math.max(30, durationSec)
    this.score = 0
    this.noiseFloor = 0.02 // adaptivní hladina pozadí (hudba z reproduktorů)
    this.voicedAvg = 0 // průměrná hlasitost zpěvu TOHOTO hráče
    this.voicedFrames = 0
    this.totalTime = 0
    this.singTime = 0
    this.stability = 0.5 // EMA stability tónu (0–1)
    this.lastCents = null
    this.lastRms = 0
    this.voiceHold = 0
    this.voiceConfidence = 0
    this.transientCooldown = 0
    this.pitchWindow = [] // posledních ~8 s tónů: {t, st (půltón), cents}
    this.expressiveness = 0.15 // melodičnost (d)
    this.voiceLikeness = 1 // násobič hlasovosti (e)
    this.flatEma = null // EMA spektrální plochosti během zpěvu
    this.highEma = null // EMA podílu vysokého pásma během zpěvu
    this.highF0Time = 0 // jak dlouho drží tón nad ~900 Hz (pískání)
  }

  setDuration(durationSec) {
    if (!Number.isFinite(durationSec) || durationSec < 30) return
    this.duration = Math.max(30, durationSec)
  }

  // frame: { rms, f0 (Hz nebo null), dt (sekundy),
  //          flatness?, highRatio? (spektrum), active? (běží řádek textu) }
  update({ rms, f0, dt, flatness, highRatio, active }) {
    this.totalTime += dt
    const hasPitch = Number.isFinite(f0) && f0 > 0

    // Pozadí NENÍ ticho — na párty hraje z reproduktorů samotná písnička.
    // Hladinu pozadí sledujeme jako pomalé minimum: dolů rychle (nádechy,
    // mezihry), nahoru podle povahy zvuku — bez zřetelného tónu (hudba)
    // rychleji, se zřetelným tónem (zpěvák) jen nepatrně, aby práh
    // nedohnal zpěváka a body nepřestaly přibývat.
    if (rms < this.noiseFloor) {
      this.noiseFloor = this.noiseFloor * 0.7 + rms * 0.3
    } else {
      // se zřetelným tónem (zpěvák) stoupá jen nepatrně — jinak by práh
      // při dlouhé sloce bez nádechu dohnal zpěváka a body by přestaly
      const rise = hasPitch ? 1.0001 : 1.004
      this.noiseFloor = Math.min(this.noiseFloor * rise + 0.00003, rms)
    }

    let threshold = Math.max(ABSOLUTE_FLOOR, this.noiseFloor * 1.35)
    // pojistka: práh nikdy nepřeroste běžnou hlasitost TOHOTO zpěváka —
    // koho jsme už slyšeli zpívat, toho hladina pozadí nesmí odstřihnout
    if (this.voicedFrames > 100) {
      threshold = Math.min(threshold, Math.max(ABSOLUTE_FLOOR, this.voicedAvg * 0.75))
    }
    const loud = rms > threshold
    const fromQuiet = this.lastRms < threshold * 0.8 && rms > Math.max(TRANSIENT_MIN_RMS, threshold * 2.2)
    const hardSpike = rms > Math.max(TRANSIENT_MIN_RMS, this.lastRms * 2.8, threshold * 2.2)
    const transient = loud && (fromQuiet || hardSpike)

    if (transient) {
      this.transientCooldown = Math.max(this.transientCooldown, TRANSIENT_COOLDOWN)
    } else {
      this.transientCooldown = Math.max(0, this.transientCooldown - dt)
    }

    // Zpěv je souvislý signál. Krátká rána do telefonu může být hlasitá,
    // ale po náběhu rychle zmizí, proto po ní chvíli nebodujeme.
    const overThreshold = threshold > 0 ? rms / threshold : 0
    const strongUnpitched = loud && rms > Math.max(threshold * 1.8, threshold + 0.018)
    const voiceLike = loud && !transient && this.transientCooldown <= 0 && (hasPitch || strongUnpitched)

    if (voiceLike) {
      this.voiceHold += dt
      const target = hasPitch ? 1 : Math.min(0.7, this.voiceHold / 0.75)
      const speed = hasPitch ? 0.55 : 0.2
      this.voiceConfidence += (target - this.voiceConfidence) * speed
    } else {
      this.voiceHold = loud && !transient ? Math.max(0, this.voiceHold - dt * 2) : 0
      this.voiceConfidence *= loud ? 0.65 : 0.35
    }

    const singing =
      loud &&
      overThreshold > (hasPitch ? 1.02 : 1.35) &&
      this.voiceHold >= (hasPitch ? PITCHED_ONSET : UNPITCHED_ONSET) &&
      this.voiceConfidence >= (hasPitch ? 0.35 : 0.4)

    if (!singing) {
      this.lastCents = null
      this.lastRms = rms
      return { score: Math.round(this.score), singing: false, level: this.level(rms) }
    }

    this.singTime += dt
    this.voicedFrames += 1
    this.voicedAvg += (rms - this.voicedAvg) / Math.min(this.voicedFrames, 200)

    // (b) stabilita tónu: srovnáváme výšku v centech mezi snímky
    if (f0) {
      const cents = 1200 * Math.log2(f0)
      if (this.lastCents !== null) {
        const drift = Math.abs(cents - this.lastCents) / Math.max(dt / 0.05, 1)
        const stableNow = drift < 35 ? 1 : drift < 90 ? 0.5 : 0
        this.stability = this.stability * 0.95 + stableNow * 0.05
      }
      this.lastCents = cents
      this.pitchWindow.push({ t: this.totalTime, st: Math.round(cents / 100), cents })
      while (this.pitchWindow.length && this.pitchWindow[0].t < this.totalTime - EXPR_WINDOW) {
        this.pitchWindow.shift()
      }
    } else {
      this.lastCents = null
    }

    // (c) energie vůči vlastnímu průměru — férovost pro tiché zpěváky
    const energy = this.voicedAvg > 0 ? Math.min(1, rms / (this.voicedAvg * 0.85)) : 1

    // (d) melodičnost: kolik různých tónů zpěvák střídá a jestli mezi nimi
    // přechází souvisle (melodie), nebo skáče chaoticky (jekot). Monotónní
    // bzučení = jeden půltón = minimum; melodie = několik tónů s plynulými
    // přechody = maximum.
    if (this.pitchWindow.length >= 20) {
      const tones = new Set()
      let moves = 0
      let smooth = 0
      for (let i = 0; i < this.pitchWindow.length; i++) {
        tones.add(this.pitchWindow[i].st)
        if (i > 0) {
          moves += 1
          if (Math.abs(this.pitchWindow[i].cents - this.pitchWindow[i - 1].cents) < 200) smooth += 1
        }
      }
      const variety = clamp01((tones.size - 1) / 5)
      const coherence = moves > 0 ? smooth / moves : 1
      this.expressiveness = Math.max(0.15, variety * (0.3 + 0.7 * coherence))
    }

    // (e) hlasovost: pískání je téměř čistá sinusoida s energií vysoko ve
    // spektru (plochost ≈ 0, highRatio ≈ 1) a/nebo dlouho držený tón nad
    // ~900 Hz; zpěv má bohaté harmonické. Násobič klesá pozvolna (EMA),
    // ať ho krátký hvizd v zpěvu neshodí.
    if (Number.isFinite(flatness)) {
      this.flatEma = this.flatEma === null ? flatness : this.flatEma * 0.9 + flatness * 0.1
    }
    if (Number.isFinite(highRatio)) {
      this.highEma = this.highEma === null ? highRatio : this.highEma * 0.9 + highRatio * 0.1
    }
    if (hasPitch && f0 > 900) this.highF0Time += dt
    else if (hasPitch && f0 < 700) this.highF0Time = Math.max(0, this.highF0Time - dt * 2)
    const pureTone = this.flatEma !== null && this.flatEma < 0.1
    const highBand = this.highEma !== null && this.highEma > 0.7
    let voiceTarget = 1
    if (pureTone && highBand) voiceTarget = 0.25
    else if (this.highF0Time > 2) voiceTarget = 0.5
    this.voiceLikeness += (voiceTarget - this.voiceLikeness) * 0.08

    // (f) načasování: zpěv v běžícím řádku textu platí naplno, v mezihře
    // jen zlomkem; bez informace o textu neutrálně.
    const timing = active === true ? 1 : active === false ? 0.35 : 0.8

    const quality =
      timing *
      this.voiceLikeness *
      (0.3 + 0.25 * this.stability + 0.25 * this.expressiveness + 0.2 * energy)
    const potential = (dt / this.duration) * MAX_SCORE
    this.score = Math.min(MAX_SCORE, this.score + potential * quality * SCORE_BOOST)

    this.lastRms = rms
    return { score: Math.round(this.score), singing: true, level: this.level(rms) }
  }

  // hlasitost 0–1 pro vizualizaci
  level(rms) {
    const reference = Math.max(this.voicedAvg, 0.05)
    return Math.max(0, Math.min(1, rms / (reference * 1.5)))
  }

  finish() {
    const singRatio = this.totalTime > 0 ? this.singTime / this.totalTime : 0
    return {
      score: Math.round(this.score / 10) * 10,
      singRatio,
      stability: this.stability,
      expressiveness: this.expressiveness,
      voiceLikeness: this.voiceLikeness,
    }
  }
}
