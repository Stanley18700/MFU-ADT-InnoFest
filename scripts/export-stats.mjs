/**
 * Read-only statistics export for the event planners (written 21 Sep 2026).
 *
 *   node scripts/export-stats.mjs                 # writes ./exports/stats-<today>/*.csv
 *   node scripts/export-stats.mjs --out=some/dir  # somewhere else
 *
 * Needs application-default credentials and `functions/lib` built, like the other scripts here:
 *   npm --prefix functions run build && node scripts/export-stats.mjs
 *
 * WHY THIS EXISTS
 *   /admin already exports 11 CSVs and those are correct — this script exists for the three
 *   things the screens cannot give the planners:
 *
 *   1. The institutions and MFU-school panels are cut to the top 10 (`.slice(0, 10)` in
 *      useDashboardModel), so the dashboard CSV silently drops the long tail. A report wants
 *      every institution. `institutions-full.csv` has all of them.
 *   2. There is no single headline sheet. The numbers live across participation.csv, the tiles
 *      and the day selector. `event-summary.csv` puts them on one page, per day included.
 *   3. `booth-ratings.csv` carries the star distribution but not what people actually wrote.
 *      `booth-rating-comments.csv` has the text.
 *
 *   It also re-emits the everyday exports (leaderboard, countries, timeline, cross-school,
 *   stock, survey) so the planners get one consistent folder with one timestamp on it rather
 *   than a dozen separate clicks taken minutes apart.
 *
 * IT WRITES NOTHING TO FIRESTORE. Every call below is a read.
 *
 * ANONYMITY — preserved deliberately, do not "improve" this:
 *   `boothRatings` and `surveyResponses` carry no visitor id by design (§4.1, and the
 *   BoothRatedDoc comment in shared/model.ts), so no row here can be traced to a person. The
 *   ethnic-group file keeps the dashboard's suppression: folded under 5, withheld entirely
 *   below 20 consenting visitors. Keep it that way.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const here = dirname(fileURLToPath(import.meta.url))
const projectId = process.env.GCLOUD_PROJECT
  ?? (() => { try { return JSON.parse(readFileSync(resolve(here, '..', '.firebaserc'), 'utf8')).projects.default } catch { return 'mfu-passport' } })()
process.env.GCLOUD_PROJECT ??= projectId

const { db } = await import('../functions/lib/lib.js')
const { EVENT_SURVEY_ID } = await import('../functions/lib/shared/model.js')

const TZ = 'Asia/Bangkok'
const today = new Date().toLocaleDateString('en-CA', { timeZone: TZ })
const outDir = resolve(here, '..', (args.find((a) => a.startsWith('--out='))?.slice(6)) ?? `exports/stats-${today}`)

/* ---------- CSV, same rules as src/lib/csv.ts (RFC 4180, CRLF, BOM for Excel/Thai) ---------- */
const cell = (v) => {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'string' ? v : String(v)
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
const columnsOf = (rows) => { const c = []; for (const r of rows) for (const k of Object.keys(r)) if (!c.includes(k)) c.push(k); return c }
function write(name, rows, columns = columnsOf(rows)) {
  const body = [columns.map(cell).join(','), ...rows.map((r) => columns.map((c) => cell(r[c])).join(','))].join('\r\n') + '\r\n'
  writeFileSync(resolve(outDir, name), '﻿' + body, 'utf8')
  console.log(`  ${name.padEnd(32)} ${String(rows.length).padStart(5)} rows`)
}

const all = async (path) => (await db.collection(path).get()).docs.map((d) => ({ id: d.id, ...d.data() }))
const one = async (path) => { const s = await db.doc(path).get(); return s.exists ? s.data() : null }
const when = (t) => { try { const d = t?.toDate ? t.toDate() : t ? new Date(t) : null; return d ? d.toLocaleString('sv-SE', { timeZone: TZ }).replace(' ', ' ') : '' } catch { return '' } }
const flat = (a) => Array.isArray(a) ? a.join('; ') : (a === undefined || a === null ? '' : a)

console.log(`Reading project ${projectId} …`)
const [event] = (await db.collection('events').where('status', '==', 'live').limit(1).get()).docs.map((d) => ({ id: d.id, ...d.data() }))
const booths = (await db.collection('booths').get()).docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
const tiers = await all('prizeTiers')
const evMeta = await one('stats/event')
const evShards = await all('stats/event/shards')
const demoShards = await all('stats/demographics/shards')
const boothStats = await all('stats/booths/items')
const ratingStats = await all('stats/ratings/items')
const ratings = await all('boothRatings')
const buckets = await all('stats/buckets/items')
const survey = await one(`surveys/${EVENT_SURVEY_ID}`)
const responses = (await db.collection('surveyResponses').where('boothId', '==', EVENT_SURVEY_ID).get()).docs.map((d) => ({ id: d.id, ...d.data() }))

/* ---------- shard sums, identical to useEventStats / useDemographics ---------- */
const ev = { visitors: 0, stamps: 0, points: 0, redeemed: 0, visitorsWithStamps: 0, tierReached: 0, byVisitorType: {}, byDay: {} }
for (const s of evShards) {
  for (const k of ['visitors', 'stamps', 'points', 'redeemed', 'visitorsWithStamps', 'tierReached']) ev[k] += s[k] ?? 0
  for (const [k, v] of Object.entries(s.byVisitorType ?? {})) ev.byVisitorType[k] = (ev.byVisitorType[k] ?? 0) + v
  for (const [d, v] of Object.entries(s.byDay ?? {})) {
    ev.byDay[d] ??= { visitors: 0, stamps: 0 }
    ev.byDay[d].visitors += v.visitors ?? 0; ev.byDay[d].stamps += v.stamps ?? 0
  }
}
const demo = { byCountry: {}, byInstitution: {}, bySchool: {}, byEthnicGroup: {}, ethnicResponses: 0, ethnicDeclines: 0, crossSchool: {} }
for (const s of demoShards) {
  demo.ethnicResponses += s.ethnicResponses ?? 0; demo.ethnicDeclines += s.ethnicDeclines ?? 0
  for (const k of ['byCountry', 'byInstitution', 'bySchool', 'byEthnicGroup']) for (const [key, v] of Object.entries(s[k] ?? {})) demo[k][key] = (demo[k][key] ?? 0) + v
  for (const [school, row] of Object.entries(s.crossSchool ?? {})) {
    demo.crossSchool[school] ??= {}
    for (const [b, n] of Object.entries(row)) demo.crossSchool[school][b] = (demo.crossSchool[school][b] ?? 0) + n
  }
}

mkdirSync(outDir, { recursive: true })
console.log(`Writing ${outDir}\n`)

/* ---------- 1. the headline sheet ---------- */
const days = Object.keys(ev.byDay).sort()
const thai = demo.byCountry.TH ?? 0
const pct = (n, d) => d ? `${Math.round((n / d) * 1000) / 10}%` : ''
const summary = [
  { section: 'Event', metric: 'Event name', value: event?.nameEn ?? '', note: event?.nameTh ?? '' },
  { section: 'Event', metric: 'Event id', value: event?.id ?? '', note: '' },
  { section: 'Event', metric: 'Exported at', value: new Date().toLocaleString('sv-SE', { timeZone: TZ }), note: `timezone ${TZ}` },
  { section: 'Totals', metric: 'Visitors registered', value: ev.visitors, note: '' },
  { section: 'Totals', metric: 'Stamps collected', value: ev.stamps, note: '' },
  { section: 'Totals', metric: 'Points awarded', value: ev.points, note: '' },
  { section: 'Totals', metric: 'Prizes redeemed', value: ev.redeemed, note: 'includes gifts handed out by hand — see scripts/reconcile-gifts.mjs' },
  { section: 'Totals', metric: 'Stamps per visitor', value: ev.visitors ? Math.round((ev.stamps / ev.visitors) * 100) / 100 : '', note: '' },
  { section: 'Totals', metric: 'Booths (active / total)', value: `${booths.filter((b) => b.active).length} / ${booths.length}`, note: '' },
  { section: 'Funnel', metric: 'Registered', value: ev.visitors, note: '100%' },
  { section: 'Funnel', metric: '1+ stamp', value: ev.visitorsWithStamps, note: pct(ev.visitorsWithStamps, ev.visitors) },
  { section: 'Funnel', metric: 'Tier reached', value: ev.tierReached, note: pct(ev.tierReached, ev.visitors) },
  { section: 'Funnel', metric: 'Redeemed', value: ev.redeemed, note: pct(ev.redeemed, ev.visitors) },
  { section: 'Origin', metric: 'Thai', value: thai, note: pct(thai, ev.visitors) },
  { section: 'Origin', metric: 'International', value: ev.visitors - thai, note: pct(ev.visitors - thai, ev.visitors) },
  { section: 'Origin', metric: 'Countries represented', value: Object.keys(demo.byCountry).length, note: '' },
  ...['student', 'staff', 'alumni', 'guest'].map((k) => ({ section: 'Visitor type', metric: k, value: ev.byVisitorType[k] ?? 0, note: pct(ev.byVisitorType[k] ?? 0, ev.visitors) })),
  ...days.flatMap((d) => [
    { section: 'By day', metric: `${d} visitors`, value: ev.byDay[d].visitors, note: '' },
    { section: 'By day', metric: `${d} stamps`, value: ev.byDay[d].stamps, note: '' },
  ]),
  ...tiers.filter((t) => t.active).map((t) => ({ section: 'Prize stock', metric: t.name, value: `${t.stockRemaining} left of ${t.stockTotal}`, note: '' })),
  { section: 'Ratings', metric: 'Ratings given', value: ratingStats.reduce((n, s) => n + (s.count ?? 0), 0), note: '' },
  { section: 'Ratings', metric: 'Average stars', value: (() => { const c = ratingStats.reduce((n, s) => n + (s.count ?? 0), 0); return c ? Math.round((ratingStats.reduce((n, s) => n + (s.sum ?? 0), 0) / c) * 100) / 100 : '' })(), note: 'out of 5' },
  { section: 'Ratings', metric: 'Written comments', value: ratings.filter((r) => r.comment).length, note: '' },
  { section: 'Survey', metric: 'Responses', value: responses.length, note: pct(responses.length, ev.visitors) + ' of registered visitors' },
]
write('event-summary.csv', summary, ['section', 'metric', 'value', 'note'])

/* ---------- 2. booths ---------- */
const statOf = (id) => boothStats.find((s) => s.id === id)
write('booth-leaderboard.csv', booths.filter((b) => b.active).map((b) => {
  const s = statOf(b.id)
  return { booth: b.nameEn, boothId: b.id, zone: b.zone ?? '', points: b.points ?? '', stamps: s?.stamps ?? 0, ...Object.fromEntries(days.map((d) => [d, s?.byDay?.[d] ?? 0])) }
}).sort((a, b) => b.stamps - a.stamps))

/* ---------- 3. the full institution list, no top-10 cut ---------- */
write('institutions-full.csv', [
  ...Object.entries(demo.byInstitution).sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ kind: 'institution', name, visitors: n, percentOfVisitors: pct(n, ev.visitors) })),
  ...Object.entries(demo.bySchool).sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ kind: 'mfu-school', name, visitors: n, percentOfVisitors: pct(n, ev.visitors) })),
])

