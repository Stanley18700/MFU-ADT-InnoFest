/*
 * Agency 2036 — the visitor kit for ADT InnoFest 2026 (design: the "Agency 2036" system and the
 * "ADT InnoFest 2026 — Agency 2036" canvas in Claude Design). Shapes live in index.css (`a-*`);
 * this file is the markup they hang on, shared by every visitor screen.
 *
 * The rules, so nobody has to rediscover them:
 *  - foil = earned (recovered files, the agent ID, unlocked rewards)
 *  - gold = "now" (NEW / NEXT, rank-up, unlocked) and always under dark text
 *  - brackets = tap (primary button, Scan, the next-target card) and nothing else
 *  - glitch only moves, once, and never under reduced motion
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { SegLoader, haptic, reducedMotion, useCountUp } from './game'
import { LOCALES, useLocale } from '../lib/locale'
import { useSlidingPill } from '../lib/useSlidingPill'

/* ------------------------------------------------------------------ ranks */

export type Rank = { key: 'recruit' | 'field' | 'senior'; index: 1 | 2 | 3 }
/** Recruit below the first reward, Field Agent from it, Senior Agent from the last. */
export function rankOf(points: number, thresholds: number[]): Rank {
  const sorted = [...thresholds].sort((a, b) => a - b)
  const first = sorted[0] ?? 50, last = sorted[sorted.length - 1] ?? 100
  if (points >= last) return { key: 'senior', index: 3 }
  if (points >= first) return { key: 'field', index: 2 }
  return { key: 'recruit', index: 1 }
}

/** Zero-padded to three digits: the agency's way of writing a count (057/100). */
export const pad3 = (n: number) => String(Math.max(0, Math.round(n))).padStart(3, '0')

/**
 * The "encrypted" title of a file not yet recovered: the same scramble every time for the same
 * booth, so it reads as a stored ciphertext rather than as noise that changes on every render.
 */
export function scramble(seed: string, len = 16) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ0123456789#%@/_'
  let h = 2166136261
  for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619)
  let out = ''
  for (let i = 0; i < len; i++) {
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    out += i === 4 || i === 10 ? '//' : chars[Math.abs(h) % chars.length]
  }
  return out.slice(0, len)
}

/** Two initials for the agent ID photo box. */
export const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('') || 'A'

/* ------------------------------------------------------------------ icons */

