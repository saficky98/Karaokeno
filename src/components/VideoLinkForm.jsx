import { useState } from 'react'
import { Play } from 'lucide-react'
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
          className="field flex-1 text-base"
        />
        <button type="submit" className="btn-primary flex items-center justify-center gap-2">
          <Play size={16} strokeWidth={2.2} fill="currentColor" /> Грати
        </button>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
    </form>
  )
}
