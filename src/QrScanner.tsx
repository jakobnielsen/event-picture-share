import { useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { useLocale } from './i18n'

interface Props {
  onDetect: (token: string) => void
  onClose: () => void
}

type ScanState = 'starting' | 'scanning' | 'error'

/** Extract ?token= from a URL string, or return null */
function extractToken(text: string): string | null {
  try {
    const url = new URL(text)
    return url.searchParams.get('token')
  } catch {
    // Not a URL — check if it looks like a raw token (alphanumeric, 8-64 chars)
    if (/^[a-zA-Z0-9]{8,64}$/.test(text.trim())) return text.trim()
    return null
  }
}

export default function QrScanner({ onDetect, onClose }: Props) {
  const { t } = useLocale()
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const rafRef = useRef<number>(0)
  const [state, setState] = useState<ScanState>('starting')
  const [errorMsg, setErrorMsg] = useState('')
  const detectedRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        })
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current!
        video.srcObject = stream
        await video.play()
        setState('scanning')
        scanLoop()
      } catch (err: unknown) {
        if (cancelled) return
        const name = err instanceof Error ? err.name : ''
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          setErrorMsg(t.scan_no_permission)
        } else if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
          setErrorMsg(t.scan_no_camera)
        } else {
          setErrorMsg(t.scan_error)
        }
        setState('error')
      }
    }

    function scanLoop() {
      const video = videoRef.current
      const canvas = canvasRef.current
      if (!video || !canvas || detectedRef.current) return

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth
        canvas.height = video.videoHeight
        const ctx = canvas.getContext('2d', { willReadFrequently: true })!
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'dontInvert',
        })
        if (code) {
          const token = extractToken(code.data)
          if (token) {
            detectedRef.current = true
            stopStream()
            onDetect(token)
            return
          }
        }
      }

      rafRef.current = requestAnimationFrame(scanLoop)
    }

    start()

    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
      stopStream()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function stopStream() {
    streamRef.current?.getTracks().forEach(t => t.stop())
    streamRef.current = null
  }

  function handleClose() {
    cancelAnimationFrame(rafRef.current)
    stopStream()
    onClose()
  }

  return (
    <div className="qr-overlay" role="dialog" aria-modal="true" aria-label={t.scan_title}>
      <div className="qr-modal">
        <div className="qr-header">
          <span className="qr-title">{t.scan_title}</span>
          <button className="qr-close" onClick={handleClose} aria-label={t.scan_close}>✕</button>
        </div>

        {state === 'error' ? (
          <div className="qr-error">
            <p>{errorMsg}</p>
            <button className="btn btn-secondary" onClick={handleClose}>{t.scan_close}</button>
          </div>
        ) : (
          <>
            <div className="qr-viewport">
              <video
                ref={videoRef}
                className="qr-video"
                muted
                playsInline
                aria-hidden="true"
              />
              <div className="qr-frame" aria-hidden="true" />
              {state === 'starting' && <div className="qr-loading" />}
            </div>
            <p className="qr-hint">{t.scan_hint}</p>
          </>
        )}

        {/* Hidden canvas for frame processing */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </div>
    </div>
  )
}
