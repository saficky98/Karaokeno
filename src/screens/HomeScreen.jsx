import VideoLinkForm from '../components/VideoLinkForm.jsx'

export default function HomeScreen({ onPlayVideo }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 overflow-y-auto p-6 text-center">
      <div>
        <h1 className="text-5xl font-black tracking-tight sm:text-7xl">
          Karaoke{' '}
          <span className="bg-gradient-to-r from-neon-pink to-neon-cyan bg-clip-text text-transparent">
            Party
          </span>
        </h1>
        <p className="mt-3 text-lg text-white/70">
          Zpívej na YouTube karaoke videa a sbírej body! 🎶
        </p>
      </div>

      <div className="w-full max-w-xl">
        <p className="mb-2 text-sm text-white/60">Vlož odkaz na YouTube karaoke video:</p>
        <VideoLinkForm onPlayVideo={onPlayVideo} autoFocus />
      </div>
    </div>
  )
}
