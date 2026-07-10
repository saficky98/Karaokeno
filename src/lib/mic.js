// Práce s mikrofonem: jeden stream pro celé sezení, analýza hlasitosti a výšky tónu.
// Zvuk se nikam neposílá ani nenahrává — vše se počítá jen v prohlížeči.

let stream = null
let audioContext = null

export async function requestMic() {
  if (stream?.active) return stream
  stream = await navigator.mediaDevices.getUserMedia({
    // echoCancellation MUSÍ být vypnuté: s ním prohlížeč (hlavně iOS) zapne
    // „hovorový" režim a ztlumuje přehrávanou hudbu, když se zpívá.
    // autoGainControl taky vypnuté: při hlasité hudbě z reproduktorů AGC
    // stáhne citlivost a hlas zpěváka spadne pod prahy — normalizaci
    // hlasitosti si děláme sami v startAnalysis (adaptivní zesílení).
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
  })
  return stream
}

export function hasMic() {
  return Boolean(stream?.active)
}

export function releaseMic() {
  stream?.getTracks().forEach((track) => track.stop())
  stream = null
}

// Cílová hlasitost, na kterou adaptivní zesílení normalizuje špičky zpěvu.
const GAIN_TARGET = 0.08
const GAIN_MAX = 24

// Spustí smyčku analýzy: ~20× za sekundu volá
// onFrame({rms, f0, dt, flatness, highRatio}). Vrací funkci stop().
export function startAnalysis(onFrame) {
  if (!stream?.active) return () => {}
  audioContext = audioContext ?? new (window.AudioContext || window.webkitAudioContext)()
  if (audioContext.state === 'suspended') audioContext.resume()

  const source = audioContext.createMediaStreamSource(stream)
  const highpass = audioContext.createBiquadFilter()
  highpass.type = 'highpass'
  highpass.frequency.value = 75
  highpass.Q.value = 0.7
  const analyser = audioContext.createAnalyser()
  analyser.fftSize = 4096
  source.connect(highpass)
  highpass.connect(analyser)

  const buffer = new Float32Array(analyser.fftSize)
  const freqDb = new Float32Array(analyser.frequencyBinCount)
  let running = true
  let last = performance.now()
  let timer = null
  // Adaptivní zesílení místo AGC prohlížeče: sledujeme špičkovou hlasitost
  // sezení a slabý signál (tichý mikrofon, telefon daleko od úst) digitálně
  // zesílíme, aby prahy v detekci i skórování odpovídaly realitě.
  let sessionPeak = GAIN_TARGET / GAIN_MAX

  function tick() {
    if (!running) return
    const now = performance.now()
    const dt = Math.min(0.25, (now - last) / 1000)
    last = now
    analyser.getFloatTimeDomainData(buffer)
    const rawRms = computeRms(buffer)
    sessionPeak = Math.max(rawRms, sessionPeak * 0.999, GAIN_TARGET / GAIN_MAX)
    const gain = Math.min(GAIN_MAX, Math.max(1, GAIN_TARGET / sessionPeak))
    if (gain > 1) {
      for (let i = 0; i < buffer.length; i++) buffer[i] *= gain
    }
    const rms = rawRms * gain
    const f0 = detectPitch(buffer, audioContext.sampleRate)
    analyser.getFloatFrequencyData(freqDb)
    const { flatness, highRatio } = computeSpectralFeatures(
      freqDb,
      audioContext.sampleRate,
      analyser.fftSize,
    )
    onFrame({ rms, f0, dt, flatness, highRatio })
    timer = setTimeout(tick, 50) // ~20 fps — šetrné ke starším telefonům
  }
  tick()

  return () => {
    running = false
    clearTimeout(timer)
    highpass.disconnect()
    source.disconnect()
  }
}

function computeRms(buffer) {
  let sum = 0
  for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i]
  return Math.sqrt(sum / buffer.length)
}

// Jednoduchá autokorelační detekce výšky tónu (70–1000 Hz).
// Vrací frekvenci v Hz, nebo null když tón není zřetelný.
// Korelace běží nad prvními 2048 vzorky (i u většího bufferu) — při 70 Hz
// je maximální lag ~686 vzorků, takže okno bohatě stačí a CPU cena je stálá.
export function detectPitch(buffer, sampleRate) {
  const size = Math.min(buffer.length, 2048)
  const rms = computeRms(buffer)
  if (rms < 0.003) return null

  const minLag = Math.floor(sampleRate / 1000)
  const maxLag = Math.floor(sampleRate / 70)
  let bestLag = -1
  let bestCorrelation = 0

  for (let lag = minLag; lag <= maxLag && lag < size / 2; lag++) {
    let correlation = 0
    for (let i = 0; i < size - lag; i++) {
      correlation += buffer[i] * buffer[i + lag]
    }
    if (correlation > bestCorrelation) {
      bestCorrelation = correlation
      bestLag = lag
    }
  }

  if (bestLag < 0) return null
  // normalizace: korelace vůči energii signálu — slabá shoda = žádný tón
  let energy = 0
  for (let i = 0; i < size; i++) energy += buffer[i] * buffer[i]
  if (energy === 0 || bestCorrelation / energy < 0.26) return null

  return sampleRate / bestLag
}

// Spektrální plochost (0 = čistý tón, ~1 = šum) z magnitud spektra.
// Píšťalka je téměř čistá sinusoida → plochost velmi nízká a energie
// soustředěná vysoko; zpěv má bohaté harmonické → plochost výrazně vyšší.
export function computeFlatness(mags) {
  let logSum = 0
  let sum = 0
  let n = 0
  for (let i = 0; i < mags.length; i++) {
    const m = Math.max(mags[i], 1e-10)
    logSum += Math.log(m)
    sum += m
    n++
  }
  if (!n || sum <= 0) return 1
  const geo = Math.exp(logSum / n)
  const arith = sum / n
  return Math.min(1, geo / arith)
}

// Ze spektra v dB (getFloatFrequencyData) spočítá plochost v pásmu
// 100 Hz–5 kHz a podíl energie 1,2–5 kHz vůči celému pásmu.
function computeSpectralFeatures(freqDb, sampleRate, fftSize) {
  const binHz = sampleRate / fftSize
  const lo = Math.max(1, Math.round(100 / binHz))
  const hi = Math.min(freqDb.length - 1, Math.round(5000 / binHz))
  const mid = Math.min(hi, Math.round(1200 / binHz))
  if (hi <= lo) return { flatness: 1, highRatio: 0 }

  const mags = new Float64Array(hi - lo + 1)
  let total = 0
  let high = 0
  for (let i = lo; i <= hi; i++) {
    const mag = Math.pow(10, freqDb[i] / 20)
    mags[i - lo] = mag
    const e = mag * mag
    total += e
    if (i >= mid) high += e
  }
  return {
    flatness: computeFlatness(mags),
    highRatio: total > 0 ? high / total : 0,
  }
}
