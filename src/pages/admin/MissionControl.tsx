import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, doc, getCountFromServer, query, where } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useBoothStats, useCollection, useDoc } from '../../lib/data'
import { useLocale } from '../../lib/locale'
import { fmt, Icon } from '../../components/ui'
import { dayOf, EVENT_SURVEY_ID, isMfuOnlyTier, surveyGates, type SurveyDoc } from '../../../shared/model'
import { stockLevel, useNewApplications } from './AdminHandler'
import type { useDashboardModel } from './useDashboardModel'

type Model = ReturnType<typeof useDashboardModel>
type Tone = 'red' | 'amber' | 'blue'
type Attn = { id: string; tone: Tone; title: string; detail: string; to: string; fix: string }

const FIXTURES = import.meta.env.MODE === 'fixtures'

/** A server-side count, refreshed every minute: no document is downloaded to get the number. */
function useServerCount(make: () => ReturnType<typeof query> | null, deps: unknown[], fixture: number) {
  const [n, setN] = useState<number | null>(FIXTURES ? fixture : null)
  useEffect(() => {
    if (FIXTURES) return
    const q = make()
    if (!q) return
    let live = true
    const run = () => getCountFromServer(q).then((s) => { if (live) setN(s.data().count) }).catch(() => { if (live) setN(null) })
    void run()
    const id = window.setInterval(run, 60_000)
    return () => { live = false; window.clearInterval(id) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return n
}

/** Before, on, or after the event day, and how many days to go. */
function usePhase(days: string[]) {
  const today = dayOf(new Date())
  if (days.includes(today)) return { phase: 'live' as const, n: 0 }
  const first = days[0]
  if (first && today < first) return { phase: 'before' as const, n: Math.round((Date.parse(first) - Date.parse(today)) / 86_400_000) }
  return { phase: days.length ? 'after' as const : 'before' as const, n: 0 }
}

/**
 * The top of the dashboard: where the mission stands, what needs the admin right now (each line
 * with the button that fixes it), the InnoFest numbers, and the screens an admin opens most.
 */
export function MissionControl({ m }: { m: Model }) {
  const { t, locale } = useLocale()
  const { phase, n } = usePhase(m.event.days)
  const survey = useDoc<SurveyDoc>(doc(db, 'surveys', EVENT_SURVEY_ID), [], 'the festival survey').data
  const gate = surveyGates(survey)
  const answered = useServerCount(() => query(collection(db, 'surveyResponses'), where('boothId', '==', EVENT_SURVEY_ID)), [], 812)
  const mfuTier = m.tiers.find((x) => isMfuOnlyTier(x, x.id))
  const mfu = useServerCount(() => (mfuTier ? query(collection(db, 'tierUnlocks'), where('tierId', '==', mfuTier.id)) : null), [mfuTier?.id], 488)
  const { data: bstats } = useBoothStats()
  const invited = bstats.reduce((s, b) => s + (b.invited ?? 0), 0)
  const came = bstats.reduce((s, b) => s + (b.invitedCame ?? 0), 0)
  const ratings = useCollection<{ count?: number; sum?: number }>(collection(db, 'stats/ratings/items'), [], 'the rating counters').data
  const rCount = ratings.reduce((s, r) => s + (r.count ?? 0), 0)
  const rAvg = rCount ? ratings.reduce((s, r) => s + (r.sum ?? 0), 0) / rCount : null
  const newApps = useNewApplications()
  const visitors = Math.max(0, m.ev.totals.visitors)
  const rate = answered !== null && visitors ? Math.round((answered / visitors) * 100) : null

  const attn: Attn[] = []
  for (const s of m.stock) {
    const lv = stockLevel(s.remaining, s.total)
    if (lv === 'out') attn.push({ id: `s-${s.id}`, tone: 'red', title: t('mc.a.stockOut', { tier: s.name }), detail: t('mc.a.stockOutD'), to: '/admin/prizes', fix: t('mc.f.restock') })
    else if (lv === 'low') attn.push({ id: `s-${s.id}`, tone: 'amber', title: t('mc.a.stockLow', { tier: s.name, n: s.remaining }), detail: t('mc.a.stockLowD'), to: '/admin/prizes', fix: t('mc.f.restock') })
  }
  if (phase === 'live' && m.ev.totals.stamps > 0) {
    const quiet = m.board.filter((b) => b.stamps === 0)
    if (quiet.length) attn.push({
      id: 'quiet', tone: 'amber', title: t('mc.a.quiet', { n: quiet.length }), to: '#mc-board', fix: t('mc.f.board'),
      detail: t('mc.a.quietD', { names: quiet.slice(0, 4).map((b) => b.shortName || b.nameEn).join(', ') + (quiet.length > 4 ? '…' : '') }),
    })
  }
  if (gate && rate !== null && visitors >= 20 && rate < 50) attn.push({ id: 'survey', tone: 'amber', title: t('mc.a.survey', { rate }), detail: t('mc.a.surveyD'), to: '/admin/feedback', fix: t('mc.f.survey') })
  if (!gate && phase !== 'after') attn.push({ id: 'surveyOff', tone: 'blue', title: t('mc.a.surveyOff'), detail: t('mc.a.surveyOffD'), to: '/admin/feedback', fix: t('mc.f.survey') })
  if (newApps > 0) attn.push({ id: 'apps', tone: 'blue', title: t('mc.a.apps', { n: newApps }), detail: t('mc.a.appsD'), to: '/admin/applications', fix: t('mc.f.review') })

  const first = m.event.days[0]
  const dateLabel = first ? new Date(`${first}T12:00:00+07:00`).toLocaleDateString(locale === 'th' ? 'th-TH' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' }) : ''
  const title = phase === 'live' ? t('mc.t.live') : phase === 'after' ? t('mc.t.after') : n === 1 ? t('mc.t.beforeOne') : t('mc.t.before', { n })
  const sub = phase === 'live' ? t('mc.sub.live') : phase === 'after' ? t('mc.sub.after') : t('mc.sub.before', { date: dateLabel })

  const kpis: Array<{ v: string; l: string; s?: string }> = [
    { v: fmt(visitors), l: t('mc.k.agents') },
    { v: fmt(Math.max(0, m.ev.totals.stamps)), l: t('mc.k.scans') },
    { v: fmt(Math.max(0, m.ev.activeLast15m)), l: t('mc.k.active') },
    { v: answered === null ? '–' : fmt(answered), l: t('mc.k.survey'), s: rate === null ? undefined : t('mc.k.surveySub', { rate }) },
    { v: mfu === null ? '–' : fmt(mfu), l: t('mc.k.mfu') },
    { v: fmt(Math.max(0, m.ev.totals.redeemed)), l: t('mc.k.prizes') },
    { v: fmt(invited), l: t('mc.k.invited'), s: t('mc.k.invitedSub', { came: fmt(came) }) },
    { v: rAvg === null ? '–' : `${rAvg.toFixed(1)}★`, l: t('mc.k.rating'), s: rCount ? t('mc.k.ratingSub', { n: fmt(rCount) }) : undefined },
  ]

  const quick: Array<[string, string, React.ReactNode, boolean?]> = [
    ['/admin/wall', t('mc.q.wall'), Icon.screen],
    ['/redeem', t('mc.q.desk'), Icon.desk],
    ['/admin/booth-cards', t('mc.q.cards'), Icon.print],
    ['/admin/poster', t('mc.q.poster'), Icon.print],
  ]

  return (
    <section className="flex flex-col gap-4">
      <div className="mc-hero px-5 pb-5 pt-4 sm:px-6">
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="a-mono flex items-center gap-2 text-[11px] font-semibold tracking-[.14em] text-[#7FE7FF]">
              <span className="mc-pulse" style={{ ['--tone' as string]: phase === 'live' ? '#3BE38B' : '#7FE7FF' }} aria-hidden />{t('mc.eyebrow')}
            </div>
            <h1 className="a-hd m-0 mt-1.5 text-[clamp(26px,5vw,38px)] font-bold leading-tight text-white">{title}</h1>
            <p className="m-0 mt-1 max-w-xl text-[14px] text-white/80">{sub}</p>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:w-auto sm:grid-cols-4">
            {quick.map(([to, label, icon]) => <Link key={to} to={to} className="mc-quick">{icon}<span className="truncate">{label}</span></Link>)}
          </div>
        </div>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[1.1fr_1fr]">
        <div className="card">
          <h2 className="stamp-text m-0 text-ink-soft">{t('mc.attn')} · {attn.length}</h2>
          {attn.length === 0 ? (
            <p className="mb-0 mt-3 flex items-center gap-2 text-sm text-success"><span aria-hidden>✓</span>{t('mc.allClear')}</p>
          ) : (
            <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
              {attn.map((a) => (
                <li key={a.id} className="mc-alert flex flex-wrap items-center gap-3 py-2.5 pl-3 pr-3" data-tone={a.tone}>
                  <span className="mc-pulse shrink-0" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <div className="text-[14.5px] font-semibold text-ink">{a.title}</div>
                    <div className="text-[12.5px] leading-snug text-[var(--a-muted)]">{a.detail}</div>
                  </div>
                  {a.to.startsWith('#')
                    ? <a href={a.to} className="btn-ghost btn-sm shrink-0">{a.fix}</a>
                    : <Link to={a.to} className="btn-ghost btn-sm shrink-0">{a.fix}</Link>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-2">
          {kpis.map((k) => (
            <div key={k.l} className="card !px-3.5 !py-3">
              <div className="fig text-[clamp(22px,3.4vw,28px)] leading-none">{k.v}</div>
              <div className="stamp-text mt-1.5 text-[10.5px] text-ink-soft">{k.l}</div>
              {k.s && <div className="mt-0.5 text-[11.5px] text-[var(--a-muted)]">{k.s}</div>}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
