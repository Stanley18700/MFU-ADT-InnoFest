import { useEffect, useRef, useState } from 'react'
import { useLocale } from '../lib/locale'
import { useBodyScrollLock } from '../lib/useBodyScrollLock'
import { PHOTO_H, PHOTO_W, composePhoto, drawFrame, toJpeg, type FrameData } from '../lib/agentPhoto'
import { AIcon, GoldTag, LockedTag, PrimaryBtn } from './agency'
import { haptic } from './game'
import { EVENT_SURVEY_ID } from '../../shared/model'

/**
 * The 50-point reward everyone gets: an agent photo in the InnoFest frame, one tap away, ready
 * to share. (MFU students get MFU333 on top, on the same Rewards tab.)
 */
export function AgentPhotoCard({ points, at, frame, autoOpen = false, sealed = false }: { points: number; at: number; frame: FrameData; autoOpen?: boolean; sealed?: boolean }) {
  const { t } = useLocale()
  const reached = points >= at
  // Reached, but the festival survey is still owed: the frame stays sealed until it is answered.
  const ready = reached && !sealed
  const [open, setOpen] = useState(autoOpen && ready)
  return (
    <>
      <section className={`a-cut ${ready ? 'a-edge-neon a-fill-foil a-glow-soft' : 'a-dashed a-fill-muted'} px-4 pb-4 pt-3.5`}>
        <div className="flex items-center justify-between gap-2">
          {ready ? <GoldTag>{AIcon.check}{t('p.ready')}</GoldTag> : <LockedTag>{AIcon.lock}{reached ? t('p.sealed') : t('p.locked', { n: at })}</LockedTag>}
          <span className="a-mono text-xs text-[var(--a-muted)]">{at} pts</span>
        </div>
        <div className="a-hd mt-2 text-[20px] font-bold leading-tight text-ink">{t('p.title')}</div>
        <p className="mb-0 mt-1 text-[13.5px] leading-snug text-[#33415F]">{t(ready ? 'p.leadReady' : reached ? 'p.leadSealed' : 'p.leadLocked', { n: Math.max(0, at - points) })}</p>
        {ready && <div className="mt-3"><PrimaryBtn onClick={() => setOpen(true)} icon={AIcon.camera}>{t('p.open')}</PrimaryBtn></div>}
        {reached && sealed && <div className="mt-3"><PrimaryBtn to={`/survey/${EVENT_SURVEY_ID}`}>{t('hx.a.debrief')}</PrimaryBtn></div>}
      </section>
      {open && <PhotoBooth frame={frame} onClose={() => setOpen(false)} />}
    </>
  )
}

type Stage = 'starting' | 'live' | 'nocam' | 'shot'

