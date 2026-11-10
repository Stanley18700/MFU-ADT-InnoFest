import { useEffect, useRef, useState } from 'react'
import { useLocale } from '../lib/locale'

interface Props {
  onResult: (text: string) => void
  paused?: boolean
  className?: string
  /** What to do instead when there is no camera. The default is the visitor's flow; the prize desk passes its own. */
  fallback?: string
}


type Detector = { detect(source: ImageBitmapSource): Promise<Array<{ rawValue: string }>> }
declare global {
  interface Window { BarcodeDetector?: new (opts?: { formats: string[] }) => Detector }
}

/**
 * §4.3 — camera via BarcodeDetector where available, zxing-wasm otherwise.
 * Reports `permissionDenied` so the parent can show the manual-entry field.
 */
export function Scanner({ onResult, paused = false, className = '', fallback: fallbackProp }: Props) {
  const { t } = useLocale()
  const fallback = fallbackProp ?? t('cam.fallback')
  const videoRef = useRef<HTMLVideoElement>(null)
  const [state, setState] = useState<'starting' | 'live' | 'denied' | 'unavailable'>('starting')
  const lastRef = useRef<{ text: string; at: number }>({ text: '', at: 0 })
  const pausedRef = useRef(paused)
  pausedRef.current = paused

  useEffect(() => {
    let stream: MediaStream | null = null
    let raf = 0
    let stopped = false
    const video = videoRef.current!
    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) { setState('unavailable'); return }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      } catch (e) {
        console.warn('camera', e)
        setState('denied')
        return
      }
      if (stopped) { stream.getTracks().forEach((t) => t.stop()); return }
      video.srcObject = stream
      await video.play().catch(() => undefined)
      setState('live')

      const native = window.BarcodeDetector ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null
      let zxing: null | ((img: ImageData) => Promise<string | null>) = null
      if (!native) {
        const mod = await import('zxing-wasm/reader')
        zxing = async (img) => {
          const res = await mod.readBarcodes(img, { formats: ['QRCode'], tryHarder: false, maxNumberOfSymbols: 1 })
          return res[0]?.text ?? null
        }
      }

      let busy = false
      const tick = async () => {
        if (stopped) return
        raf = requestAnimationFrame(tick)
        if (busy || pausedRef.current || video.readyState < 2) return
        busy = true
        try {
          let text: string | null = null
          if (native) {
            const codes = await native.detect(video)
            text = codes[0]?.rawValue ?? null
          } else if (zxing) {
            const w = Math.min(video.videoWidth, 640)
            const h = Math.round(video.videoHeight * (w / video.videoWidth))
            canvas.width = w; canvas.height = h
            ctx.drawImage(video, 0, 0, w, h)
            text = await zxing(ctx.getImageData(0, 0, w, h))
          }
          if (text) {
            const now = Date.now()
            if (text !== lastRef.current.text || now - lastRef.current.at > 2500) {
              lastRef.current = { text, at: now }
              onResult(text)
            }
          }
        } catch { /* frame skipped */ } finally { busy = false }
      }
      raf = requestAnimationFrame(tick)
    }
    void start()
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className={`relative overflow-hidden bg-chrome ${className}`}>
      <video ref={videoRef} playsInline muted className="h-full w-full object-cover" />
      {/* The viewfinder: four cyan corners and a scan line sweeping between them (still, under
          reduced motion). Drawn whatever the camera's state, so the frame never jumps in. */}
      <div className="pointer-events-none absolute inset-0 grid place-items-center">
        <div className="relative aspect-square w-[68%] max-w-[15rem] shadow-[0_0_0_9999px_rgba(10,19,64,.5)]">
          {(['left-0 top-0 border-l-[3px] border-t-[3px]', 'right-0 top-0 border-r-[3px] border-t-[3px]', 'left-0 bottom-0 border-l-[3px] border-b-[3px]', 'right-0 bottom-0 border-r-[3px] border-b-[3px]'] as const).map((c) => (
            <span key={c} className={`absolute h-9 w-9 border-[#00D2FF] ${c}`} style={{ filter: 'drop-shadow(0 0 4px rgb(0 210 255 / .8))' }} />
          ))}
          {state === 'live' && <span className="a-scanline" />}
        </div>
      </div>
      {state === 'starting' && <p className="absolute inset-0 grid place-items-center text-sm text-white/80">{t('cam.starting')}</p>}
      {state === 'denied' && (
        <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white/90">
          {t('cam.denied')} {fallback}
        </p>
      )}
      {state === 'unavailable' && (
        <p className="absolute inset-0 grid place-items-center p-6 text-center text-sm text-white/90">
          {t('cam.none')} {fallback}
        </p>
      )}
    </div>
  )
}
