import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useTiers } from '../lib/data'
import { useLocale } from '../lib/locale'
import { useBodyScrollLock } from '../lib/useBodyScrollLock'
import { AIcon, ALang, Eyebrow, GhostBtn, PrimaryBtn } from './agency'

/**
 * What the app is for, said once, in the reader's language.
 *
 * Two audiences, two cards. A visitor who has just registered sees a four-step sheet the first
 * time the passport opens — scan, collect, rate, claim — with the language toggle inside it,
 * because the person who most needs this is the one who cannot yet read the screen around it.
 * "How it works" on the cover brings it back any time. An exhibitor sees the same kind of sheet
 * over their booth screen, explaining why the screen must stay on: every scan is a counted
 * visit, a quiet booth can be given extra points (never fewer), and the passport steers visitors to the
 * highest-value booth they have not stamped. It stays until they dismiss it.
 *
 * Both are overlays rather than blocks in the page, and both hold the page still underneath
 * (`useBodyScrollLock`): a sheet you can scroll the page behind reads as a rendering fault,
 * and on the booth screen it let the QR drift away under the card.
 *
 * Both are remembered per account in this browser only. Storage can be missing or throw, so
 * a failure to remember means the card shows again — never that the app breaks.
 */

const OPEN_EVENT = 'mfu-welcome-open'
/** Fired when the welcome is dismissed, so anything that waited for it can reconsider. */
const CLOSED_EVENT = 'mfu-welcome-closed'

/**
 * True while this account still has the welcome to see on this device. The survey nudge waits on
 * it: two sheets at once reads as a broken screen, and the nudge marks its moment as spent the
 * instant it opens, so one shown underneath the welcome would be burnt without being read.
 */
export function welcomePending(uid: string | null | undefined): boolean {
  return !!uid && !remembered(`mfu-welcome:${uid}`)
}

/** Reopen the visitor welcome from anywhere (the cover's "How it works" link). */
export function openWelcome() {
  window.dispatchEvent(new Event(OPEN_EVENT))
}