const I = (d: ReactNode, size = 24, sw = 2) => (
  <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round">{d}</svg>
)
export const AIcon = {
  cover: I(<><rect x="3" y="5" width="18" height="14" rx="1" /><circle cx="9" cy="11" r="2.2" /><path d="M5.8 16.5c.6-1.6 1.8-2.4 3.2-2.4s2.6.8 3.2 2.4M14.5 10h4M14.5 13.5h3" /></>),
  files: I(<path d="M3 6.5V19a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1h-8l-2-3H4a1 1 0 0 0-1 1.5z" />),
  scan: I(<path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10" />, 28, 2.2),
  rewards: I(<><rect x="3.5" y="8" width="17" height="4" rx=".5" /><path d="M5 12v8h14v-8M12 8v12M12 8c-1.5-3-5-3.5-5-1.2C7 8 9.5 8 12 8zM12 8c1.5-3 5-3.5 5-1.2C17 8 14.5 8 12 8z" /></>),
  profile: I(<><circle cx="12" cy="8" r="4" /><path d="M4.5 20.5c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" /></>),
  arrow: I(<path d="M5 12h14M13 6l6 6-6 6" />, 20, 2.4),
  back: I(<path d="M15 5l-7 7 7 7" />, 22, 2.2),
  close: I(<path d="M6 6l12 12M18 6L6 18" />, 22, 2.2),
  chevron: I(<path d="M9 6l6 6-6 6" />, 18, 2.2),
  check: I(<path d="M5 12.5l4.5 4.5L19 7.5" />, 14, 2.6),
  lock: I(<><rect x="5" y="11" width="14" height="10" rx="1" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></>, 18, 2.2),
  file: I(<><path d="M6 3h8l4 4v14H6z" /><path d="M9 13.5l2.2 2.2L15.5 11" /></>, 20, 2.2),
  pin: I(<><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>, 18),
  clock: I(<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>, 18),
  calendar: I(<><rect x="3" y="5" width="18" height="16" rx="1" /><path d="M3 10h18M8 3v4M16 3v4" /></>, 18),
  antenna: I(<><path d="M12 13v8M9 21h6" /><circle cx="12" cy="11" r="2" /><path d="M7.8 6.8a6 6 0 0 0 0 8.4M16.2 6.8a6 6 0 0 1 0 8.4" /></>, 18),
  star: (on: boolean, size = 13) => (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill={on ? '#1D5BFF' : 'none'} stroke={on ? '#1D5BFF' : '#7F90B6'} strokeWidth="2" strokeLinejoin="round"><path d="M12 2.8l2.8 6.4 6.9.6-5.2 4.6 1.6 6.8L12 17.6l-6.1 3.6 1.6-6.8-5.2-4.6 6.9-.6z" /></svg>
  ),
  google: (
    <svg aria-hidden width="20" height="20" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>
  ),
}

/* ------------------------------------------------------------------ chrome */

/** TH | EN, cut-cornered, the selected half in the neon fill. */
export function ALang({ className = '' }: { className?: string }) {
  const { locale, setLocale } = useLocale()
  return (
    <div className={`a-cut a-cut-s a-edge-neon flex shrink-0 ${className}`} role="group" aria-label="Language">
      {LOCALES.map((l, i) => (
        <button
          key={l} type="button" lang={l} aria-pressed={locale === l} onClick={() => setLocale(l)}
          className={`a-mono h-[37px] min-w-[46px] cursor-pointer border-0 px-2.5 text-[13px] font-semibold focus-visible:outline-[3px] focus-visible:outline-offset-[-3px] focus-visible:outline-[#00B4EE] ${locale === l ? 'text-white' : 'bg-transparent text-[#1450E6]'}`}
          style={locale === l ? { background: 'var(--a-neon)', clipPath: i === 0 ? 'polygon(6px 0,100% 0,100% 100%,0 100%,0 6px)' : 'polygon(0 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%)' } : undefined}
        >{l === 'th' ? 'TH' : 'EN'}</button>
      ))}
    </div>
  )
}

/** MFU 28 seal | ADT mark — the landing and loading header. */
export function Marks({ size = 34 }: { size?: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <img src="/brand/mfu28.webp" alt="Mae Fah Luang University, 28 years" width={size} height={size} className="block" style={{ width: size, height: size }} />
      <span aria-hidden className="h-6 w-px bg-[#C9D4EA]" />
      <img src="/brand/adt-mark.webp" alt="ADT — School of Applied Digital Technology" className="block h-[22px] w-auto" />
    </div>
  )
}

/**
 * The top row of every visitor screen: a lead (logos, a back link, a close button, or the ADT
 * mark beside a title) and the language switch. Sticky, on a white band, so the switch stays in
 * reach down a hundred files.
 */
export function AHeader({ lead = 'marks', title, to, onClose, sticky = false }: {
  lead?: 'marks' | 'back' | 'close' | 'mark'
  title?: ReactNode
  /** Where back / close goes. */
  to?: string
  onClose?: () => void
  sticky?: boolean
}) {
  const btn = 'flex h-11 w-11 -ml-3 shrink-0 items-center justify-center text-ink focus-visible:outline-[3px] focus-visible:outline-[#00B4EE]'
  const icon = lead === 'close' ? AIcon.close : AIcon.back
  return (
    <header className={`relative z-20 flex h-16 items-center justify-between gap-3 px-4 ${sticky ? 'sticky top-0 bg-white/92 backdrop-blur-md' : ''}`}>
      <div className="flex min-w-0 items-center gap-2">
        {lead === 'marks' && <Marks />}
        {(lead === 'back' || lead === 'close') && (onClose
          ? <button type="button" onClick={onClose} aria-label={lead === 'close' ? 'Close' : 'Back'} className={`${btn} cursor-pointer border-0 bg-transparent`}>{icon}</button>
          : <Link to={to ?? '/'} aria-label={lead === 'close' ? 'Close' : 'Back'} className={btn}>{icon}</Link>)}
        {lead === 'mark' && <img src="/brand/adt-mark.webp" alt="ADT" className="h-5 w-auto shrink-0" />}
        {title && <h1 className="a-hd m-0 truncate text-[22px] font-bold leading-tight tracking-tight">{title}</h1>}
      </div>
      <ALang />
    </header>
  )
}

/** The white page with the fading blue grid behind its top. */
export function AGround({ children, className = '', grid = 'h-[420px]' }: { children: ReactNode; className?: string; grid?: string }) {
  return (
    <div className={`a-ground min-h-full text-ink ${className}`}>
      <div aria-hidden className={`a-grid ${grid}`} />
      <div className="relative">{children}</div>
    </div>
  )
}

/** Mono eyebrow, with the live pulse when it is a transmission. */
export function Eyebrow({ children, pulse = false, className = '' }: { children: ReactNode; pulse?: boolean; className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {pulse && <span aria-hidden className="a-dot a-pulse" />}
      <span className="a-label">{children}</span>
    </div>
  )
}

/* ------------------------------------------------------------------ buttons */

type BtnProps = { children: ReactNode; to?: string; state?: unknown; onClick?: () => void; type?: 'button' | 'submit'; disabled?: boolean; className?: string; icon?: ReactNode }

/**
 * The one primary action on a screen: neon, cut, glowing, bracketed — and it plays like a game
 * button. Pressing pulls the brackets in onto the button; letting go "locks on" (a quick blink and,
 * on Android, a tiny buzz). A link waits the length of that blink before it goes, so the lock is
 * seen. `loading` keeps the brackets pulsing on target and runs a charge sweep across the button,
 * with segments where the arrow was, until the work is done.
 */
export function PrimaryBtn({ children, to, state, onClick, type = 'button', disabled, className = '', icon = AIcon.arrow, loading = false }: BtnProps & { loading?: boolean }) {
  const nav = useNavigate()
  const [phase, setPhase] = useState<'idle' | 'press' | 'lock'>('idle')
  const timer = useRef<number>(0)
  useEffect(() => () => window.clearTimeout(timer.current), [])
  const off = disabled && !loading
  const press = () => { if (!off && !loading) setPhase('press') }
  const release = () => setPhase((p) => (p === 'press' ? 'idle' : p))
  const lock = () => {
    haptic(12)
    setPhase('lock')
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setPhase('idle'), 340)
  }
  const inner = <>
    {loading && <span aria-hidden className="g-charge" />}
    <span className="relative">{children}</span>
    {loading ? <SegLoader segments={4} tone="white" className="relative" /> : icon}
  </>
  const wrap = `a-brk ${off ? '' : 'a-glow'} ${phase === 'press' ? 'is-press' : ''} ${phase === 'lock' ? 'is-lock' : ''} ${loading ? 'is-loading' : ''} ${className}`
  const handlers = { onPointerDown: press, onPointerUp: release, onPointerLeave: release, onPointerCancel: release }
  return (
    <div className={wrap}>
      {to && !disabled
        ? <Link to={to} state={state} {...handlers} className="a-btn a-btn-primary a-cut"
            onClick={(e) => {
              // Plain clicks wait for the lock-on blink; a modified click (new tab) goes at once.
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0 || reducedMotion()) { onClick?.(); return }
              e.preventDefault(); lock(); onClick?.()
              window.setTimeout(() => nav(to, { state }), 170)
            }}>{inner}</Link>
        : <button type={type} {...handlers} onClick={() => { lock(); onClick?.() }} disabled={disabled} aria-busy={loading || undefined} className="a-btn a-btn-primary a-cut">{inner}</button>}
    </div>
  )
}

