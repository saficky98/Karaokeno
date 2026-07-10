import { useEffect, useRef } from 'react'

// QR kód odkazu místnosti — knihovna qrcode se stahuje líně, jen když se
// QR opravdu ukazuje (panel místnosti / obrazovka).
export default function QrCode({ value, size = 160, className = '' }) {
  const canvasRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    import('qrcode').then(({ default: QRCode }) => {
      if (cancelled || !canvasRef.current) return
      QRCode.toCanvas(canvasRef.current, value, {
        width: size,
        margin: 1,
        color: { dark: '#000000', light: '#ffffff' },
      }).catch(() => {
        // QR se nepovedl — odkaz zůstává k dispozici textem
      })
    })
    return () => {
      cancelled = true
    }
  }, [value, size])

  return <canvas ref={canvasRef} className={`rounded-lg bg-white p-1 ${className}`} aria-hidden />
}