write('countries.csv', Object.entries(demo.byCountry).sort((a, b) => b[1] - a[1]).map(([code, n]) => ({ code, visitors: n, percentOfVisitors: pct(n, ev.visitors) })))

const crossCols = booths.filter((b) => b.active).map((b) => b.nameEn)
write('cross-school.csv', Object.entries(demo.crossSchool).sort().map(([school, row]) => {
  const byName = {}
  for (const [bid, n] of Object.entries(row)) byName[booths.find((b) => b.id === bid)?.nameEn ?? bid] = n
  return { school, ...Object.fromEntries(crossCols.map((c) => [c, byName[c] ?? 0])), total: Object.values(row).reduce((s, n) => s + n, 0) }
}))

write('prize-stock.csv', tiers.map((t) => ({ tier: t.name, active: t.active ? 'yes' : 'no', remaining: t.stockRemaining, total: t.stockTotal, percentRemaining: t.stockTotal ? Math.round((t.stockRemaining / t.stockTotal) * 100) : '' })))

write('timeline.csv', buckets
  .filter((b) => b.startsAt)
  .sort((a, b) => a.startsAt.toMillis() - b.startsAt.toMillis())
  .map((b) => ({ day: b.day, time: new Date(b.startsAt.toMillis()).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: TZ }), stamps: b.total })))

