import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import confetti from 'canvas-confetti'
import { Clapperboard, Languages, Mic, MicOff, SkipForward, VideoOff, Volume2, VolumeX, X } from 'lucide-react'
import YouTubePlayer from '../components/YouTubePlayer.jsx'
import VideoLinkForm from '../components/VideoLinkForm.jsx'
import LiveScoreHUD from '../components/LiveScoreHUD.jsx'
import Avatar from '../components/Avatar.jsx'
import { requestMic, hasMic, startAnalysis } from '../lib/mic.js'
import { ScoreEngine } from '../lib/scoring.js'
import { isLineActive } from '../lib/lyricTiming.js'
import { useLang, commentKey } from '../lib/i18n.jsx'

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
  onProgress,
  onLyricsDiscovered,
  leaderboard,
}) {
  const { t } = useLang()
  const [playerError, setPlayerError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [result, setResult] = useState(null) // {score, comment} po dozpívání
  const [ended, setEnded] = useState(false)
  const [live, setLive] = useState(null) // {score, level, singing}
  const [micFailed, setMicFailed] = useState(false)
  const [needsUnmute, setNeedsUnmute] = useState(false)
  const [counting, setCounting] = useState(true)
  const [showLyrics, setShowLyrics] = useState(true)
  // null = ještě nevíme, true = text běží, false = neexistuje (schovat tlačítko)
  const [lyricsAvailable, setLyricsAvailable] = useState(null)
  const [soundOn, setSoundOn] = useState(true)
  const [micOn, setMicOn] = useState(true)

  const engineRef = useRef(null)
  const stopRef = useRef(null)
  const playerApiRef = useRef(null)
  const durationTimerRef = useRef(null)
  // Synchronizované řádky textu — přežívají zavření panelu textu, skórování
  // podle nich pozná řádky vs. mezihry.
  const lyricsLinesRef = useRef(null)

  const scoringActive = micConsent === 'on' && !micFailed

  // Úklid analýzy při odchodu z obrazovky / výměně písničky
  useEffect(() => {
    setLyricsAvailable(null)
    lyricsLinesRef.current = null
    return () => {
      clearTimeout(durationTimerRef.current)
      durationTimerRef.current = null
      stopRef.current?.()
    }
  }, [nowPlaying?.videoId])

  // Pozice přehrávání pro hosty v místnosti (každé 2 s) + pojistka: jakmile
  // přehrávač zná skutečnou délku, předá se enginu skóre.
  useEffect(() => {
    if (!nowPlaying) return
    const timer = setInterval(() => {
      const sec = playerApiRef.current?.getCurrentTime?.() ?? 0
      if (sec > 0) onProgress?.(sec, playerApiRef.current?.getDuration?.() ?? 0)
      engineRef.current?.setDuration(playerApiRef.current?.getDuration?.() ?? 0)
    }, 2000)
    return () => clearInterval(timer)
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
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-neon-violet/10 text-neon-violet">
          <Clapperboard size={24} strokeWidth={1.8} />
        </span>
        <p className="max-w-md text-center text-sm text-white/55">
          {t('nothing_playing')}
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
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-neon-pink/10 text-neon-pink">
          <Mic size={28} strokeWidth={1.8} />
        </span>
        <h2 className="font-display text-2xl font-bold">{t('mic_q')}</h2>
        <p className="max-w-md text-sm leading-relaxed text-white/65">
          {t('mic_explain_1')}<b className="text-white/90">{t('mic_explain_bold')}</b>{t('mic_explain_2')}
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
            className="btn-primary px-8 py-4 font-display text-base"
          >
            {t('allow_sing')}
          </button>
          <button onClick={() => onMicConsent('off')} className="btn-secondary px-8 py-4">
            {t('no_scores')}
          </button>
        </div>
      </div>
    )
  }

  const { videoId, title, singer } = nowPlaying

  // Rozjede smyčku analýzy nad stávajícím engine (mikrofon si vyžádá znovu,
  // když je po obnovení stránky potřeba).
  async function runAnalysis() {
    if (!hasMic()) {
      try {
        await requestMic()
      } catch {
        setMicFailed(true)
        return
      }
    }
    stopRef.current?.()
    stopRef.current = startAnalysis((frame) => {
      const lines = lyricsLinesRef.current
      const active = lines
        ? isLineActive(lines, playerApiRef.current?.getCurrentTime?.() ?? 0)
        : undefined
      const state = engineRef.current?.update({ ...frame, active })
      if (state) setLive(state)
    })
  }

  function playerDuration() {
    const duration = playerApiRef.current?.getDuration?.() ?? 0
    return Number.isFinite(duration) && duration >= 30 ? duration : 0
  }

  function syncScoringDuration(attempt = 0) {
    clearTimeout(durationTimerRef.current)
    const duration = playerDuration()
    if (duration) {
      engineRef.current?.setDuration(duration)
      durationTimerRef.current = null
      return
    }
    if (attempt < 24) {
      durationTimerRef.current = setTimeout(() => syncScoringDuration(attempt + 1), 500)
    }
  }

  async function startScoring() {
    if (micConsent !== 'on') return
    engineRef.current = new ScoreEngine(playerDuration() || 180)
    syncScoringDuration()
    await runAnalysis()
  }

  function finishPartialScore() {
    if (!engineRef.current || (engineRef.current.singTime ?? 0) <= 8) return null
    const final = engineRef.current.finish()
    onSongFinished?.({ score: final.score, singerId: singer?.id ?? null, title })
    return final
  }

  function resetScoring() {
    clearTimeout(durationTimerRef.current)
    durationTimerRef.current = null
    engineRef.current = null
    stopRef.current?.()
    stopRef.current = null
    setLive(null)
  }

  // Přepínač mikrofonu: vypnutí zmrazí skórování (nic se nepočítá),
  // zapnutí naváže na rozdělané skóre. Po selhání mikrofonu funguje
  // jako „zkusit znovu".
  function toggleMic() {
    if (micFailed) {
      setMicFailed(false)
      setMicOn(true)
      if (engineRef.current) runAnalysis()
      else startScoring()
      return
    }
    if (micOn) {
      stopRef.current?.()
      stopRef.current = null
      setLive(null)
      setMicOn(false)
    } else {
      setMicOn(true)
      if (engineRef.current) runAnalysis()
      else startScoring()
    }
  }

  // Odchod z písničky: rozzpívané skóre se nezahazuje — když se zpívalo
  // aspoň chvíli, zapíše se do výsledků.
  function handleExit() {
    finishPartialScore()
    resetScoring()
    onExit()
  }

  // Přepínač zvuku videa.
  function toggleSound() {
    const player = playerApiRef.current
    if (!player) return
    if (soundOn) {
      player.mute?.()
      setSoundOn(false)
    } else {
      player.unMute?.()
      setSoundOn(true)
      setNeedsUnmute(false)
    }
  }

  function finishSong() {
    stopRef.current?.()
    stopRef.current = null
    clearTimeout(durationTimerRef.current)
    durationTimerRef.current = null
    let outcome = null
    if (engineRef.current) {
      const final = engineRef.current.finish()
      outcome = { score: final.score }
      engineRef.current = null
      onSongFinished?.({ score: final.score, singerId: singer?.id ?? null, title })
    }
    setResult(outcome)
    setEnded(true)
    setLive(null)
  }

  function goNext() {
    finishPartialScore()
    resetScoring()
    setEnded(false)
    setResult(null)
    setLoading(true)
    setPlayerError(null)
    setCounting(true)
    setShowLyrics(true)
    setLyricsAvailable(null)
    setNeedsUnmute(false)
    setSoundOn(true)
    setMicOn(true)
    setMicFailed(false)
    onNext()
  }

  // Po odpočtu se video musí rozjet SAMO. Zkoušíme opakovaně (přehrávač
  // může ještě nabíhat); teprve když autoplay se zvukem opravdu neprojde
  // (hlavně iPhone), pustíme video ztlumené a ukážeme „Zapnout zvuk".
  function ensurePlaying(attempt = 0) {
    const player = playerApiRef.current
    if (!player?.getPlayerState) {
      if (attempt < 10) setTimeout(() => ensurePlaying(attempt + 1), 500)
      return
    }
    const state = player.getPlayerState?.()
    if (state === 1 || state === 3) return // hraje / bufferuje — hotovo
    player.playVideo?.()
    if (attempt < 6) {
      setTimeout(() => ensurePlaying(attempt + 1), 500)
    } else {
      player.mute?.()
      player.playVideo?.()
      setSoundOn(false)
      setNeedsUnmute(true)
    }
  }

  return (
    <div className="relative h-full">
      <YouTubePlayer
        key={videoId}
        videoId={videoId}
        onReady={(playerApi) => {
          playerApiRef.current = playerApi
          setLoading(false)
          playerApi.playVideo?.()
          startScoring()
        }}
        onEnded={finishSong}
        onError={(code) => setPlayerError(code)}
      />

      {loading && playerError === null && !ended && !counting && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="animate-pulse text-white/70">{t('loading_video')}</p>
        </div>
      )}

      {counting && playerError === null && !ended && (
        <Countdown onDone={() => { setCounting(false); ensurePlaying() }} />
      )}

      {showLyrics && !ended && playerError === null && (
        <Suspense fallback={null}>
          <LyricsPanel
            videoId={videoId}
            lyricsId={nowPlaying.lyricsId ?? null}
            playerApiRef={playerApiRef}
            onClose={() => setShowLyrics(false)}
            onResolved={(id) => {
              setLyricsAvailable(Boolean(id))
              // do stavu ukládáme jen LRCLIB id (číslo) — titulky videa
              // (yt:…) si každé zařízení načte samo podle videoId
              if (typeof id === 'number' && id !== nowPlaying.lyricsId) onLyricsDiscovered?.(id)
            }}
            onLyricsData={(lines) => {
              lyricsLinesRef.current = Array.isArray(lines) && lines.length ? lines : null
            }}
          />
        </Suspense>
      )}

      {!ended && playerError === null && !counting && !showLyrics && lyricsAvailable !== false && (
        <button
          onClick={() => setShowLyrics(true)}
          className="absolute right-3 bottom-3 flex items-center gap-1.5 rounded-full border border-line bg-black/60 px-4 py-2 text-sm text-white/85 backdrop-blur transition hover:bg-black/80"
        >
          <Languages size={15} strokeWidth={1.8} /> {t('lyrics_btn')}
        </button>
      )}

      {/* Horní lišta: chip zpěváka vlevo, ovládání vpravo, pod nimi živé
          skóre a případné „Zapnout zvuk" — vše ve flow layoutu, takže se
          prvky nikdy nepřekrývají ani na úzkém telefonu. */}
      {!ended && (
        <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col gap-2 p-3">
          <div className="flex items-start justify-between gap-2">
            {singer ? (
              <div
                className="pointer-events-auto flex min-w-0 items-center gap-2 rounded-full bg-black/60 py-1 pr-3.5 pl-1 text-sm backdrop-blur"
                style={{ border: `1px solid ${singer.color}66` }}
              >
                <Avatar player={singer} size="sm" />
                <span className="max-w-32 truncate font-bold" style={{ color: singer.color }}>
                  {singer.name}
                </span>
              </div>
            ) : (
              <span />
            )}
            <div className="pointer-events-auto flex shrink-0 items-center gap-2">
              {micConsent === 'on' && (
                <button
                  onClick={toggleMic}
                  aria-label={t(micOn && !micFailed ? 'mic_toggle_off' : 'mic_toggle_on')}
                  title={t(micOn && !micFailed ? 'mic_toggle_off' : 'mic_toggle_on')}
                  className={`flex h-9 w-9 items-center justify-center rounded-full border border-line backdrop-blur transition ${
                    micOn && !micFailed ? 'bg-black/60 text-white/85 hover:bg-black/80' : 'bg-red-500/25 text-red-200 hover:bg-red-500/35'
                  }`}
                >
                  {micOn && !micFailed ? <Mic size={15} strokeWidth={2} /> : <MicOff size={15} strokeWidth={2} />}
                </button>
              )}
              {!counting && playerError === null && (
                <button
                  onClick={finishSong}
                  aria-label={t('finish_song')}
                  title={t('finish_song')}
                  className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-black/60 text-white/85 backdrop-blur transition hover:bg-black/80"
                >
                  <SkipForward size={15} strokeWidth={2} />
                </button>
              )}
              {!needsUnmute && (
                <button
                  onClick={toggleSound}
                  aria-label={t(soundOn ? 'sound_toggle_off' : 'sound_toggle_on')}
                  title={t(soundOn ? 'sound_toggle_off' : 'sound_toggle_on')}
                  className={`flex h-9 w-9 items-center justify-center rounded-full border border-line backdrop-blur transition ${
                    soundOn ? 'bg-black/60 text-white/85 hover:bg-black/80' : 'bg-red-500/25 text-red-200 hover:bg-red-500/35'
                  }`}
                >
                  {soundOn ? <Volume2 size={15} strokeWidth={2} /> : <VolumeX size={15} strokeWidth={2} />}
                </button>
              )}
              <button
                onClick={handleExit}
                className="flex items-center gap-1.5 rounded-full border border-line bg-black/60 px-4 py-2 text-sm text-white/85 backdrop-blur transition hover:bg-black/80"
              >
                <X size={15} strokeWidth={2} /> {t('exit')}
              </button>
            </div>
          </div>

          {live && playerError === null && (
            <LiveScoreHUD score={live.score} level={live.level} singing={live.singing} />
          )}

          {needsUnmute && playerError === null && !counting && (
            <button
              onClick={() => { playerApiRef.current?.unMute?.(); setSoundOn(true); setNeedsUnmute(false) }}
              className="btn-primary pointer-events-auto flex items-center gap-2 self-center"
            >
              <Volume2 size={18} strokeWidth={2} /> {t('unmute')}
            </button>
          )}
        </div>
      )}

      {playerError !== null && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-night/95 p-6 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-400/10 text-red-300">
            <VideoOff size={24} strokeWidth={1.8} />
          </span>
          <p className="max-w-md text-sm text-white/70">
            {playerError === 101 || playerError === 150 ? t('err_embed') : t('err_video')}
          </p>
          {nextItem ? (
            <button onClick={goNext} className="btn-primary flex items-center gap-2">
              <SkipForward size={17} strokeWidth={2} /> {t('next_song')}
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
            <div className="flex animate-pop-in flex-col items-center gap-1.5">
              {singer && (
                <div className="mb-1 flex items-center gap-2 text-white/60">
                  <Avatar player={singer} size="sm" /> {singer.name}
                </div>
              )}
              <CountUpScore value={result.score} />
              <p className="max-w-md text-white/75">{t(commentKey(result.score))}</p>
            </div>
          )}

          {leaderboard?.length > 0 && (
            <div className="card w-full max-w-sm p-4 text-left">
              <p className="section-label mb-2.5">{t('party_rating')}</p>
              <ol className="flex flex-col gap-2">
                {leaderboard.slice(0, 3).map((entry, index) => (
                  <li key={entry.player.id} className="flex items-center gap-2.5">
                    <span className="w-5 text-center text-sm font-bold text-white/40 tabular-nums">{index + 1}</span>
                    <Avatar player={entry.player} size="sm" />
                    <span className="flex-1 truncate text-sm font-bold">{entry.player.name}</span>
                    <span className="text-sm text-neon-cyan tabular-nums">{entry.total.toLocaleString('uk-UA')}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {nextItem ? (
            <>
              <div className="flex items-center gap-3">
                {nextItem.singer && <Avatar player={nextItem.singer} size="lg" />}
                <div className="text-left">
                  <p className="section-label">{t('next_sings')}</p>
                  {nextItem.singer && (
                    <p className="font-display text-xl font-bold" style={{ color: nextItem.singer.color }}>
                      {nextItem.singer.name}
                    </p>
                  )}
                  <p className="max-w-60 truncate text-sm text-white/60">{nextItem.title || t('next_from_queue')}</p>
                </div>
              </div>
              <button onClick={goNext} className="btn-primary flex items-center gap-2.5 px-8 py-4 font-display text-base">
                <Mic size={19} strokeWidth={2} /> {t('vdui_btn')}
              </button>
            </>
          ) : (
            <>
              <p className="max-w-md text-sm text-white/70">{t('queue_done')}</p>
              <button
                onClick={() => { setEnded(false); setResult(null); onExit(); onGoHome() }}
                className="btn-primary"
              >
                {t('go_home')}
              </button>
            </>
          )}
        </div>
      )}

    </div>
  )
}
