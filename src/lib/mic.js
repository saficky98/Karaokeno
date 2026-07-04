// Práce s mikrofonem: jeden stream pro celé sezení, analýza hlasitosti a výšky tónu.
// Zvuk se nikam neposílá ani nenahrává — vše se počítá jen v prohlížeči.

let stream = null
let audioContext = null

export async function requestMic() {
  if (stream?.active) return stream
  stream = await navigator.mediaDevices.getUserMedia({
    // echoCancellation MUSÍ být vypnuté: s ním prohlížeč (hlavně iOS) zapne
    // „hovorový" režim a ztlumuje přehrávanou hudbu, když se zpívá.
    audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
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

// Spustí smyčku analýzy: ~20× za sekundu volá onFrame({rms, f0, dt}).
// Vrací funkci stop().
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
  analyser.fftSize = 2048
  source.connect(highpass)
  highpass.connect(analyser)

  const buffer = new Float32Array(analyser.fftSize)
  let running = true
  let last = performance.now()
  let timer = null

  function tick() {
    if (!running) return
    const now = performance.now()
    const dt = Math.min(0.25, (now - last) / 1000)
    last = now
    analyser.getFloatTimeDomainData(buffer)
    const rms = computeRms(buffer)
    const f0 = detectPitch(buffer, audioContext.sampleRate)
    onFrame({ rms, f0, dt })
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
export function detectPitch(buffer, sampleRate) {
  const size = buffer.length
  const rms = computeRms(buffer)
  if (rms < 0.006) return null

  const minLag = Math.floor(sampleRate / 1000)
  const maxLag = Math.floor(sampleRate / 70)
  let bestLag = -1
  let bestCorrelation = 0

  for (let lag = minLag; lag <= maxLag && lag < size / 2; lag++) {
    let correlation = 0
    for (let i = 0; i < size - lag; i += 2) {
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
  for (let i = 0; i < size; i += 2) energy += buffer[i] * buffer[i]
  if (energy === 0 || bestCorrelation / energy < 0.26) return null

  return sampleRate / bestLag
}