/* ---------- 4. ratings ---------- */
write('booth-ratings.csv', booths.map((b) => {
  const s = ratingStats.find((x) => x.id === b.id)
  return { booth: b.nameEn, boothId: b.id, responses: s?.count ?? 0, average: s?.count ? (s.sum / s.count).toFixed(2) : '', '1': s?.dist?.['1'] ?? 0, '2': s?.dist?.['2'] ?? 0, '3': s?.dist?.['3'] ?? 0, '4': s?.dist?.['4'] ?? 0, '5': s?.dist?.['5'] ?? 0, comments: s?.comments ?? 0 }
}).sort((a, b) => b.responses - a.responses))

write('booth-rating-comments.csv', ratings.filter((r) => r.comment)
  .sort((a, b) => (a.ratedAt?.toMillis?.() ?? 0) - (b.ratedAt?.toMillis?.() ?? 0))
  .map((r) => ({ when: when(r.ratedAt), day: r.day ?? '', booth: booths.find((b) => b.id === r.boothId)?.nameEn ?? r.boothId, stars: r.stars, comment: r.comment })))

/* ---------- 5. survey, shaped like a Google Forms export ---------- */
const questions = survey?.questions ?? []
const header = (q) => { const t = (q.title || '').trim() || q.id; return questions.some((o) => o.id !== q.id && (o.title || '').trim() === t) ? `${t} [${q.id}]` : t }
write('survey-responses.csv',
  responses.slice().sort((a, b) => (a.submittedAt?.toMillis?.() ?? 0) - (b.submittedAt?.toMillis?.() ?? 0))
    .map((r) => { const row = { Timestamp: when(r.submittedAt), 'Survey version': r.surveyVersion ?? 1 }; for (const q of questions) row[header(q)] = flat(r.answers?.[q.id]); return row }),
  ['Timestamp', ...questions.map(header), 'Survey version'])

