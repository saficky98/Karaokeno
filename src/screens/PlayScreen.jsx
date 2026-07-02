import YouTubePlayer from '../components/YouTubePlayer.jsx'
import VideoLinkForm from '../components/VideoLinkForm.jsx'
import { useState } from 'react'

export default function PlayScreen({ videoId, onPlayVideo, onExit }) {
  const [playerError, setPlayerError] = useState(null)
  const [loading, setLoading] = useState(true)

  if (!videoId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
        <p className="text-2xl">🎬</p>
        <p className="text-white/70">Zatím nic nehraje. Vlož odkaz na YouTube video:</p>
        <div className="w-full max-w-xl">
          <VideoLinkForm onPlayVideo={onPlayVideo} />
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full">
      <YouTubePlayer
        key={videoId}
        videoId={videoId}
        onReady={() => setLoading(false)}
        onError={(code) => setPlayerError(code)}
      />

      {loading && playerError === null && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="animate-pulse text-white/70">Načítám video…</p>
        </div>
      )}

      {playerError !== null && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-night/95 p-6 text-center">
          <p className="text-2xl">😕</p>
          <p className="max-w-md text-white/80">
            {playerError === 101 || playerError === 150
              ? 'Toto video nejde přehrát mimo YouTube (majitel zakázal vkládání). Zkus jiné karaoke video.'
              : 'Video se nepodařilo přehrát. Zkontroluj odkaz a zkus to znovu.'}
          </p>
          <div className="w-full max-w-xl">
            <VideoLinkForm onPlayVideo={(id) => { setPlayerError(null); setLoading(true); onPlayVideo(id) }} />
          </div>
        </div>
      )}

      <button
        onClick={onExit}
        className="absolute top-3 right-3 rounded-full bg-black/60 px-4 py-2 text-sm text-white/90 backdrop-blur transition hover:bg-black/80"
      >
        ✕ Ukončit
      </button>
    </div>
  )
}
