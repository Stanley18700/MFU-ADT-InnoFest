import { useMemo, useState } from 'react'
import { collection, limit, orderBy, query } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useBooths, useCollection } from '../../lib/data'
import { CsvButton, DataError, fmt } from '../../components/ui'
import { Select } from '../../components/Select'
import { ts } from '../../lib/eventText'
import { useLocale } from '../../lib/locale'
import { RATING_CRITERIA, RATING_MIN_VOTES, criterionAverage, overallAverage, ratingAverage, type BoothRatingDoc, type BoothRatingStatsDoc, type RatingCriterion } from '../../../shared/model'

/** Newest first, and capped: a comment feed is for reading, and nobody reads past a few hundred. */
const COMMENT_PAGE = 300

/**
 * What the hall thought of each booth.
 *
 * Two reads, deliberately separate. The table comes from `stats/ratings/items` — one small
 * pre-aggregated document per booth, the same shape as every other counter in the app, so this
 * page costs 76 document reads however many thousand ratings are behind them. The comment feed
 * reads `boothRatings` itself, newest first, because the text is the one thing an aggregate
 * cannot hold.
 *
 * Neither collection carries a visitor id (§10). A comment here cannot be traced to a person,
 * and that is a property of the data, not of this page.
 */
export default function Ratings() {
  const { t } = useLocale()
  const booths = useBooths(true)
  const stats = useCollection<BoothRatingStatsDoc>(collection(db, 'stats/ratings/items'), [], 'the rating counters')
  const comments = useCollection<BoothRatingDoc>(
    query(collection(db, 'boothRatings'), orderBy('ratedAt', 'desc'), limit(COMMENT_PAGE)),
    [], 'the comments',
  )

  const [boothFilter, setBoothFilter] = useState('')
  const [sort, setSort] = useState<'overall' | RatingCriterion | 'worst' | 'most' | 'name'>('overall')
  const cname = (k: RatingCriterion) => t(`admin.ratings.c.${k}` as 'admin.ratings.c.design')

  const names = useMemo(() => new Map(booths.map((b) => [b.id, b.nameEn])), [booths])
  const statFor = useMemo(() => new Map(stats.data.map((s) => [s.id, s])), [stats.data])

  /**
   * Every active booth appears, rated or not: "nobody has rated it" is itself worth seeing.
   * Every rated booth is ranked, thin or not (rank = 1 + booths strictly above, so ties share).
   */
  const rows = useMemo(() => {
    const base = booths.map((b) => {
      const s = statFor.get(b.id)
      const count = s?.count ?? 0
      const crit = Object.fromEntries(RATING_CRITERIA.map((k) => [k, criterionAverage(s, k)])) as Record<RatingCriterion, number | null>
      return {
        boothId: b.id,
        name: b.nameEn,
        count,
        thin: count < RATING_MIN_VOTES,
        comments: s?.comments ?? 0,
        // Ratings left before the five criteria have no `crit`; fall back to the plain average.
        avg: overallAverage(s) ?? ratingAverage(s),
        crit,
        dist: s?.dist ?? {},
      }
    })
    const rankOf = (get: (r: typeof base[number]) => number | null) => {
      const vals = base.map(get).filter((v): v is number => v != null)
      return (r: typeof base[number]) => { const v = get(r); return v == null ? null : 1 + vals.filter((x) => x > v).length }
    }
    const overallRank = rankOf((r) => r.avg)
    const critRank = Object.fromEntries(RATING_CRITERIA.map((k) => [k, rankOf((r) => r.crit[k])])) as Record<RatingCriterion, ReturnType<typeof rankOf>>
    const out = base.map((r) => ({
      ...r,
      rank: overallRank(r),
      critRank: Object.fromEntries(RATING_CRITERIA.map((k) => [k, critRank[k](r)])) as Record<RatingCriterion, number | null>,
    }))
    const byName = (a: typeof out[number], b: typeof out[number]) => a.name.localeCompare(b.name)
    // Unrated booths sink in every score sort — an average of nothing is not a bad average.
    if (sort === 'overall') out.sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1) || byName(a, b))
    else if ((RATING_CRITERIA as readonly string[]).includes(sort)) {
      const k = sort as RatingCriterion
      out.sort((a, b) => (b.crit[k] ?? -1) - (a.crit[k] ?? -1) || byName(a, b))
    }
    if (sort === 'worst') out.sort((a, b) => (a.avg ?? 99) - (b.avg ?? 99) || byName(a, b))
    if (sort === 'most') out.sort((a, b) => b.count - a.count || byName(a, b))
    if (sort === 'name') out.sort(byName)
    return out
  }, [booths, statFor, sort])

  const top5 = useMemo(() => RATING_CRITERIA.map((k) => ({
    k,
    list: rows.filter((r) => r.crit[k] != null).sort((a, b) => (b.crit[k]! - a.crit[k]!) || a.name.localeCompare(b.name)).slice(0, 5),
  })), [rows])

  const total = rows.reduce((n, r) => n + r.count, 0)
  const overall = total ? rows.reduce((n, r) => n + (r.avg ?? 0) * r.count, 0) / total : null

  const feed = boothFilter ? comments.data.filter((c) => c.boothId === boothFilter) : comments.data
  const withText = feed.filter((c) => c.comment)

  const f2 = (v: number | null) => (v == null ? '' : v.toFixed(2))
  const csvRows = rows.map((r, i) => ({
    no: i + 1,
    booth: r.name, boothId: r.boothId,
    votes: r.count,
    ...Object.fromEntries(RATING_CRITERIA.flatMap((k) => [[`${k}_avg`, f2(r.crit[k])], [`${k}_rank`, r.critRank[k] ?? '']])),
    overall_avg: f2(r.avg),
    overall_rank: r.rank ?? '',
    few_votes: r.thin ? 'yes' : '',
    '1': r.dist['1'] ?? 0, '2': r.dist['2'] ?? 0, '3': r.dist['3'] ?? 0, '4': r.dist['4'] ?? 0, '5': r.dist['5'] ?? 0,
    comments: r.comments,
  }))

  return (
    <div className="page-in">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{t('admin.ratings.title')}</h1>
          <p className="mt-1 text-sm text-ink-soft">{t('admin.ratings.lead')}</p>
        </div>
        <CsvButton rows={csvRows} name="booth-ratings" />
      </header>

      <DataError error={stats.error} what="the rating counters" />

      <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Tile label={t('admin.ratings.responses')} value={fmt(total)} />
        <Tile label={t('admin.ratings.average')} value={overall == null ? '–' : overall.toFixed(2)} />
        <Tile label={t('admin.ratings.rated')} value={`${fmt(rows.filter((r) => r.count > 0).length)} / ${fmt(rows.length)}`} />
      </section>

      <section className="mt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{t('admin.ratings.byBooth')}</h2>
          <Select
            className="w-64"
            ariaLabel={t('admin.ratings.sort')}
            value={sort}
            onChange={(v) => setSort(v as typeof sort)}
            options={[
              { value: 'overall', label: t('admin.ratings.sort.overall') },
              ...RATING_CRITERIA.map((k) => ({ value: k, label: t('admin.ratings.sort.crit', { c: cname(k) }) })),
              { value: 'worst', label: t('admin.ratings.sort.worst') },
              { value: 'most', label: t('admin.ratings.sort.most') },
              { value: 'name', label: t('admin.ratings.sort.name') },
            ]}
          />
        </div>

        {/* The same wrapper the audit log's table has. Bare on the page the rows read as text
            floating on the sky: the rules between them are the only thing separating a booth's
            name from the artwork behind it. */}
        <div className="card mt-3 overflow-x-auto">
          <table className="w-full min-w-[60rem] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-ink-soft">
              <tr>
                <th className="w-8 py-2 pr-2 text-right">#</th>
                <th className="py-2 pr-3">{t('admin.ratings.booth')}</th>
                <th className="py-2 pr-3 text-right">{t('admin.ratings.n')}</th>
                {RATING_CRITERIA.map((k) => (
                  <th key={k} className={`py-2 pr-3 text-right ${sort === k ? 'text-ink' : ''}`} title={cname(k)}>{cname(k)}</th>
                ))}
                <th className={`py-2 pr-3 text-right ${sort === 'overall' ? 'text-ink' : ''}`}>{t('admin.ratings.overall')}</th>
                <th className="py-2">{t('admin.ratings.spread')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.boothId} className={`border-t rule ${r.thin ? 'opacity-50' : ''}`}>
                  <td className="fig w-8 py-2 pr-2 text-right text-ink-soft">{i + 1}</td>
                  <td className="py-2 pr-3">
                    {r.name}
                    {r.thin && r.count > 0 && <span className="ml-2 text-xs text-ink-soft">({t('admin.ratings.thin')})</span>}
                  </td>
                  <td className="fig py-2 pr-3 text-right text-ink-soft">{fmt(r.count)}</td>
                  {RATING_CRITERIA.map((k) => <AvgRank key={k} avg={r.crit[k]} rank={r.critRank[k]} />)}
                  <AvgRank avg={r.avg} rank={r.rank} strong />
                  <td className="py-2"><Spread dist={r.dist} count={r.count} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-soft">{t('admin.ratings.thinNote', { n: RATING_MIN_VOTES })}</p>
      </section>

      <section className="mt-8">
        <h2 className="font-semibold">{t('admin.ratings.top5')}</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {top5.map(({ k, list }) => (
            <div key={k} className="card p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{cname(k)}</div>
              {list.length === 0
                ? <p className="mt-2 text-sm text-ink-soft">–</p>
                : (
                  <ol className="mt-2 space-y-1 text-sm">
                    {list.map((r, i) => (
                      <li key={r.boothId} className={`flex justify-between gap-2 ${r.thin ? 'opacity-50' : ''}`}>
                        <span className="min-w-0 truncate" title={r.name}><span className="fig text-ink-soft">{i + 1}.</span> {r.name}</span>
                        <span className="fig shrink-0">{r.crit[k]!.toFixed(2)}</span>
                      </li>
                    ))}
                  </ol>
                )}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">{t('admin.ratings.comments')}</h2>
          <Select
            className="w-64"
            ariaLabel={t('admin.ratings.filterBooth')}
            value={boothFilter}
            onChange={setBoothFilter}
            options={[{ value: '', label: t('admin.ratings.allBooths') }, ...booths.map((b) => ({ value: b.id, label: b.nameEn }))]}
          />
        </div>
        <DataError error={comments.error} what="the comments" />
        {withText.length === 0
          ? <p className="mt-3 text-sm text-ink-soft">{t('admin.ratings.noComments')}</p>
          : (
            <ul className="mt-3 space-y-2">
              {withText.map((c) => (
                <li key={c.id} className="card p-4">
                  <div className="flex items-baseline justify-between gap-3 text-xs text-ink-soft">
                    <span>{names.get(c.boothId) ?? c.boothId}</span>
                    <span>{ts(c.ratedAt)}</span>
                  </div>
                  {c.scores
                    ? (
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                        {RATING_CRITERIA.map((k) => (
                          <span key={k} title={cname(k)}>{cname(k)} <span className="fig text-foil">{c.scores![k]}★</span></span>
                        ))}
                      </div>
                    )
                    : (
                      <div className="mt-1 text-foil" aria-label={`${c.stars} out of 5`}>
                        {[1, 2, 3, 4, 5].map((n) => <span key={n} aria-hidden className={n <= c.stars ? '' : 'opacity-20'}>★</span>)}
                      </div>
                    )}
                  <p className="mt-1 whitespace-pre-wrap text-sm">{c.comment}</p>
                </li>
              ))}
            </ul>
          )}
        {comments.data.length >= COMMENT_PAGE && (
          <p className="mt-3 text-xs text-ink-soft">{t('admin.ratings.capped', { n: fmt(COMMENT_PAGE) })}</p>
        )}
      </section>
    </div>
  )
}

function AvgRank({ avg, rank, strong }: { avg: number | null; rank: number | null; strong?: boolean }) {
  return (
    <td className={`fig py-2 pr-3 text-right ${strong ? 'font-semibold' : ''}`}>
      {avg == null ? '–' : avg.toFixed(2)}
      {rank != null && <span className="ml-1 text-xs font-normal text-ink-soft">#{rank}</span>}
    </td>
  )
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wide text-ink-soft">{label}</div>
      <div className="fig mt-1 text-2xl">{value}</div>
    </div>
  )
}

/**
 * Five stacked bars, one per score. An average of 3 hides the difference between a booth
 * everyone found middling and a booth half the hall loved and half walked away from, and that
 * difference is the only actionable thing on this page.
 */
function Spread({ dist, count }: { dist: Record<string, number>; count: number }) {
  if (!count) return <span className="text-xs text-ink-soft">–</span>
  return (
    <div className="flex h-4 w-full min-w-[8rem] overflow-hidden rounded-full bg-ink/5">
      {[1, 2, 3, 4, 5].map((n) => {
        const v = dist[String(n)] ?? 0
        if (!v) return null
        // Red at one star through gold at five: the eye reads the shape before the numbers.
        const color = ['#C2410C', '#EA8C3A', '#D9B44A', '#8FBF6A', '#4E9A51'][n - 1]
        return (
          <div
            key={n}
            title={`${n}★ — ${v}`}
            style={{ width: `${(v / count) * 100}%`, background: color }}
          />
        )
      })}
    </div>
  )
}