export function PhotoBooth({ frame, onClose }: { frame: FrameData; onClose: () => void }) {
  const { t } = useLocale()
  const video = useRef<HTMLVideoElement>(null)
  const stream = useRef<MediaStream | null>(null)
  const frameCanvas = useRef<HTMLCanvasElement | null>(null)
  const [frameUrl, setFrameUrl] = useState<string | null>(null)
  const [stage, setStage] = useState<Stage>('starting')
  const [facing, setFacing] = useState<'user' | 'environment'>('user')
  const [shot, setShot] = useState<{ url: string; blob: Blob; data: string } | null>(null)
  const [holdHelp, setHoldHelp] = useState(false)
  const [flash, setFlash] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  useBodyScrollLock(true)

  // The frame, drawn once: shown over the live camera, and drawn into the photo at the shutter.
  // Keyed on the content, not the object: the Rewards tab re-renders every quarter second.
  const frameKey = JSON.stringify(frame)
  useEffect(() => {
    let live = true
    void drawFrame(JSON.parse(frameKey) as FrameData).then((c) => { if (live) { frameCanvas.current = c; setFrameUrl(c.toDataURL('image/png')) } })
    return () => { live = false }
  }, [frameKey])

  // The camera. Anything that refuses it (no camera, permission denied, an app's own browser)
  // falls back to picking a photo, so nobody is left without their reward.
  useEffect(() => {
    if (stage === 'shot') return
    let cancelled = false
    async function start() {
      stop()
      if (!navigator.mediaDevices?.getUserMedia) { setStage('nocam'); return }
      try {
        // Some in-app browsers never answer the permission prompt; after 10 s, offer the fallback.
        const s = await Promise.race([
          navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1440 }, height: { ideal: 1800 } }, audio: false }),
          new Promise<never>((_, rej) => window.setTimeout(() => rej(new Error('camera timeout')), 10_000)),
        ])
        if (cancelled) { s.getTracks().forEach((x) => x.stop()); return }
        stream.current = s
        const v = video.current
        if (v) {
          v.srcObject = s
          await v.play().catch(() => null)
          // iOS reports "playing" before the first frame has a size; the shutter must wait for it.
          for (let i = 0; i < 40 && !v.videoWidth; i++) await new Promise((r) => window.setTimeout(r, 75))
          if (!v.videoWidth) throw new Error('no video frames')
        }
        if (!cancelled) setStage('live')
      } catch { if (!cancelled) setStage('nocam') }
    }
    void start()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facing, stage === 'shot'])
  useEffect(() => () => { stop(); if (shot) URL.revokeObjectURL(shot.url) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  function stop() { stream.current?.getTracks().forEach((x) => x.stop()); stream.current = null }

  async function finish(c: HTMLCanvasElement) {
    const blob = await toJpeg(c)
    // A data: URL, not only a blob: one, so press-and-hold → "Save to Photos" works on iPhone.
    const data = c.toDataURL('image/jpeg', 0.92)
    setShot({ url: URL.createObjectURL(blob), blob, data })
    setNote(null); setStage('shot'); stop()
  }
  async function snap() {
    const v = video.current, f = frameCanvas.current
    if (!v || !f || !v.videoWidth) return
    haptic([15, 40, 15]); setFlash(true); window.setTimeout(() => setFlash(false), 220)
    await finish(composePhoto(v, v.videoWidth, v.videoHeight, f, facing === 'user'))
  }
  async function pick(file: File | undefined) {
    const f = frameCanvas.current
    if (!file || !f) return
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { void finish(composePhoto(img, img.naturalWidth, img.naturalHeight, f, false)); URL.revokeObjectURL(url) }
    // e.g. a HEIC picture in a browser that can't decode it.
    img.onerror = () => { URL.revokeObjectURL(url); setNote(t('p.badPhoto')) }
    img.src = url
  }
  // Photos only, no caption: on iPhone a caption alongside the file hides "Save Image" in the
  // share sheet and makes Instagram refuse the picture.
  function shareFile() {
    if (!shot) return null
    const file = new File([shot.blob], 'adt-innofest-agent.jpg', { type: 'image/jpeg' })
    const data = { files: [file] }
    return navigator.canShare?.(data) ? data : null
  }
  async function share() {
    const data = shareFile()
    if (!data) { save(); return }
    try { await navigator.share(data) } catch (e) { if ((e as { name?: string }).name !== 'AbortError') setHoldHelp(true) }
  }
  async function save() {
    if (!shot) return
    // iPhone and iPad ignore downloads of pictures: the share sheet's "Save Image" puts it in Photos.
    if (IOS) {
      const data = shareFile()
      if (data) { try { await navigator.share(data); return } catch (e) { if ((e as { name?: string }).name === 'AbortError') return } }
      setHoldHelp(true); return
    }
    // Android and desktop: a normal download. In-app browsers that drop it still have press-and-hold.
    const a = document.createElement('a')
    a.href = shot.url; a.download = 'adt-innofest-agent.jpg'
    document.body.appendChild(a); a.click(); a.remove()
    setNote(t('p.saved'))
  }
  function retake() { if (shot) URL.revokeObjectURL(shot.url); setShot(null); setNote(null); setHoldHelp(false); setStage('starting') }
  const canShare = typeof navigator !== 'undefined' && !!navigator.share

  return (
    <div role="dialog" aria-modal="true" aria-label={t('p.title')} className="fixed inset-0 z-[70] flex flex-col bg-[#060B26] text-white">
      <div className="flex items-center justify-between px-4 pb-2 pt-[max(12px,env(safe-area-inset-top))]">
        <span className="a-mono text-[11px] tracking-[.16em] text-[#7FE7FF]">{t('p.eyebrow')}</span>
        <button type="button" aria-label={t('p.close')} onClick={() => { stop(); onClose() }}
          className="grid h-10 w-10 cursor-pointer place-items-center rounded-full border-0 bg-white/10 text-white">{AIcon.close}</button>
      </div>

      {/* The 4:5 picture, as big as the screen allows. */}
      <div className="pb-body flex min-h-0 flex-1 flex-col items-center justify-center gap-1 px-3">
      <div className="pb-photo shrink-0">
        {/* 4:5 by padding, not aspect-ratio, so iOS 14 and older draw it too. */}
        <div className="relative w-full overflow-hidden rounded-xl bg-black" style={{ paddingBottom: `${(PHOTO_H / PHOTO_W) * 100}%` }}>
          {stage === 'shot' && shot ? (
            <img src={shot.data} alt={t('p.alt')} className="absolute inset-0 h-full w-full object-cover" style={{ WebkitTouchCallout: 'default', userSelect: 'auto' }} />
          ) : (
            <>
              <video ref={video} playsInline muted autoPlay className="absolute inset-0 h-full w-full object-cover" style={{ transform: facing === 'user' ? 'scaleX(-1)' : undefined }} />
              {frameUrl && <img src={frameUrl} alt="" aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" />}
              {stage === 'starting' && <div className="absolute inset-0 grid place-items-center text-sm text-white/80">{t('p.starting')}</div>}
              {stage === 'nocam' && (
                <div className="absolute inset-0 grid place-items-center bg-[#060B26]/80 p-6 text-center text-sm text-white/90">{t('p.nocam')}</div>
              )}
              {flash && <div aria-hidden className="absolute inset-0 bg-white" style={{ animation: 'hd-in .22s reverse both' }} />}
            </>
          )}
        </div>
      </div>

      <div className="pb-controls mx-auto w-full max-w-md px-1 pb-[max(16px,env(safe-area-inset-bottom))] pt-3">
        {stage === 'shot' ? (
          <div className="flex flex-col gap-3">
            {canShare
              ? <PrimaryBtn onClick={() => void share()} icon={AIcon.share}>{t('p.share')}</PrimaryBtn>
              : <PrimaryBtn onClick={() => void save()} icon={AIcon.download}>{t(IOS ? 'p.saveIos' : 'p.save')}</PrimaryBtn>}
            <div className="flex gap-3">
              {canShare && <button type="button" onClick={() => void save()} className="h-12 flex-1 cursor-pointer rounded-lg border border-solid border-white/40 bg-white/10 text-[15px] font-semibold text-white">{t(IOS ? 'p.saveIos' : 'p.save')}</button>}
              <button type="button" onClick={retake} className="h-12 flex-1 cursor-pointer rounded-lg border border-solid border-white/40 bg-white/10 text-[15px] font-semibold text-white">{t('p.retake')}</button>
            </div>
            <p className="m-0 text-center text-xs text-white/70">{note ?? t(IOS ? 'p.hintIos' : 'p.hint')}</p>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-4">
            <label className="flex h-12 min-w-[84px] cursor-pointer items-center justify-center rounded-lg bg-white/10 px-3 text-sm font-semibold">
              {t('p.gallery')}
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
            </label>
            {stage === 'nocam' ? (
              <label className="a-btn a-btn-primary a-cut flex-1 cursor-pointer !h-14">
                {AIcon.camera}{t('p.takeAnyway')}
                <input type="file" accept="image/*" capture="user" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
              </label>
            ) : (
              <button type="button" aria-label={t('p.shutter')} disabled={stage !== 'live'} onClick={() => void snap()}
                className="relative grid h-[76px] w-[76px] shrink-0 cursor-pointer place-items-center rounded-full border-4 border-white bg-transparent p-0 disabled:opacity-50">
                <span className="block h-[58px] w-[58px] rounded-full" style={{ background: 'linear-gradient(140deg,#2E3CFF,#1D5BFF 50%,#00D2FF)', boxShadow: '0 0 18px rgb(0 210 255 / .7)' }} />
              </button>
            )}
            <button type="button" aria-label={t('p.flip')} disabled={stage !== 'live'} onClick={() => setFacing((f) => (f === 'user' ? 'environment' : 'user'))}
              className="flex h-12 min-w-[84px] cursor-pointer items-center justify-center rounded-lg border-0 bg-white/10 px-3 text-sm font-semibold text-white disabled:opacity-40">
              {t('p.flip')}
            </button>
          </div>
        )}
        {stage !== 'shot' && note && <p className="mb-0 mt-3 text-center text-xs text-[#FFC93C]">{note}</p>}
      </div>
      </div>
      {holdHelp && shot && (
        <div className="fixed inset-0 z-[75] flex flex-col items-center justify-center gap-4 bg-[#060B26]/95 p-4 text-center" onClick={() => setHoldHelp(false)}>
          <p className="m-0 max-w-xs text-[15px] font-semibold text-white">{t('p.holdTitle')}</p>
          <img src={shot.data} alt={t('p.alt')} onClick={(e) => e.stopPropagation()}
            className="max-h-[70vh] w-auto max-w-full rounded-xl" style={{ WebkitTouchCallout: 'default', userSelect: 'auto' }} />
          <button type="button" onClick={() => setHoldHelp(false)} className="h-11 cursor-pointer rounded-lg border border-solid border-white/40 bg-white/10 px-6 text-[15px] font-semibold text-white">{t('p.done')}</button>
        </div>
      )}
    </div>
  )
}

/** iPhone, iPad (which says it is a Mac), and every iOS browser — they are all Safari inside. */
export const IOS = typeof navigator !== 'undefined' && (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))
