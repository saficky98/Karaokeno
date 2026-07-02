import { useState } from 'react'
import YouTubePlayer from '../components/YouTubePlayer.jsx'
import VideoLinkForm from '../components/VideoLinkForm.jsx'

export default function PlayScreen({ nowPlaying, nextItem, onNext, onExit, onPlayDirect, onGoHome }) {
  const [playerError, setPlayerError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [ended, setEnded] = useState(false)

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

  const { videoId, title, singer } = nowPlaying

  return (
    <div className="relative h-full">
      <YouTubePlayer
        key={videoId}
        videoId={videoId}
        onReady={() => setLoading(false)}
        onEnded={() => setEnded(true)}
        onError={(code) => setPlayerError(code)}
      />

      {loading && playerError === null && !ended && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="animate-pulse text-white/70">Завантажую відео…</p>
        </div>
      )}

      {/* Бейдж співака — біля краю, щоб не закривати текст пісні. */}
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
              onClick={() => { setPlayerError(null); setLoading(true); setEnded(false); onNext() }}
              className="rounded-xl bg-neon-pink px-6 py-3 font-bold text-white transition hover:brightness-110 active:scale-95"
            >
              Наступна пісня ⏭
            </button>
          ) : (
            <div className="w-full max-w-xl">
              <VideoLinkForm onPlayVideo={(id) => { setPlayerError(null); setLoading(true); setEnded(false); onPlayDirect(id) }} />
            </div>
          )}
        </div>
      )}

      {/* Пісня закінчилась → пропонуємо наступного співака. */}
      {ended && playerError === null && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-night/95 p-6 text-center">
          {nextItem ? (
            <>
              <p className="text-white/60">Далі співає:</p>
              <div className="flex items-center gap-3">
                {nextItem.singer && <span className="text-5xl">{nextItem.singer.avatar}</span>}
                <div className="text-left">
                  {nextItem.singer && (
                    <p className="text-3xl font-black" style={{ color: nextItem.singer.color }}>
                      {nextItem.singer.name}
                    </p>
                  )}
                  <p className="text-white/70">{nextItem.title || 'Наступна пісня з черги'}</p>
                </div>
              </div>
              <button
                onClick={() => { setEnded(false); setLoading(true); onNext() }}
                className="rounded-2xl bg-neon-pink px-8 py-4 text-xl font-black text-white shadow-lg shadow-neon-pink/30 transition hover:brightness-110 active:scale-95"
              >
                Вдуй! 🎤
              </button>
            </>
          ) : (
            <>
              <p className="text-4xl">🎉</p>
              <p className="max-w-md text-white/80">Черга порожня. Додай ще пісень — вечірка тільки починається!</p>
              <button
                onClick={() => { setEnded(false); onExit(); onGoHome() }}
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
