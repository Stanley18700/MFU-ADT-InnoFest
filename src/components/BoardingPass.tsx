import { useEffect, useState } from 'react'
import { useAuth } from '../lib/auth'
import { useEvent } from '../lib/data'
import { eventDateLine } from '../lib/eventText'
import { useLocale } from '../lib/locale'
import { drawPass } from '../lib/boardingPass'

/**
 * A keepsake for answering the festival survey: a boarding-pass-styled PNG the visitor can
 * save to Photos or share, carrying their name, passport number, stamp and point totals.
 *
 * Drawn on a canvas in the browser — no server, no storage, nothing to purge afterwards. The
 * image is rendered once per profile change into a data URL and shown as an ordinary <img>,
 * because on iPhone the reliable way to keep a picture is still a long press on it; the Save
 * button (a download link) and Share (the Web Share API, when it can take a file) are there
 * for the browsers that support them.
 *
 * The festival logo is fetched from this origin, so the canvas stays untainted and toDataURL is
 * allowed; if the logo does not load, the pass is drawn without it rather than not at all.
 */
export function BoardingPass({ className = '' }: { className?: string }) {
  const { t } = useLocale()
  const { profile } = useAuth()
  const event = useEvent()
  const [png, setPng] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  const name = profile?.displayName ?? ''
  const passportNo = profile?.passportNo ?? ''
  const stamps = profile?.stampCount ?? 0
  const points = profile?.points ?? 0
  const eventName = event.nameEn
  const dates = eventDateLine(event, false)

  useEffect(() => {
    let live = true
    drawPass({ name, passportNo, stamps, points, eventName, dates })
      .then((url) => { if (live) setPng(url) })
      .catch((e) => { console.warn('boarding pass', e); if (live) setPng(null) })
    return () => { live = false }
  }, [name, passportNo, stamps, points, eventName, dates])

  const fileName = `innofest-mission-certificate-${passportNo || 'agent'}.png`

  async function share() {
    if (!png) return
    try {
      const blob = await (await fetch(png)).blob()
      const file = new File([blob], fileName, { type: 'image/png' })
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
      if (nav.share && (!nav.canShare || nav.canShare({ files: [file] }))) {
        await nav.share({ files: [file], title: eventName })
        return
      }
      setMsg(t('v.pass.hint'))
    } catch (e) {
      // The visitor closing the share sheet is not an error worth a message.
      if ((e as { name?: string })?.name !== 'AbortError') setMsg(t('v.pass.hint'))
    }
  }

  if (!profile) return null

  return (
    <section className={`a-cut a-edge-line px-4 pb-4 pt-3.5 text-center ${className}`}>
      <div className="a-label">{t('v.pass.title')}</div>
      <p className="mb-0 mt-1 text-sm text-[#33415F]">{t('v.pass.lead')}</p>
      {png
        ? <img src={png} alt={t('v.pass.alt', { name })} className="mx-auto mt-3 block w-full max-w-[320px]" />
        : <div className="mx-auto mt-3 aspect-[4/5] w-full max-w-[320px] animate-pulse bg-sky-100" />}
      <div className="mt-3 flex gap-2.5">
        {png && 'share' in navigator && (
          <button type="button" className="a-btn a-btn-ghost a-cut !w-auto flex-1" onClick={() => void share()}>{t('v.pass.share')}</button>
        )}
        {png && (
          <div className="a-brk a-glow flex-1"><a href={png} download={fileName} className="a-btn a-btn-primary a-cut !h-[49px] !text-base">{t('v.pass.save')}</a></div>
        )}
      </div>
      <p className="mb-0 mt-2.5 text-xs text-[var(--a-muted)]">{msg ?? t('v.pass.hint')}</p>
    </section>
  )
}
