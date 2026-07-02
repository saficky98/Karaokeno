import { useState } from 'react'
import { parseYouTubeId } from '../lib/youtube.js'

export default function VideoLinkForm({ onPlayVideo, autoFocus = false }) {
  const [link, setLink] = useState('')
  const [error, setError] = useState(null)

  function submit(event) {
    event.preventDefault()
    const id = parseYouTubeId(link)
    if (!id) {
      setError('Це не схоже на посилання YouTube. Скопіюй повну адресу відео, наприклад https://www.youtube.com/watch?v=…')
      return
    }
    setError(null)
    setLink('')
    onPlayVideo(id)
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          inputMode="url"
          value={link}
          onChange={(event) => setLink(event.target.value)}
          placeholder="https://www.youtube.com/watch?v=…"
          autoFocus={autoFocus}
          className="min-w-0 flex-1 rounded-xl border border-white/15 bg-panel px-4 py-3 text-base placeholder-white/30 outline-none focus:border-neon-cyan"
        />
        <button
          type="submit"
          className="rounded-xl bg-neon-pink px-6 py-3 font-bold text-white transition hover:brightness-110 active:scale-95"
        >
          Грати
        </button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  )
}
