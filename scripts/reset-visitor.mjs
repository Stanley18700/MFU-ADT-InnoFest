/**
 * Reset ONE visitor's passport to zero, keeping the account and its sign-in — for a test account
 * that needs to scan and rate again from scratch.
 *
 *   GCLOUD_PROJECT=adt-innofest node scripts/reset-visitor.mjs --passport=ADT-IF-0014            # dry run
 *   GCLOUD_PROJECT=adt-innofest node scripts/reset-visitor.mjs --passport=ADT-IF-0014 --commit
 *   (or --uid=<uid>; --emulator for the local emulator)
 *
 * Needs application-default credentials and `functions/lib` built, like cleanup-test-data.mjs.
 *
 * It undoes exactly what onScanCreate (functions/src/triggers.ts) added for each of their scans,
 * so every total in the app stays consistent:
 *
 *   deleted   scans/{uid}_{booth}, countedScans/{same}   (both, or a re-scan would award nothing)
 *             tierUnlocks/{uid}_*                        (refused if any was already collected)
 *             boothRated/{uid}_*                         so they can rate again. The ratings they left
 *                                                        are anonymous by design and cannot be found,
 *                                                        so they stay in the averages.
 *   decrement stats/event/shards        stamps, points, byDay.<day>.stamps, visitorsWithStamps, tierReached
 *             stats/demographics/shards crossSchool.<school>.<booth>
 *             stats/booths/items/<b>    stamps, invitedCame, byVisitorType, byDay, byHour
 *             stats/buckets/items/<5m>  total, perBooth.<booth>
 *   reset     users/{uid}               points 0, stampCount 0, stampedBoothIds [], daysAttended []
 *   written   auditLog                  one 'resetVisitor' row
 *
 * Untouched: the account, its role and sign-in, survey answers, and the visitor counters (they
 * are still a registered visitor). A counter that is already lower than what would be taken off
 * (because something reset it since) is skipped with a warning rather than driven negative.
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const COMMIT = args.includes('--commit')
const arg = (k) => args.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3)
if (args.includes('--emulator')) {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080'
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099'
}
const here = dirname(fileURLToPath(import.meta.url))
process.env.GCLOUD_PROJECT ??= (() => { try { return JSON.parse(readFileSync(resolve(here, '..', '.firebaserc'), 'utf8')).projects.default } catch { return 'mfu-passport' } })()

const { db, FieldValue, Timestamp, bucketRef } = await import('../functions/lib/lib.js')
const { STATS_SHARDS, hourOf } = await import('../functions/lib/shared/model.js')
/** Same as triggers.ts `key()`: Firestore field names cannot hold '.', '/', etc. */
const key = (s) => s.replace(/[.~*/[\]]/g, '_').slice(0, 60)

/** Nested map from a path: ['a','b','c'], v -> { a: { b: { c: v } } }. Never dotted keys (see triggers.ts). */
const nest = (path, v) => path.reduceRight((acc, k) => ({ [k]: acc }), v)
const get = (o, path) => path.reduce((x, k) => (x == null ? undefined : x[k]), o)

