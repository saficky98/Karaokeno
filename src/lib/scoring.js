// Čistá logika skórování — bez prohlížeče, aby šla testovat samostatně.
//
// Fun score 0–10 000 se skládá z:
//  (a) podíl času, kdy hráč opravdu zpívá (základ každého snímku)
//  (b) stabilita drženého tónu (malé výkyvy výšky = bonus)
//  (c) energie — hlasitost normalizovaná vůči průměru daného hráče,
//      takže tichý zpěvák není znevýhodněný proti tomu, kdo řve.

const ABSOLUTE_FLOOR = 0.003 // pod tímto RMS je vždy ticho (mic.js signál normalizuje)
const MAX_SCORE = 10000
const TRANSIENT_MIN_RMS = 0.035
const TRANSIENT_COOLDOWN = 0.18
const PITCHED_ONSET = 0.09
const UNPITCHED_ONSET = 0.35

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
  }

  setDuration(durationSec) {
    if (!Number.isFinite(durationSec) || durationSec < 30) return
    this.duration = Math.max(30, durationSec)
  }

  // frame: { rms, f0 (Hz nebo null), dt (sekundy) }
  update({ rms, f0, dt }) {
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
    } else {
      this.lastCents = null
    }

    // (c) energie vůči vlastnímu průměru — férovost pro tiché zpěváky
    const energy = this.voicedAvg > 0 ? Math.min(1, rms / (this.voicedAvg * 0.85)) : 1

    const quality = 0.45 + 0.4 * this.stability + 0.15 * energy
    const potential = (dt / this.duration) * MAX_SCORE
    this.score = Math.min(MAX_SCORE, this.score + potential * quality * 1.05)

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
    }
  }
}