/** The secondary action: white with a neon edge. `plain` is the grey-edged Google button. */
export function GhostBtn({ children, to, state, onClick, type = 'button', disabled, className = '', icon, plain = false }: BtnProps & { plain?: boolean }) {
  const cls = `a-btn ${plain ? 'a-btn-plain' : 'a-btn-ghost'} a-cut ${className}`
  const inner = <>{icon}{children}</>
  return to && !disabled
    ? <Link to={to} state={state} onClick={onClick} className={cls}>{inner}</Link>
    : <button type={type} onClick={onClick} disabled={disabled} className={cls}>{inner}</button>
}

/** A red, cut-cornered panel: what went wrong and how to fix it. Distinct from gold in hue and lightness. */
export function ErrorPanel({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="a-cut a-edge-red a-fill-err flex items-start gap-3 px-3.5 py-3">
      <span aria-hidden className="a-hd grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#C8102E] text-sm font-bold text-white">!</span>
      <p className="m-0 text-sm leading-snug">{children}</p>
    </div>
  )
}

/* ------------------------------------------------------------------ tags */

export function GoldTag({ children, pop = false, className = '' }: { children: ReactNode; pop?: boolean; className?: string }) {
  return <span className={`a-tag a-tag-gold a-cut ${pop ? 'a-pop' : ''} ${className}`}>{children}</span>
}
export function InkTag({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`a-tag a-tag-ink ${className}`}>{children}</span>
}
export function LockedTag({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`a-tag a-tag-locked ${className}`}>{children}</span>
}