async function main() {
  const uidArg = arg('uid'), passport = arg('passport')
  if (!uidArg && !passport) throw new Error('Pass --passport=ADT-IF-0014 or --uid=<uid>')
  const userSnap = uidArg
    ? await db.doc(`users/${uidArg}`).get()
    : (await db.collection('users').where('passportNo', '==', passport).limit(2).get()).docs[0]
  if (!userSnap?.exists) throw new Error('No such user')
  const uid = userSnap.id
  const u = userSnap.data()
  if (u.role !== 'visitor') throw new Error(`users/${uid} is a ${u.role}, not a visitor — refusing`)

  console.log(`${COMMIT ? 'RESETTING' : 'DRY RUN'} — project ${process.env.GCLOUD_PROJECT}${process.env.FIRESTORE_EMULATOR_HOST ? ' (emulator)' : ' (LIVE)'}`)
  console.log(`visitor ${u.passportNo} · ${u.displayName} · ${uid}`)
  console.log(`  now: ${u.points ?? 0} points, ${u.stampCount ?? 0} stamps, booths [${(u.stampedBoothIds ?? []).join(', ')}], days [${(u.daysAttended ?? []).join(', ')}]\n`)

  const [scans, unlocks, tiers] = await Promise.all([
    db.collection('scans').where('visitorId', '==', uid).get(),
    db.collection('tierUnlocks').where('visitorId', '==', uid).get(),
    db.collection('prizeTiers').where('active', '==', true).get(),
  ])
  // A marker can only exist for a booth they scanned (rateBooth requires the scan), and shares its id.
  const ratedDocs = scans.empty ? [] : (await db.getAll(...scans.docs.map((s) => db.doc(`boothRated/${s.id}`)))).filter((d) => d.exists)
  const rated = { docs: ratedDocs, size: ratedDocs.length }
  const redeemed = unlocks.docs.filter((d) => d.data().redeemedAt)
  if (redeemed.length) throw new Error(`Already collected: ${redeemed.map((d) => d.data().tierId).join(', ')} — undoing a hand-over needs the prize desk's void, not this script`)

  // ---- what each counter loses, aggregated per document ----
  const dec = new Map() // path -> { ref, fields: [[fieldPath[], n]] }
  const take = (ref, path, n) => {
    if (!n) return
    const e = dec.get(ref.path) ?? { ref, fields: [] }
    const f = e.fields.find(([p]) => p.join('\u0000') === path.join('\u0000'))
    if (f) f[1] += n; else e.fields.push([path, n])
    dec.set(ref.path, e)
  }
  const shard = db.doc('stats/event/shards/0')
  const demo = db.doc('stats/demographics/shards/0')
  let points = 0
  console.log(`scans (${scans.size}) — each deleted with its countedScans marker:`)
  for (const s of scans.docs) {
    const x = s.data()
    const at = x.scannedAt instanceof Timestamp ? x.scannedAt.toDate() : null
    const counted = (await db.doc(`countedScans/${s.id}`).get()).exists
    console.log(`  ${s.id.padEnd(40)} +${x.pointsAwarded} pts  ${x.day}  ${at?.toISOString() ?? '?'}${counted ? '' : '  (never counted — no counters to undo)'}`)
    if (!counted || !at) continue
    points += x.pointsAwarded
    const inst = x.institution || 'Unknown'
    const school = x.institution === 'MFU' ? x.school || 'Unknown school' : null
    take(shard, ['stamps'], 1)
    take(shard, ['points'], x.pointsAwarded)
    take(shard, ['byDay', x.day, 'stamps'], 1)
    take(demo, ['crossSchool', key(school ?? inst), x.boothId], 1)
    const b = db.doc(`stats/booths/items/${x.boothId}`)
    take(b, ['stamps'], 1)
    if (u.refBooth === x.boothId) take(b, ['invitedCame'], 1)
    take(b, ['byVisitorType', x.visitorType ?? 'guest'], 1)
    take(b, ['byDay', x.day], 1)
    take(b, ['byHour', `${x.day}T${hourOf(at)}`], 1)
    const { ref: bucket } = bucketRef(x.eventId, at)
    take(bucket, ['total'], 1)
    take(bucket, ['perBooth', x.boothId], 1)
  }
  if ((u.stampCount ?? 0) > 0) take(shard, ['visitorsWithStamps'], 1)
  const lowest = Math.min(...tiers.docs.map((t) => t.data().thresholdPoints))
  const lowestIds = new Set(tiers.docs.filter((t) => t.data().thresholdPoints === lowest).map((t) => t.id))
  if (unlocks.docs.some((d) => lowestIds.has(d.data().tierId))) take(shard, ['tierReached'], 1)

  console.log(`\ntierUnlocks (${unlocks.size}): ${unlocks.docs.map((d) => `${d.data().tierId} (not collected)`).join(', ') || 'none'}`)
  console.log(`boothRated markers (${rated.size}): ${rated.docs.map((d) => d.data().boothId).join(', ') || 'none'}`)

  // ---- check against current values; sharded totals are summed across shards ----
  console.log('\ncounters:')
  const sums = {}
  for (const base of ['stats/event/shards', 'stats/demographics/shards']) {
    const docs = (await db.getAll(...Array.from({ length: STATS_SHARDS }, (_, i) => db.doc(`${base}/${i}`)))).map((d) => d.data() ?? {})
    sums[base] = (path) => docs.reduce((n, d) => n + (Number(get(d, path)) || 0), 0)
  }
  const writes = []
  for (const { ref, fields } of dec.values()) {
    const base = ref.path.replace(/\/[^/]+$/, '')
    const cur = sums[base] ? null : (await ref.get()).data() ?? {}
    for (const [path, n] of fields) {
      const have = sums[base] ? sums[base](path) : Number(get(cur, path)) || 0
      const ok = have >= n
      console.log(`  ${ok ? (COMMIT ? '-' : 'would -') : 'SKIP'.padEnd(COMMIT ? 1 : 7)} ${String(n).padStart(3)}  ${ref.path} ${path.join('.')}  (now ${have}${ok ? ` -> ${have - n}` : ', already lower — left alone'})`)
      if (ok) writes.push([ref, nest(path, FieldValue.increment(-n))])
    }
  }
  console.log(`\nusers/${uid}: points ${u.points ?? 0} -> 0 (scans account for ${points}), stampCount ${u.stampCount ?? 0} -> 0, stampedBoothIds -> [], daysAttended -> []`)

  if (!COMMIT) { console.log('\nDry run — nothing was written. Re-run with --commit to apply.'); return }

  const batch = db.batch()
  scans.docs.forEach((s) => { batch.delete(s.ref); batch.delete(db.doc(`countedScans/${s.id}`)) })
  unlocks.docs.forEach((d) => batch.delete(d.ref))
  rated.docs.forEach((d) => batch.delete(d.ref))
  // One merge-set per field; a batch applies several writes to one document in order.
  for (const [ref, data] of writes) batch.set(ref, data, { merge: true })
  batch.update(userSnap.ref, { points: 0, stampCount: 0, stampedBoothIds: [], daysAttended: [], resetAt: FieldValue.serverTimestamp() })
  batch.set(db.collection('auditLog').doc(), {
    actorUid: 'script:reset-visitor', action: 'resetVisitor', targetType: 'user', targetId: uid,
    before: { points: u.points ?? 0, stampCount: u.stampCount ?? 0, scans: scans.size, unlocks: unlocks.size }, after: { points: 0, stampCount: 0 },
    at: FieldValue.serverTimestamp(),
  })
  await batch.commit()
  console.log('\nDone. The passport reads 0 points; the account and sign-in are unchanged.')
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message ?? e); process.exit(1) })
