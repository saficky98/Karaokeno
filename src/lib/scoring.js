// Čistá logika skórování — bez prohlížeče, aby šla testovat samostatně.
//
// Fun score 0–10 000 se skládá z:
//  (a) podíl času, kdy hráč opravdu zpívá (základ každého snímku)
//  (b) stabilita drženého tónu (malé výkyvy výšky = bonus)
//  (c) energie — hlasitost normalizovaná vůči průměru daného hráče,
//      takže tichý zpěvák není znevýhodněný proti tomu, kdo řve.

const ABSOLUTE_FLOOR = 0.012 // pod tímto RMS je vždy ticho
const MAX_SCORE = 10000

export class ScoreEngine {
  constructor(durationSec = 180) {
    this.duration = Math.max(30, durationSec)
    this.score = 0
    this.noiseFloor = 0.006 // pomalu se učí hluk místnosti
    this.voicedAvg = 0 // průměrná hlasitost zpěvu TOHOTO hráče
    this.voicedFrames = 0
    this.totalTime = 0
    this.singTime = 0
    this.stability = 0.5 // EMA stability tónu (0–1)
    this.lastCents = null
  }

  // frame: { rms, f0 (Hz nebo null), dt (sekundy) }
  update({ rms, f0, dt }) {
    this.totalTime += dt
    const threshold = Math.max(ABSOLUTE_FLOOR, this.noiseFloor * 2.5)
    const singing = rms > threshold

    if (!singing) {
      // ticho: pomalu dolaďujeme hluk pozadí
      this.noiseFloor = this.noiseFloor * 0.98 + rms * 0.02
      this.lastCents = null
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