export function VisitorWelcome() {
  const { t } = useLocale()
  const { user, profile } = useAuth()
  const tiers = useTiers().filter((x) => x.active).sort((a, b) => a.thresholdPoints - b.thresholdPoints)
  const [open, setOpen] = useState(false)
  const uid = user?.uid ?? null

  // First time this account opens the passport on this phone.
  useEffect(() => {
    if (!uid || !profile) return
    if (!remembered(`mfu-welcome:${uid}`)) setOpen(true)
  }, [uid, profile])

  useEffect(() => {
    const on = () => setOpen(true)
    window.addEventListener(OPEN_EVENT, on)
    return () => window.removeEventListener(OPEN_EVENT, on)
  }, [])

  // Before the early return: a hook cannot be called conditionally.
  const visible = open && !!profile
  useBodyScrollLock(visible)

  if (!visible) return null
  const threshold = tiers[0]?.thresholdPoints ?? 100
  const close = () => { if (uid) remember(`mfu-welcome:${uid}`); setOpen(false); window.dispatchEvent(new Event(CLOSED_EVENT)) }

  const steps: Array<[ReactNode, string, string]> = [
    [AIcon.pin, t('v.welcome.s1Title'), t('v.welcome.s1Text')],
    [AIcon.scan, t('v.welcome.s2Title'), t('v.welcome.s2Text')],
    [AIcon.star(false, 24), t('v.welcome.s3Title'), t('v.welcome.s3Text')],
    [AIcon.rewards, t('v.welcome.s4Title', { n: threshold }), t('v.welcome.s4Text', { n: threshold })],
  ]

  return (
    <div className="scrim-in fixed inset-0 z-40 flex items-end justify-center bg-[rgb(10_19_64/.5)] p-3 sm:items-center" onClick={close}>
      <div role="dialog" aria-label={t('v.welcome.title')}
        className="a-cut a-cut-xl a-edge-neon sheet-in max-h-[90vh] w-full max-w-md overflow-y-auto px-5 pb-5 pt-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <Eyebrow pulse>{t('v.welcome.eyebrow')}</Eyebrow>
            <h2 className="a-hd mb-0 mt-1.5 text-[24px] font-bold leading-tight">{t('v.welcome.title')}</h2>
          </div>
          {/* The one place the toggle must be: a reader who cannot follow this sheet cannot
              find the toggle behind it either. */}
          <ALang />
        </div>
        <p className="mb-0 mt-2 text-sm text-[#33415F]">{t('v.welcome.lead')}</p>
        {/* Four steps on a rail: a numbered sequence is what this is, so the numbers are real. */}
        <ol className="relative mt-4 flex list-none flex-col gap-2.5 p-0">
          <span aria-hidden className="absolute bottom-6 left-[21px] top-6 w-0.5" style={{ background: 'linear-gradient(#1D5BFF,#00D2FF)' }} />
          {steps.map(([icon, title, text], i) => (
            <li key={i} className="relative flex gap-3">
              <span className="a-cut a-cut-s a-solid a-fill-neon grid h-11 w-11 shrink-0 place-items-center text-white [&_svg]:h-6 [&_svg]:w-6" aria-hidden>{icon}</span>
              <span className="a-cut a-solid a-fill-tint block min-w-0 flex-1 px-3 py-2.5">
                <span className="a-hd block text-[16px] font-bold leading-tight"><span className="a-mono mr-1.5 text-xs text-[#1450E6]">{String(i + 1).padStart(2, '0')}</span>{title}</span>
                <span className="mt-0.5 block text-[13px] leading-snug text-[#33415F]">{text}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="mb-0 mt-4 text-xs text-[var(--a-muted)]">{t('v.welcome.free')}</p>
        <div className="mt-4 flex flex-col gap-3">
          <PrimaryBtn onClick={close}>{t('v.welcome.start')}</PrimaryBtn>
          <GhostBtn to="/scan" onClick={close} icon={AIcon.scan}>{t('v.welcome.scanNow')}</GhostBtn>
        </div>
      </div>
    </div>
  )
}

/** A text link for the cover: reopens the sheet above. */
export function HowItWorksLink({ className = '' }: { className?: string }) {
  const { t } = useLocale()
  return (
    <button type="button" className={`a-link min-h-11 cursor-pointer border-0 bg-transparent text-sm ${className}`} onClick={openWelcome}>
      {t('v.welcome.howItWorks')}
    </button>
  )
}

/**
 * The exhibitor's sheet: why the booth screen has to stay on.
 *
 * A modal over the booth screen rather than a card inside it. As a block in the page it pushed
 * the QR down the screen and the whole page scrolled behind it, which on a kiosk tablet is the
 * one thing that must not happen — the code is what the booth is for. Over the top, read once,
 * dismissed, gone.
 *
 * Remembered per booth on this device (not per account): a booth screen is set up once on one
 * tablet, and whoever is holding it is the person who needs to read this.
 */
export function OrganizerWelcome({ boothId }: { boothId: string }) {
  const { t } = useLocale()
  const key = `mfu-org-welcome:${boothId}`
  const [shown, setShown] = useState(() => !remembered(key))
  const close = () => { remember(key); setShown(false) }

  useBodyScrollLock(shown)
  // Escape closes it, as it does every other overlay in the app.
  useEffect(() => {
    if (!shown) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown])

  if (!shown) return null

  const points: Array<[string, string]> = [
    [t('org.welcome.p1Title'), t('org.welcome.p1Text')],
    [t('org.welcome.p2Title'), t('org.welcome.p2Text')],
    [t('org.welcome.p3Title'), t('org.welcome.p3Text')],
    [t('org.welcome.p4Title'), t('org.welcome.p4Text')],
  ]

  return (
    /* z-50 to clear the booth screen's own floating controls. The help overlay is also z-50 and
       comes later in the tree, so a button the organizer actually pressed still wins. */
    <div className="scrim-in fixed inset-0 z-50 flex items-center justify-center bg-ink/60 p-4 print:hidden" onClick={close}>
      <div role="dialog" aria-modal="true" aria-label={t('org.welcome.title')}
        className="card card-static sheet-in max-h-[90vh] w-full max-w-lg overflow-y-auto bg-white p-5 text-ink"
        onClick={(e) => e.stopPropagation()}>
        {/* The toggle gets its own row rather than sharing one with the heading: the eyebrow
            carries both languages, and beside a pill it wrapped to three lines on a phone. */}
        <div className="flex justify-end"><ALang /></div>
        <div className="stamp-text mt-2 text-sky-900">{t('org.welcome.eyebrow')}</div>
        <h2 className="mt-1 text-lg font-bold leading-snug">{t('org.welcome.title')}</h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {points.map(([title, text], i) => (
            <li key={i} className="rounded-xl bg-sky-50 px-3 py-2">
              <div className="text-sm font-semibold leading-tight">{title}</div>
              <div className="mt-0.5 text-xs text-ink-soft">{text}</div>
            </li>
          ))}
        </ul>
        {/* Stacked on a phone, where the Thai label for either control wraps if they share a
            row; `flex-col-reverse` keeps the button — the thing they came here to press — on top. */}
        <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Link to="/booth/stats" className="text-center text-sm underline sm:shrink-0" onClick={close}>{t('org.welcome.stats')}</Link>
          <button type="button" className="btn-primary w-full py-3 text-base sm:w-auto sm:px-6" onClick={close}>{t('org.welcome.dismiss')}</button>
        </div>
      </div>
    </div>
  )
}

// ---- remembered per account, in this browser ----
function remembered(key: string): boolean {
  try { return localStorage.getItem(key) === '1' } catch { return false }
}
function remember(key: string) {
  try { localStorage.setItem(key, '1') } catch { /* shows again next time; harmless */ }
}
