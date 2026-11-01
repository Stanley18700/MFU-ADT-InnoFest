import { Navigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { ms, useEvent } from '../../lib/data'
import { eventDateLine } from '../../lib/eventText'
import type { ReactNode } from 'react'
import { Spinner } from '../../components/ui'
import { AGround, AHeader, AIcon, Eyebrow, GhostBtn, PrimaryBtn } from '../../components/agency'
import { useLocale } from '../../lib/locale'

export default function Landing() {
  const { ready, user, emailVerified, role } = useAuth()
  const event = useEvent()
  const { t, pick } = useLocale()
  if (!ready) return <Spinner label={t('v.loading')} page />
  if (role === 'visitor') return <Navigate to="/mission" replace />
  if (role === 'organizer') return <Navigate to="/booth" replace />
  if (role === 'admin') return <Navigate to="/admin" replace />
  // Signed in but stopped halfway: finish confirming the address, or finish the form.
  if (user && !emailVerified) return <Navigate to="/verify-email" replace />
  if (user) return <Navigate to="/join" replace />

  /*
   * Incoming transmission: the story in two lines and one sentence, the event's facts in one
   * panel, and the two ways in at the foot, in the thumb zone. The logo glitches in once on load
   * and then holds perfectly still (still from the start under reduced motion).
   */
  return (
    <AGround className="mx-auto max-w-md">
      <main className="flex min-h-dvh flex-col pb-[max(env(safe-area-inset-bottom),12px)]">
        <AHeader lead="marks" />
        <section aria-label={t('a.landing.tx')} className="page-in px-4 pt-1">
          <Eyebrow pulse>{t('a.landing.tx')}</Eyebrow>
          <h1 className="a-hd mb-0 mt-2.5 text-[31px] font-bold leading-[1.12] tracking-tight">
            <span className="block">{t('a.landing.h1a')}</span>
            <span className="a-neon-text block">{t('a.landing.h1b')}</span>
          </h1>
          <p className="a-cut a-cut-s a-solid a-fill-tint mb-0 mt-3 px-3 py-2.5 text-sm leading-snug text-[#24324F]">{t('a.landing.story')}</p>
        </section>

        <div className="relative mt-2 flex justify-center">
          <div aria-hidden className="absolute left-1/2 top-1/2 h-[240px] w-[360px] -translate-x-1/2 -translate-y-1/2" style={{ background: 'radial-gradient(closest-side, rgb(0 210 255 / .26), rgb(46 60 255 / .12) 55%, rgb(255 255 255 / 0))' }} />
          {/* The festival's own wordmark carries the name, so the name is its alt text. */}
          <div className="a-glitch relative aspect-[270/174] w-[min(72vw,280px)]">
            <img src="/brand/logo-innofest.webp" alt={pick(event.nameEn, event.nameTh)} className="gl-base absolute inset-0 h-full w-full object-contain" />
            <img src="/brand/logo-innofest.webp" alt="" aria-hidden className="gl-a" />
            <img src="/brand/logo-innofest.webp" alt="" aria-hidden className="gl-b" />
          </div>
        </div>
        <div className="landing-campus-wrap -mt-2">
          <img src="/brand/cyber-campus-cutout.png" alt="" aria-hidden className="landing-campus block h-auto w-full" />
        </div>

        <div className="relative z-10 mx-4 -mt-7">
          <div className="a-cut a-edge-soft grid grid-cols-2 gap-x-3 gap-y-2.5 px-3.5 py-3">
            <Fact icon={AIcon.calendar} label={t('a.landing.date')}>{eventDateLine(event, false)}</Fact>
            <Fact icon={AIcon.clock} label={t('a.landing.time')} mono>{eventTimeLine(event)}</Fact>
            <div className="col-span-2 border-t border-dashed border-[#C9D4EA] pt-2.5">
              <Fact icon={AIcon.pin} label={t('a.landing.venue')}>{t('a.landing.venueName')}</Fact>
            </div>
          </div>
        </div>

        <div className="mt-auto flex flex-col gap-3.5 px-4 pt-6">
          <PrimaryBtn to="/signup">{t('v.landing.start')}</PrimaryBtn>
          <GhostBtn to="/signin">{t('v.landing.have')}</GhostBtn>
          <div className="a-mono mt-1 text-center text-[10px] tracking-[.1em] text-[var(--a-muted)]">{t('a.landing.foot')}</div>
        </div>
      </main>
    </AGround>
  )
}

function Fact({ icon, label, children, mono = false }: { icon: ReactNode; label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 shrink-0 text-[#1450E6]">{icon}</span>
      <div className="min-w-0">
        <div className="a-mono text-[10px] tracking-[.08em] text-[#55627E]">{label}</div>
        <div className={`${mono ? 'a-mono' : 'a-hd'} text-[15px] font-semibold leading-tight`}>{children}</div>
      </div>
    </div>
  )
}

/** 08:00–17:00 in Bangkok time, from the live event's own start and end. */
function eventTimeLine(event: { startsAt: unknown; endsAt: unknown }) {
  const f = (v: unknown) => { const n = ms(v); return n ? new Date(n).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }) : null }
  const a = f(event.startsAt), b = f(event.endsAt)
  return a && b ? `${a}–${b}` : '—'
}
