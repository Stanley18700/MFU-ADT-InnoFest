import type { ReactNode } from 'react'
import { useLocale } from '../../lib/locale'
import { useEvent } from '../../lib/data'
import { eventDateLine } from '../../lib/eventText'
import { AGround, AHeader, Eyebrow } from '../../components/agency'

// DarkNotice moved to components/ui so the booth screen and shared notices can use it; kept here for the auth pages.
export { Notice } from '../../components/ui'

/**
 * The festival set behind the signed-out screens and the passport pages, after the key visual: a
 * sky ground with wave bands, white paper-cut clouds, a paper sun, the line-art globe, and the
 * paper-cut campus at the foot. `hills={false}` for pages with a bottom tab bar.
 */
export function FestivalBackdrop({ hills = true }: { hills?: boolean }) {
  // The Agency 2036 ground behind every screen outside the passport shell: white, the fading
  // blue grid, and the holographic campus along the foot where there is room for it.
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-white" aria-hidden>
      <div className="a-grid" />
      {hills && <img src="/brand/campus-holo.webp" alt="" className="absolute bottom-0 left-0 w-full opacity-60" style={{ WebkitMaskImage: 'linear-gradient(to bottom, transparent, #000 45%)', maskImage: 'linear-gradient(to bottom, transparent, #000 45%)' }} />}
    </div>
  )
}

/** Mae Fah Luang University's 28-year seal, the university mark on the InnoFest poster. */
export function UniversityMark({ className = 'h-14 w-14' }: { className?: string }) {
  return <img src="/brand/mfu28.webp" alt="Mae Fah Luang University, 28 years" className={`${className} shrink-0`} width={160} height={160} />
}

/**
 * A torn-paper label, as the poster names each activity: flat colour, 2px corner, a small fixed
 * tilt, a hard offset shadow. Text is ink on the light scraps and white only on the two dark ones.
 */
const SCRAP = {
  ink: 'bg-chrome text-white', forest: 'bg-green-700 text-white', red: 'bg-danger text-white',
  orange: 'bg-orange-400 text-ink', sky: 'bg-sky-300 text-ink', cream: 'bg-panel-warm text-ink',
} as const
export function ScrapLabel({ tone = 'forest', tilt = -2.5, className = '', children }: { tone?: keyof typeof SCRAP; tilt?: number; className?: string; children: ReactNode }) {
  return (
    <span className={`inline-block rounded-[2px] px-3 py-1.5 text-sm font-semibold shadow-paper ${SCRAP[tone]} ${className}`} style={{ transform: `rotate(${tilt}deg)` }}>{children}</span>
  )
}

/**
 * Every signed-out screen: the white agency ground with its fading grid, a back link and the
 * language switch, a mono line naming the event, then the page's own title and content. No card
 * around it — the ground is already white, and the screens in the design system have none.
 */
export function AuthShell({ title, lead, children, foot, back = '/', eventLine = true }: {
  title: string
  lead?: ReactNode
  children: ReactNode
  foot?: ReactNode
  back?: string | null
  /** The festival name and date above the title; off for pages that are not about this event. */
  eventLine?: boolean
}) {
  const event = useEvent()
  return (
    <AGround className="mx-auto max-w-md" grid="h-[260px]">
      <main className="flex min-h-dvh flex-col pb-[max(env(safe-area-inset-bottom),20px)]">
        {back ? <AHeader lead="back" to={back} /> : <AHeader lead="marks" />}
        <section className="page-in flex flex-1 flex-col px-4">
          {eventLine && <Eyebrow pulse>{event.nameEn} · {eventDateLine(event, false)}</Eyebrow>}
          <h1 className="a-hd mb-0 mt-2 text-[28px] font-bold leading-[1.15] tracking-tight">{title}</h1>
          {lead && <p className="mb-0 mt-1.5 text-sm leading-relaxed text-[#33415F]">{lead}</p>}
          {children}
        </section>
        {foot && <p className="mx-4 mb-0 mt-8 text-center text-sm text-[#33415F]">{foot}</p>}
      </main>
    </AGround>
  )
}

export function GoogleButton({ onClick, busy, label }: { onClick: () => void; busy?: boolean; label: string }) {
  const { t } = useLocale()
  return (
    <button type="button" onClick={onClick} disabled={busy} className="a-btn a-btn-plain a-cut">
      <GoogleMark />
      {busy ? t('au.google.opening') : label}
    </button>
  )
}

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden>
      <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.2-.4-4.7H24v8.9h11.8c-.5 2.7-2 5-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.3z" />
      <path fill="#34A853" d="M24 46c5.9 0 10.9-2 14.5-5.2l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.5-3.8-12.2-9H4.5v5.7C8.1 41.3 15.5 46 24 46z" />
      <path fill="#FBBC05" d="M11.8 28.4c-.4-1.3-.7-2.7-.7-4.4s.3-3.1.7-4.4v-5.7H4.5A22 22 0 0 0 2 24c0 3.6.9 6.9 2.5 9.9l7.3-5.5z" />
      <path fill="#EA4335" d="M24 10.5c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 3.9 29.9 2 24 2 15.5 2 8.1 6.7 4.5 14.1l7.3 5.7c1.7-5.2 6.5-9.3 12.2-9.3z" />
    </svg>
  )
}

export function Divider({ children }: { children: ReactNode }) {
  return (
    <div className="a-mono my-4 flex items-center gap-2.5 text-[11px] uppercase tracking-[.08em] text-[var(--a-muted)]">
      <span className="h-px flex-1 bg-[#D2DCEE]" />{children}<span className="h-px flex-1 bg-[#D2DCEE]" />
    </div>
  )
}

export function Field({ label, hint, ...input }: { label: string; hint?: ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="a-lbl">{label}</span>
      <input className="a-field" {...input} />
      {hint && <span className="a-hint block">{hint}</span>}
    </label>
  )
}
