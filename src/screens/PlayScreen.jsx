import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import confetti from 'canvas-confetti'
import YouTubePlayer from '../components/YouTubePlayer.jsx'
import VideoLinkForm from '../components/VideoLinkForm.jsx'
import LiveScoreHUD from '../components/LiveScoreHUD.jsx'
import { requestMic, hasMic, startAnalysis } from '../lib/mic.js'
import { ScoreEngine, scoreComment } from '../lib/scoring.js'

// Panel s textem (a knihovna přepisu písma) se stahuje až při prvním otevření.
const LyricsPanel = lazy(() => import('../components/LyricsPanel.jsx'))

// Odpočet 3-2-1 přes rozjíždějící se video
function Countdown({ onDone }) {
  const [step, setStep] = useState(3)

  useEffect(() => {
    if (step === 0) {
      onDone()
      return
    }
    const timer = setTimeout(() => setStep((s) => s - 1), 850)
    return () => clearTimeout(timer)
  }, [step])

  if (step === 0) return null
  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-night/70">
      <p key={step} className="animate-count-zoom font-display text-9xl font-black text-neon-pink drop-shadow-[0_0_40px_rgba(255,45,146,0.8)]">
        {step}
      </p>
    </div>
  )
}

// Skóre naskakuje od nuly k výsledku
function CountUpScore({ value }) {
  const [shown, setShown] = useState(0)

  useEffect(() => {
    const start = performance.now()
    const duration = 1600
    let frame
    function tick(now) {
      const progress = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - progress, 3)
      setShown(Math.round(value * eased))
      if (progress < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [value])

  return (
    <p className="bg-gradient-to-r from-neon-pink to-neon-cyan bg-clip-text font-display text-6xl font-black text-transparent tabular-nums">
      {shown.toLocaleString('uk-UA')}
    </p>
  )
}

export default function PlayScreen({
  nowPlaying,
  nextItem,
  micConsent, // null = ještě jsme se neptali, 'on' = povoleno, 'off' = bez skórování
  onMicConsent,
  onNext,
  onExit,
  onPlayDirect,
  onGoHome,
  onSongFinished,
  leaderboard,
}) {
  const [playerError, setPlayerError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState(null) // {score, comment} po dozpívání
  const [ended, setEnded] = useState(false)
  const [live, setLive] = useState(null) // {score, level, singing}
  const [micFailed, setMicFailed] = useState(false)
  const [counting, setCounting] = useState(true)
  const [showLyrics, setShowLyrics] = useState(false)

  const engineRef = useRef(null)
  const stopRef = useRef(null)
  const playerApiRef = useRef(null)

  const scoringActive = micConsent === 'on' && !micFailed

  // Úklid analýzy při odchodu z obrazovky / výměně písničky
  useEffect(() => {
    return () => stopRef.current?.()
  }, [nowPlaying?.videoId])

  // Konfety při skvělém výsledku 🎉
  useEffect(() => {
    if (!ended || !result || result.score < 7500) return
    const bursts = [0, 400, 900].map((delay) =>
      setTimeout(() => {
        confetti({
          particleCount: 90,
          spread: 75,
          origin: { y: 0.7, x: 0.2 + Math.random() * 0.6 },
          colors: ['#ff2d92', '#22d3ee', '#a3e635', '#a78bfa', '#facc15'],
          disableForReducedMotion: true,
        })
      }, delay),
    )
    return () => bursts.forEach(clearTimeout)
  }, [ended, result])

  if (!nowPlaying) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
        <p className="text-2xl">🎬</p>
        <p className="text-center text-white/70">
          Поки нічого не грає. Додай пісні до черги на головній — або просто встав посилання:
        </p>
        <div className="w-full max-w-xl">
          <VideoLinkForm onPlayVideo={onPlayDirect} />
        </div>
      </div>
    )
  }

  // Před první písničkou se slušně zeptáme na mikrofon.
  if (micConsent === null) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-5 p-6 text-center">
        <p className="text-5xl">🎙</p>
        <h2 className="text-2xl font-black">Дозволиш мікрофон?</h2>
        <p className="max-w-md text-white/70">
          Ми слухатимемо спів і рахуватимемо веселі бали: скільки співаєш, як тримаєш ноту і скільки
          в тебе енергії. Звук <b>нікуди не записується і не надсилається</b> — все рахується прямо
          на цьому пристрої.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            onClick={async () => {
              try {
                await requestMic()
                onMicConsent('on')
              } catch {
                setMicFailed(true)
                onMicConsent('off')
              }
            }}
            className="rounded-2xl bg-neon-pink px-8 py-4 text-lg font-black text-white shadow-lg shadow-neon-pink/30 transition hover:brightness-110 active:scale-95"
          >
            Дозволити і співати 🎤
          </button>
          <button
            onClick={() => onMicConsent('off')}
            className="rounded-2xl border border-white/20 px-8 py-4 text-lg font-bold text-white/70 transition hover:bg-white/5"
          >
            Без балів
          </button>
        </div>
      </div>
    )
  }

  const { videoId, title, singer } = nowPlaying

  async function startScoring() {
    if (!scoringActive) return
    if (!hasMic()) {
      // po obnovení stránky je potřeba mikrofon získat znovu (prohlížeč si souhlas pamatuje)
      try {
        await requestMic()
      } catch {
        setMicFailed(true)
        return
      }
    }
    const duration = playerApiRef.current?.getDuration?.() || 180
    engineRef.current = new ScoreEngine(duration)
    stopRef.current?.()
    stopRef.current = startAnalysis((frame) => {
      const state = engineRef.current?.update(frame)
      if (state) setLive(state)
    })
  }

  function finishSong() {
    stopRef.current?.()
    stopRef.current = null
    let outcome = null
    if (engineRef.current) {
      const final = engineRef.current.finish()
      outcome = { score: final.score, comment: scoreComment(final.score) }
      engineRef.current = null
      onSongFinished?.({ score: final.score, singerId: singer?.id ?? null, title })
    }
    setResult(outcome)
    setEnded(true)
    setLive(null)
  }

  function goNext() {
    setEnded(false)
    setResult(null)
    setLoading(true)
    setPlayerError(null)
    setCounting(true)
    setShowLyrics(false)
    onNext()
  }

  return (
    <div className="relative h-full">
      <YouTubePlayer
        key={videoId}
        videoId={videoId}
        onReady={(playerApi) => {
          playerApiRef.current = playerApi
          setLoading(false)
          startScoring()
        }}
        onEnded={finishSong}
        onError={(code) => setPlayerError(code)}
      />

      {loading && playerError === null && !ended && !counting && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="animate-pulse text-white/70">Завантажую відео…</p>
        </div>
      )}

      {counting && playerError === null && !ended && <Countdown onDone={() => setCounting(false)} />}

      {showLyrics && !ended && playerError === null && (
        <Suspense fallback={null}>
          <LyricsPanel title={title} playerApiRef={playerApiRef} onClose={() => setShowLyrics(false)} />
        </Suspense>
      )}

      {!ended && playerError === null && !counting && !showLyrics && (
        <button
          onClick={() => setShowLyrics(true)}
          className="absolute right-3 bottom-3 rounded-full bg-black/60 px-4 py-2 text-sm text-white/90 backdrop-blur transition hover:bg-black/80"
        >
          🔤 Текст
        </button>
      )}

      {live && !ended && playerError === null && (
        <LiveScoreHUD score={live.score} level={live.level} singing={live.singing} />
      )}

      {singer && !ended && (
        <div
          className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-black/60 px-3 py-1.5 text-sm backdrop-blur"
          style={{ border: `1px solid ${singer.color}` }}
        >
          <span>{singer.avatar}</span>
          <span className="max-w-32 truncate font-bold" style={{ color: singer.color }}>
            {singer.name}
          </span>
        </div>
      )}

      {playerError !== null && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-night/95 p-6 text-center">
          <p className="text-2xl">😕</p>
          <p className="max-w-md text-white/80">
            {playerError === 101 || playerError === 150
              ? 'Це відео не можна відтворити поза YouTube (власник заборонив вбудовування). Спробуй інше караоке-відео.'
              : 'Не вдалося відтворити відео. Перевір посилання і спробуй ще раз.'}
          </p>
          {nextItem ? (
            <button
              onClick={goNext}
              className="rounded-xl bg-neon-pink px-6 py-3 font-bold text-white transition hover:brightness-110 active:scale-95"
            >
              Наступна пісня ⏭
            </button>
          ) : (
            <div className="w-full max-w-xl">
              <VideoLinkForm onPlayVideo={(id) => { setPlayerError(null); setLoading(true); onPlayDirect(id) }} />
            </div>
          )}
        </div>
      )}

      {/* Po dozpívání: výsledek, žebříček a další zpěvák */}
      {ended && playerError === null && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 overflow-y-auto bg-night/95 p-6 text-center">
          {result && (
            <div className="flex animate-pop-in flex-col items-center gap-1">
              <p className="text-white/60">{singer ? `${singer.avatar} ${singer.name}` : 'Результат'}</p>
              <CountUpScore value={result.score} />
              <p className="max-w-md text-lg text-white/80">{result.comment}</p>
            </div>
          )}

          {leaderboard?.length > 0 && (
            <div className="w-full max-w-sm rounded-2xl bg-panel p-4 text-left">
              <p className="mb-2 text-sm font-bold text-white/60">🏆 Рейтинг вечірки</p>
              <ol className="flex flex-col gap-1">
                {leaderboard.slice(0, 3).map((entry, index) => (
                  <li key={entry.player.id} className="flex items-center gap-2">
                    <span className="w-6">{['🥇', '🥈', '🥉'][index]}</span>
                    <span className="text-lg">{entry.player.avatar}</span>
                    <span className="flex-1 truncate font-bold">{entry.player.name}</span>
                    <span className="font-mono text-neon-cyan tabular-nums">{entry.total.toLocaleString('uk-UA')}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {nextItem ? (
            <>
              <div className="flex items-center gap-3">
                {nextItem.singer && <span className="text-4xl">{nextItem.singer.avatar}</span>}
                <div className="text-left">
                  <p className="text-sm text-white/60">Далі співає:</p>
                  {nextItem.singer && (
                    <p className="text-2xl font-black" style={{ color: nextItem.singer.color }}>
                      {nextItem.singer.name}
                    </p>
                  )}
                  <p className="max-w-60 truncate text-white/70">{nextItem.title || 'Наступна пісня з черги'}</p>
                </div>
              </div>
              <button
                onClick={goNext}
                className="rounded-2xl bg-neon-pink px-8 py-4 text-xl font-black text-white shadow-lg shadow-neon-pink/30 transition hover:brightness-110 active:scale-95"
              >
                Вдуй! 🎤
              </button>
            </>
          ) : (
            <>
              <p className="max-w-md text-white/80">Черга порожня. Додай ще пісень — вечірка тільки починається! 🎉</p>
              <button
                onClick={() => { setEnded(false); setResult(null); onExit(); onGoHome() }}
                className="rounded-xl bg-neon-cyan px-6 py-3 font-bold text-night transition hover:brightness-110 active:scale-95"
              >
                На головну
              </button>
            </>
          )}
        </div>
      )}

      {!ended && (
        <button
          onClick={onExit}
          className="absolute top-3 right-3 rounded-full bg-black/60 px-4 py-2 text-sm text-white/90 backdrop-blur transition hover:bg-black/80"
        >
          ✕ Вийти
        </button>
      )}
    </div>
  )
}
