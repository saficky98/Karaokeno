import { useEffect, useRef } from 'react'

let apiPromise = null

// YouTube IFrame API se načítá jen jednou pro celou aplikaci.
function loadYouTubeApi() {
  if (apiPromise) return apiPromise
  apiPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve(window.YT)
      return
    }
    const previous = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      previous?.()
      resolve(window.YT)
    }
    const tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(tag)
  })
  return apiPromise
}

export default function YouTubePlayer({ videoId, onReady, onEnded, onError }) {
  const mountRef = useRef(null)
  const playerRef = useRef(null)
  const callbacksRef = useRef({ onReady, onEnded, onError })
  callbacksRef.current = { onReady, onEnded, onError }

  useEffect(() => {
    let cancelled = false
    // YT.Player nahradí cílový element iframem, proto hraje do vnořeného divu.
    const target = document.createElement('div')
    mountRef.current.appendChild(target)

    loadYouTubeApi().then((YT) => {
      if (cancelled) return
      playerRef.current = new YT.Player(target, {
        width: '100%',
        height: '100%',
        videoId,
        playerVars: { autoplay: 1, playsinline: 1, rel: 0 },
        events: {
          onReady: (event) => callbacksRef.current.onReady?.(event.target),
          onStateChange: (event) => {
            if (event.data === YT.PlayerState.ENDED) callbacksRef.current.onEnded?.()
          },
          onError: (event) => callbacksRef.current.onError?.(event.data),
        },
      })
    })

    return () => {
      cancelled = true
      playerRef.current?.destroy?.()
      playerRef.current = null
      mountRef.current?.replaceChildren()
    }
  }, [videoId])

  return <div ref={mountRef} className="h-full w-full [&_iframe]:h-full [&_iframe]:w-full" />
}