const qsum = []
for (const q of questions) {
  const answers = responses.map((r) => r.answers?.[q.id]).filter((v) => v !== undefined && v !== '')
  if (q.kind === 'scale' || q.kind === 'rating') {
    const nums = answers.filter((v) => typeof v === 'number')
    const avg = nums.length ? nums.reduce((s, n) => s + n, 0) / nums.length : null
    qsum.push({ question: q.title, kind: q.kind, option: '(average)', count: nums.length, percentOfAnswers: '', average: avg == null ? '' : avg.toFixed(2) })
    const seen = [...new Set(nums)].sort((a, b) => a - b)
    for (const v of seen) { const n = nums.filter((x) => x === v).length; qsum.push({ question: q.title, kind: q.kind, option: v, count: n, percentOfAnswers: pct(n, nums.length), average: '' }) }
  } else if (q.options?.length) {
    const picks = answers.flatMap((v) => Array.isArray(v) ? v : [v]).filter((v) => typeof v === 'string')
    for (const o of q.options) { const n = picks.filter((p) => p === o).length; qsum.push({ question: q.title, kind: q.kind, option: o, count: n, percentOfAnswers: pct(n, picks.length), average: '' }) }
  } else {
    qsum.push({ question: q.title, kind: q.kind, option: '(free text)', count: answers.length, percentOfAnswers: '', average: '' })
  }
}
write('survey-question-summary.csv', qsum, ['question', 'kind', 'option', 'count', 'percentOfAnswers', 'average'])

/* ---------- 6. ethnic groups, suppression preserved ---------- */
if (demo.ethnicResponses >= 20) {
  const folded = {}
  for (const [k, v] of Object.entries(demo.byEthnicGroup)) { const key = v < 5 ? 'Other' : k; folded[key] = (folded[key] ?? 0) + v }
  write('ethnic-groups-aggregate.csv', Object.entries(folded).sort((a, b) => b[1] - a[1]).map(([group, n]) => ({ group, visitors: n })))
} else {
  console.log(`  ethnic-groups-aggregate.csv     withheld — ${demo.ethnicResponses} consenting visitors, needs 20`)
}

console.log(`\nDone. ${outDir}`)