/* ------------------------------------------------------------------ data blocks */

/** Personal progress: 057/100 with gold markers at each reward. */
export function FilesProgress({ points, total, thresholds, labels }: {
  points: number; total: number; thresholds: Array<{ at: number; label: string }>
  labels: { title: string; toGo: string | null; unlocked: (label: string) => string }
}) {
  // Counts up like a score from wherever it last stood this session (037 → 038 after a scan),
  // and the bar fills with it.
  const shown = useCountUp(points, { key: 'files-progress' })
  const pct = total ? Math.min(100, (shown / total) * 100) : 0
  const lit = thresholds.filter((t) => points >= t.at)
  const last = lit[lit.length - 1]
  return (
    <div className="a-cut a-edge-line px-3.5 pb-2.5 pt-3">
      <div className="flex items-start justify-between gap-3">
        <span className="a-label text-[var(--a-muted)]">{labels.title}</span>
        {labels.toGo && <span className="text-right text-xs text-[var(--a-muted)]">{labels.toGo}</span>}
      </div>
      <div className="mt-0.5"><span className="a-mono a-neon-text text-[40px] font-semibold leading-[42px]" aria-label={String(points)}>{pad3(shown)}</span><span className="a-mono text-xl text-[var(--a-muted)]">/{total}</span></div>
      <div className="a-bar mr-[7px] mt-2" role="progressbar" aria-valuenow={points} aria-valuemin={0} aria-valuemax={total} aria-label={labels.title}>
        <span className="fill !transition-none" style={{ width: `${pct}%` }} />
        {thresholds.map((t) => <span key={t.at} className={`a-marker ${shown >= t.at ? '' : 'off'}`} style={{ left: `${(t.at / total) * 100}%` }} />)}
      </div>
      <div className="relative mt-2 h-7">
        {thresholds.map((t) => {
          const isLast = t === thresholds[thresholds.length - 1]
          const pos = (t.at / total) * 100
          return (
            <div key={t.at} className="absolute top-0.5 flex max-w-[48%] items-center gap-1.5 whitespace-nowrap" style={isLast ? { right: 0 } : { left: `${pos}%`, transform: 'translateX(-50%)' }}>
              <span className="a-mono text-xs font-semibold text-ink">{t.at}</span>
              {last === t
                ? <GoldTag className="min-w-0">{AIcon.check}<span className="truncate">{labels.unlocked(t.label)}</span></GoldTag>
                : <span className="truncate text-xs text-[var(--a-muted)]">{t.label}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** The agent ID: navy card, initials in a scanned photo box, rank badge, machine-readable line. */
export function AgentCard({ name, agentId, rankLabel, rankIndex, labels }: {
  name: string; agentId: string; rankLabel: string; rankIndex: 1 | 2 | 3
  labels: { agency: string; field: string; agent: string; rank: string }
}) {
  const mrz = `${agentId.replace(/-/g, '<')}<<${name.toUpperCase().replace(/[^A-Z]+/g, '<')}`.padEnd(30, '<').slice(0, 30) + '2036'
  return (
    <div className="a-cut a-edge-neon a-fill-id relative overflow-hidden px-4 pb-3 pt-4">
      {/* Circuit traces and the holographic stripe, as the ID card is drawn in the system. */}
      <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 343 196" preserveAspectRatio="none">
        <path d="M150 0v22h60v16M0 120h18v40h40M240 70h60v-40h43" stroke="#2D5BD0" strokeWidth="1" fill="none" opacity=".7" />
        <circle cx="300" cy="30" r="2.5" fill="none" stroke="#5B8BFF" /><circle cx="58" cy="160" r="2.5" fill="none" stroke="#5B8BFF" />
        <path d="M250 0l-46 196h22L272 0z" fill="url(#holo)" opacity=".22" />
        <defs><linearGradient id="holo" x1="0" x2="1"><stop offset="0" stopColor="#8FEAFF" /><stop offset=".5" stopColor="#E7CCFF" /><stop offset="1" stopColor="#8FEAFF" /></linearGradient></defs>
      </svg>
      <div className="relative flex items-start justify-between">
        <div>
          <div className="a-mono text-[11px] font-semibold tracking-[.14em] text-white">{labels.agency}</div>
          <div className="a-mono mt-0.5 text-[10px] tracking-[.14em] text-[#9FD8FF]">{labels.field}</div>
        </div>
        <span aria-hidden className="grid h-10 w-10 place-items-center rounded-full" style={{ background: 'conic-gradient(from 210deg, #CFF3FF, #E7CCFF, #C6FBEA, #CCDDFF, #CFF3FF)' }}>
          <img src="/brand/adt-mark.webp" alt="" className="h-3.5 w-auto" />
        </span>
      </div>
      <div className="relative mt-3 flex items-center gap-3">
        <div className="a-cut a-edge-neon grid h-[72px] w-[62px] shrink-0 place-items-center" style={{ ['--fill' as string]: 'linear-gradient(#14307f,#0b1a57)' }}>
          <span className="a-hd text-[26px] font-bold text-white">{initials(name)}</span>
        </div>
        <div className="min-w-0">
          <div className="a-mono text-[10px] tracking-[.14em] text-[#9FD8FF]">{labels.agent}</div>
          <div className="a-hd truncate text-[22px] font-bold leading-tight text-white">{name}</div>
          <div className="a-mono text-[19px] font-semibold tracking-[.06em] text-[#8FEAFF]">{agentId}</div>
        </div>
      </div>
      <div className="relative mt-3 flex items-center justify-between gap-2">
        <span className="a-hd inline-flex items-center gap-1.5 bg-white px-2.5 py-1 text-[15px] font-semibold text-ink" style={{ clipPath: 'polygon(0 0,100% 0,100% calc(100% - 6px),calc(100% - 6px) 100%,0 100%)' }}>
          <span className="text-[#1D5BFF]">★</span>{rankLabel}
        </span>
        <span className="flex items-center gap-2">
          <span className="a-mono text-[11px] tracking-[.1em] text-[#9FD8FF]">{labels.rank} {rankIndex}/3</span>
          <span aria-hidden className="flex gap-0.5">{[1, 2, 3].map((i) => <span key={i} className="h-1 w-4" style={{ background: i <= rankIndex ? 'linear-gradient(90deg,#1D5BFF,#00D2FF)' : 'rgb(159 216 255 / .3)' }} />)}</span>
        </span>
      </div>
      <div className="a-mono relative mt-1.5 truncate text-[10px] tracking-[.18em] text-[#8FA9E8]">{mrz}</div>
    </div>
  )
}

/** "Go here next": the one bracketed card on the cover. */
export function NextTarget({ to, title, meta, labels }: { to: string; title: string; meta: string; labels: { tag: string; eyebrow: string } }) {
  return (
    <Link to={to} className="a-brk a-glow block text-ink no-underline focus-visible:outline-[3px] focus-visible:outline-offset-4 focus-visible:outline-[#00B4EE]">
      <div className="a-cut a-edge-neon flex items-center gap-3 px-3.5 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2"><GoldTag>{labels.tag}</GoldTag><span className="a-label text-[var(--a-muted)]">{labels.eyebrow}</span></div>
          <div className="a-hd mt-1.5 truncate text-[17px] font-bold leading-tight">{title}</div>
          <div className="a-mono mt-1 flex items-center gap-1 truncate text-xs text-[var(--a-muted)]"><span className="shrink-0">{AIcon.pin}</span><span className="truncate">{meta}</span></div>
        </div>
        <span className="a-cut a-solid a-fill-neon grid h-11 w-11 shrink-0 place-items-center text-white">{AIcon.arrow}</span>
      </div>
    </Link>
  )
}

/**
 * One project in the files grid. Recovered: foil and a blue check. Encrypted: dashed, greyed,
 * its title scrambled. NEW / NEXT wear the gold tag; only NEXT is bracketed, because only that
 * one is a call to walk somewhere.
 */
export function FileTile({ code, title, recovered, isNew, isNext, labels, onOpen }: {
  to?: string; code: string; title: string; recovered: boolean; isNew?: boolean; isNext?: boolean; onOpen: () => void
  labels: { recovered: string; encrypted: string; isNew: string; isNext: string }
}) {
  const body = recovered ? (
    <div className="a-cut a-cut-s a-edge-soft a-fill-foil relative flex h-full flex-col px-2 pb-2 pt-2">
      <div className="flex items-start justify-between gap-1">
        <span className="a-mono text-[11px] font-semibold text-[var(--a-blue-deep)]">{code}</span>
        <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-[#1D5BFF] text-white" aria-label={labels.recovered}>{AIcon.check}</span>
      </div>
      <span className="mt-1 text-[#1D5BFF]">{AIcon.file}</span>
      <span className="a-hd mt-auto line-clamp-2 text-[12.5px] font-semibold leading-[1.2] text-ink">{title}</span>
    </div>
  ) : (
    <div className="a-dashed a-cut-s flex h-full flex-col px-2 pb-2 pt-2">
      <div className="flex items-start justify-between gap-1">
        <span className="a-mono text-[11px] font-semibold">{code}</span>
        <span className="text-[#7F8AA3]">{AIcon.lock}</span>
      </div>
      <span className="a-mono mt-auto break-all text-[11px] leading-[1.25] tracking-[.04em]">{scramble(code, 10)}</span>
      <span className="a-mono mt-1 text-[9px] font-semibold tracking-[.1em]">{labels.encrypted}</span>
    </div>
  )
  return (
    <button type="button" onClick={onOpen} aria-label={`${code} · ${recovered ? title : labels.encrypted}`} className={`relative block h-[112px] w-full cursor-pointer border-0 bg-transparent p-0 text-left text-inherit focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-[#00B4EE] ${isNext ? 'a-brk' : ''}`}>
      {body}
      {(isNew || isNext) && <GoldTag pop={isNew} className="absolute -top-2 right-1 z-10 !h-[18px] !px-1.5 !text-[10px]">{isNew ? labels.isNew : labels.isNext}</GoldTag>}
    </button>
  )
}

/* ------------------------------------------------------------------ tab bar */

/**
 * Cover · Files · (Scan) · Rewards · Profile. The Scan button is the one round shape in the
 * system, raised into the bar and bracketed. The indicator is a glowing bar that slides between
 * tabs (`useSlidingPill`, as before).
 */
export function ATabBar({ tabs, scanTo, scanLabel }: { tabs: Array<{ to: string; label: string; icon: ReactNode; end?: boolean }>; scanTo: string; scanLabel: string }) {
  const rail = useSlidingPill<HTMLDivElement>()
  const [left, right] = [tabs.slice(0, 2), tabs.slice(2)]
  const tab = (t: (typeof tabs)[number]) => (
    <NavLink key={t.to} to={t.to} end={t.end} className={({ isActive }) => `a-hd flex min-h-14 min-w-0 flex-col items-center justify-end gap-[3px] pb-1 text-xs font-semibold no-underline transition-colors ${isActive ? 'text-[#1450E6]' : 'text-[var(--a-muted)] hover:text-[#1450E6]'}`}>
      {t.icon}<span className="truncate">{t.label}</span>
    </NavLink>
  )
  return (
    <div className="fixed inset-x-0 bottom-0 z-20">
      <nav className="border-t border-[#D2DCEE] bg-white/95 backdrop-blur-md" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 0.5rem)' }} aria-label="Agent pages">
        <div ref={rail} className="tab-rail a-tabrail relative mx-auto grid h-[68px] max-w-md items-end" style={{ gridTemplateColumns: 'repeat(2,minmax(0,1fr)) 5.5rem repeat(2,minmax(0,1fr))' }}>
          {left.map(tab)}
          <div className="relative flex flex-col items-center justify-end pb-1">
            <div className="a-brk a-brk-wide absolute -top-[34px] left-1/2 h-[62px] w-[62px] -translate-x-1/2">
              <Link to={scanTo} aria-label={scanLabel} className="flex h-[62px] w-[62px] items-center justify-center rounded-full text-white focus-visible:outline-[3px] focus-visible:outline-offset-4 focus-visible:outline-[#00B4EE]"
                style={{ background: 'linear-gradient(140deg,#2E3CFF 0%,#1D5BFF 50%,#0A86DA 100%)', boxShadow: '0 0 0 4px #fff,0 0 0 6px rgb(0 200 255 / .45),0 8px 22px rgb(29 91 255 / .5),0 0 18px rgb(0 210 255 / .45)' }}>
                {AIcon.scan}
              </Link>
            </div>
            <span className="a-hd text-xs font-bold text-[#1450E6]">{scanLabel}</span>
          </div>
          {right.map(tab)}
        </div>
      </nav>
    </div>
  )
}
