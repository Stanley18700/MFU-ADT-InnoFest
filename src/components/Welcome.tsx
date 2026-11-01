import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { useTiers } from '../lib/data'
import { useLocale } from '../lib/locale'
import { useBodyScrollLock } from '../lib/useBodyScrollLock'
import { AIcon, ALang, GhostBtn, PrimaryBtn } from './agency'
import { Decode, HandlerAvatar } from './handler'

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
  return <Briefing threshold={threshold} onClose={close} />
}

/**
 * The briefing, told by HANDLER // 0: one message at a time, each arriving as signal and then
 * decoding into the reader's language. A tap finishes the message on screen, or — once it is
 * readable — brings the next. Skip shows the whole conversation at once. The two buttons the old
 * sheet had (start, scan) arrive after the last message, unchanged.
 */
function Briefing({ threshold, onClose }: { threshold: number; onClose: () => void }) {
  const { t } = useLocale()
  const script = [
    t('h.b1'), t('h.b2'), t('h.b3'), t('h.b4'), t('h.b5'), t('h.b6', { n: threshold }), t('h.b7'),
  ]
  const [count, setCount] = useState(1)       // messages on screen
  const [ready, setReady] = useState(false)   // the newest one is fully decoded
  const [rush, setRush] = useState(false)     // settle the newest one now
  const [gap, setGap] = useState(false)       // the "typing" beat before the next one
  const end = useRef<HTMLDivElement>(null)
  const finished = count >= script.length && ready

  useEffect(() => { end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }) }, [count, ready, gap])

  // Escape closes, as it does every other overlay in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const advance = () => {
    if (gap) return
    if (!ready) { setRush(true); return }
    if (count >= script.length) return
    // A short "typing" beat, then the next message starts as signal.
    setGap(true)
    setTimeout(() => { setGap(false); setReady(false); setRush(false); setCount((n) => n + 1) }, 380)
  }
  const skip = () => { setGap(false); setCount(script.length); setReady(true); setRush(true) }

  return (
    <div className="hd-scrim-holo scrim-in fixed inset-0 z-40 flex items-end justify-center p-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:items-center">
      <div role="dialog" aria-modal="true" aria-label={t('h.channel')}
        className="hd-holo hd-pop flex h-[min(600px,80dvh)] w-full max-w-[400px] flex-col overflow-hidden rounded-[22px]">
        {/* Header: the figure, who it is, and the language toggle — the one control a reader who
            cannot yet follow this screen needs most. */}
        <div className="hd-holo-head flex items-center gap-2.5 border-0 border-b border-solid border-white/25 py-3 pl-5 pr-3">
          <span className="hd-halo"><HandlerAvatar size={46} /></span>
          <div className="min-w-0 flex-1">
            <div className="a-mono flex items-center gap-1.5 whitespace-nowrap text-[10px] font-semibold tracking-[.08em] text-white/90 overflow-hidden"><span className="hd-dot" aria-hidden />{t('h.channel')}</div>
            <div className="a-hd mt-0.5 whitespace-nowrap text-[18px] font-bold text-white">{t('h.name')}</div>
          </div>
          <ALang />
        </div>

        {/* The conversation. The whole area is one big "next" button. */}
        <div className="hd-glassgrid flex-1 cursor-pointer overflow-y-auto px-5 py-4" onClick={advance} aria-live="polite">
          <ol className="m-0 flex list-none flex-col gap-3 p-0">
            {script.slice(0, count).map((line, i) => {
              const newest = i === count - 1
              return (
                <li key={i} className="hd-msg flex items-end gap-2">
                  <span className={`shrink-0 ${newest ? '' : 'opacity-0'}`}><HandlerAvatar size={28} live={newest} /></span>
                  <div className="hd-card min-w-0 flex-1 px-3.5 py-2.5 text-[16px] font-medium leading-relaxed text-ink">
                    <div className="a-mono mb-1 text-[10px] font-semibold tracking-[.14em] text-[#1450E6]">TX-{String(i + 1).padStart(2, '0')} · 2036</div>
                    <Decode text={line} remember={false} instant={!newest || rush} onDone={newest ? () => setReady(true) : undefined} />
                  </div>
                </li>
              )
            })}
            {gap && (
              <li className="hd-msg flex items-center gap-2">
                <HandlerAvatar size={28} />
                <span className="hd-typing px-2 py-2" aria-label={t('h.receiving')}><span /><span /><span /></span>
              </li>
            )}
          </ol>
          {finished && (
            <div className="hd-msg mt-3 text-right a-mono text-[11px] font-semibold tracking-[.14em] text-white">— {t('h.name')}</div>
          )}
          <div ref={end} />
        </div>

        {/* Footer: tap hint + skip while the story plays; the two mission buttons once it ends. */}
        <div className="border-0 border-t border-solid hd-holo-foot border-white/25 px-4 pb-5 pt-3">
          {finished ? (
            <div className="hd-msg flex flex-col gap-3">
              <PrimaryBtn onClick={onClose}>{t('v.welcome.start')}</PrimaryBtn>
              <GhostBtn to="/scan" onClick={onClose} icon={AIcon.scan}>{t('v.welcome.scanNow')}</GhostBtn>
              <p className="m-0 text-center text-[12px] text-white/85">{t('v.welcome.free')}</p>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={advance}
                className="hd-hint a-mono min-h-11 min-w-0 flex-1 cursor-pointer overflow-hidden text-ellipsis whitespace-nowrap border-0 bg-transparent p-0 text-left text-[11.5px] font-semibold tracking-[.04em] text-white">
                ▸ {t('h.tapNext')}
              </button>
              <span className="a-mono shrink-0 text-[11.5px] font-semibold text-white/80">{count}/{script.length}</span>
              <button type="button" onClick={skip}
                className="a-mono min-h-11 shrink-0 cursor-pointer rounded-[10px] border-[1.5px] border-solid border-white/80 bg-white/10 px-3 text-[12px] font-semibold tracking-[.1em] text-white">
                {t('h.skip')} ⏭
              </button>
            </div>
          )}
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
      {t('h.replay')}
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
