/**
 * Remove booths that already have stamps — the demo booths — which the admin's Delete can only
 * switch off. Everything the booths left behind is taken back so the totals stay true.
 *
 *   GCLOUD_PROJECT=adt-innofest node scripts/remove-booths.mjs --demo                # dry run, every "(Demo)" booth
 *   GCLOUD_PROJECT=adt-innofest node scripts/remove-booths.mjs --booths=b-t1,b-t2     # dry run, these booths
 *   ... --commit                    apply
 *   ... --revoke-uncollected        also delete prize unlocks a visitor no longer earns (never collected ones)
 *   ... --force-nondemo             allow a booth whose name is not marked "(Demo)"
 *   ... --emulator                  local emulator
 *
 * Needs application-default credentials and `functions/lib` built, like cleanup-test-data.mjs.
 *
 * Per booth:
 *   visitors   each loses exactly the points its scans at these booths awarded (never below 0),
 *              those stamps, those booths, and any day no remaining scan covers
 *   scans      deleted with their countedScans markers
 *   counters   event, demographics and 5-minute counters take those scans back (undo-scans.mjs);
 *              the booth's own counter document is deleted
 *   ratings    boothRatings, boothRated and stats/ratings/items for the booth are deleted
 *   organizers anyone holding the booth goes back to visitor (or no role if they never joined as one);
 *              accounts are kept, admins are not touched
 *   invites    unanswered ones for the booth are revoked
 *   booth      booths, boothSecrets, boothRosters deleted; the event's boothCount goes down
 *   audit      one row per booth and per visitor changed
 *
 * Prize unlocks a visitor no longer earns are LISTED. Collected ones are never touched; uncollected
 * ones are deleted only with --revoke-uncollected. Photos in Storage are left (they are just files).
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

const { db, auth, FieldValue, Timestamp, getActiveEvent } = await import('../functions/lib/lib.js')
const { ledger, takeScan, checkedWrites, SHARD } = await import('./undo-scans.mjs')

const isDemo = (b) => /\(demo\)/i.test(b.nameEn ?? '')

async function main() {
  console.log(`${COMMIT ? 'REMOVING' : 'DRY RUN'} — project ${process.env.GCLOUD_PROJECT}${process.env.FIRESTORE_EMULATOR_HOST ? ' (emulator)' : ' (LIVE)'}\n`)

  // ---- which booths ----
  let booths
  if (args.includes('--demo')) booths = (await db.collection('booths').get()).docs.filter((d) => isDemo(d.data()))
  else if (arg('booths')) booths = (await db.getAll(...arg('booths').split(',').map((id) => db.doc(`booths/${id.trim()}`)))).filter((d) => d.exists)
  else throw new Error('Pass --demo or --booths=id1,id2')
  if (!booths.length) throw new Error('No matching booths')
  const bad = booths.filter((d) => !isDemo(d.data()))
  if (bad.length && !args.includes('--force-nondemo')) throw new Error(`Not marked (Demo): ${bad.map((d) => `${d.id} ${d.data().nameEn}`).join('; ')} — add --force-nondemo if you mean it`)
  const ids = new Set(booths.map((d) => d.id))

  // ---- scans at those booths, and every visitor they touch ----
  const scans = (await Promise.all([...ids].map((id) => db.collection('scans').where('boothId', '==', id).get()))).flatMap((q) => q.docs)
  const counted = new Set((scans.length ? await db.getAll(...scans.map((s) => db.doc(`countedScans/${s.id}`))) : []).filter((d) => d.exists).map((d) => d.id))
  const visitorIds = [...new Set(scans.map((s) => s.data().visitorId))]
  const users = new Map((visitorIds.length ? await db.getAll(...visitorIds.map((v) => db.doc(`users/${v}`))) : []).filter((d) => d.exists).map((d) => [d.id, d]))
  const tiers = (await db.collection('prizeTiers').get()).docs.map((d) => ({ id: d.id, ...d.data() }))
  const lowest = Math.min(...tiers.filter((t) => t.active).map((t) => t.thresholdPoints))

  const ops = [] // [kind, ref, data?]
  const dec = ledger()
  const flags = []

  console.log(`booths (${booths.length}):`)
  for (const b of booths) {
    const x = b.data()
    const n = scans.filter((s) => s.data().boothId === b.id).length
    console.log(`  ${b.id.padEnd(10)} ${String(x.shortName ?? '').padEnd(6)} ${x.nameEn}  — ${x.active ? 'ACTIVE' : 'inactive'}, ${n} scans${x.photoUrl || x.badgeUrl ? ', has photos (left in Storage)' : ''}`)
  }

  // ---- visitors ----
  console.log(`\nvisitors (${visitorIds.length}):`)
  for (const vid of visitorIds) {
    const u = users.get(vid)?.data()
    const mine = scans.filter((s) => s.data().visitorId === vid)
    mine.forEach((s) => ops.push(['delete', s.ref], ['delete', db.doc(`countedScans/${s.id}`)]))
    if (!u) { console.log(`  ${vid}: account gone — ${mine.length} scans deleted, nothing to adjust`); continue }
    const lost = mine.filter((s) => counted.has(s.id))
    for (const s of lost) {
      const x = s.data()
      takeScan(dec.take, x, x.scannedAt instanceof Timestamp ? x.scannedAt.toDate() : new Date(), u, { skipBooth: true })
    }
    const lostPts = lost.reduce((n, s) => n + (s.data().pointsAwarded ?? 0), 0)
    const points = Math.max(0, (u.points ?? 0) - lostPts)
    const stampCount = Math.max(0, (u.stampCount ?? 0) - lost.length)
    const rest = (await db.collection('scans').where('visitorId', '==', vid).get()).docs.filter((s) => !ids.has(s.data().boothId))
    const keepDays = new Set(rest.map((s) => s.data().day))
    const lostDays = new Set(mine.map((s) => s.data().day))
    const daysAttended = (u.daysAttended ?? []).filter((d) => !lostDays.has(d) || keepDays.has(d))
    const stampedBoothIds = (u.stampedBoothIds ?? []).filter((id) => !ids.has(id))
    if ((u.stampCount ?? 0) > 0 && stampCount === 0) dec.take(SHARD, ['visitorsWithStamps'], 1)
    console.log(`  ${(u.passportNo ?? '').padEnd(12)} ${String(u.displayName ?? '').slice(0, 26).padEnd(26)} ${u.points ?? 0} -> ${points} pts, ${u.stampCount ?? 0} -> ${stampCount} stamps  (−${[...new Set(mine.map((s) => s.data().boothId))].join(', ')})`)
    ops.push(['update', users.get(vid).ref, { points, stampCount, stampedBoothIds, daysAttended }])
    ops.push(['audit', null, { action: 'removeBoothScans', targetType: 'user', targetId: vid, before: { points: u.points ?? 0, stampCount: u.stampCount ?? 0 }, after: { points, stampCount } }])

    // Prizes this visitor no longer earns.
    const unlocks = (await db.collection('tierUnlocks').where('visitorId', '==', vid).get()).docs
    for (const d of unlocks) {
      const t = tiers.find((x) => x.id === d.data().tierId)
      if (!t || points >= t.thresholdPoints) continue
      const collected = !!d.data().redeemedAt && !d.data().voidedAt
      const revoke = !collected && args.includes('--revoke-uncollected')
      flags.push(`  ${(u.passportNo ?? vid).padEnd(12)} ${t.name ?? t.id} (needs ${t.thresholdPoints}, would have ${points}) — ${collected ? 'COLLECTED, kept' : revoke ? 'not collected, unlock deleted' : 'not collected, kept (add --revoke-uncollected to delete)'}`)
      if (revoke) {
        ops.push(['delete', d.ref])
        if (t.thresholdPoints === lowest) dec.take(SHARD, ['tierReached'], 1)
      }
    }
  }
  if (!visitorIds.length) console.log('  none')
  console.log(`\nprize unlocks no longer earned (${flags.length}):`)
  console.log(flags.length ? flags.join('\n') : '  none')

  // ---- ratings ----
  console.log('\nratings:')
  for (const id of ids) {
    const [r, m, s] = await Promise.all([
      db.collection('boothRatings').where('boothId', '==', id).get(),
      db.collection('boothRated').where('boothId', '==', id).get(),
      db.doc(`stats/ratings/items/${id}`).get(),
    ])
    console.log(`  ${id.padEnd(10)} ${r.size} ratings, ${m.size} markers${s.exists ? ', counter' : ''}`)
    r.docs.forEach((d) => ops.push(['delete', d.ref])); m.docs.forEach((d) => ops.push(['delete', d.ref]))
    if (s.exists) ops.push(['delete', s.ref])
  }

  // ---- organizers ----
  console.log('\norganizers:')
  const release = [] // [uid, claims]
  for (const b of booths) {
    const roster = (await db.doc(`boothRosters/${b.id}`).get()).data()
    const uids = new Set([b.data().organizerUid, ...(roster?.members ?? []).map((m) => m.uid)].filter(Boolean))
    for (const q of (await db.collection('users').where('boothId', '==', b.id).get()).docs) uids.add(q.id)
    if (!uids.size) { console.log(`  ${b.id.padEnd(10)} none`); continue }
    for (const uid of uids) {
      const au = await auth.getUser(uid).catch(() => null)
      const ud = (await db.doc(`users/${uid}`).get()).data()
      const who = `${ud?.displayName ?? au?.displayName ?? '?'} <${au?.email ?? ud?.contact ?? uid}>`
      const c = au?.customClaims ?? {}
      if (c.role === 'organizer' && c.boothId === b.id) {
        const toVisitor = !!ud?.passportNo
        console.log(`  ${b.id.padEnd(10)} ${who} — organizer of this booth -> ${toVisitor ? 'visitor' : 'no role (signs up again)'}; account kept`)
        release.push([uid, toVisitor])
      } else {
        console.log(`  ${b.id.padEnd(10)} ${who} — role ${c.role ?? 'none'}${c.boothId ? ` for ${c.boothId}` : ''}: not changed`)
      }
    }
  }

  // ---- invites ----
  const invites = (await Promise.all([...ids].map((id) => db.collection('invites').where('boothId', '==', id).get()))).flatMap((q) => q.docs)
  const pending = invites.filter((d) => ['sent', 'opened'].includes(d.data().status))
  console.log(`\ninvites: ${invites.length} for these booths, ${pending.length} unanswered -> revoked`)
  pending.forEach((d) => ops.push(['merge', d.ref, { status: 'revoked', revokedAt: FieldValue.serverTimestamp(), revokedBy: 'script:remove-booths' }]))

  // ---- the booths themselves ----
  const ev = await getActiveEvent(true)
  for (const b of booths) {
    ops.push(['delete', b.ref], ['delete', db.doc(`boothSecrets/${b.id}`)], ['delete', db.doc(`boothRosters/${b.id}`)], ['delete', db.doc(`stats/booths/items/${b.id}`)])
    ops.push(['audit', null, { action: 'removeBooth', targetType: 'booth', targetId: b.id, before: { nameEn: b.data().nameEn, scans: scans.filter((s) => s.data().boothId === b.id).length }, after: null }])
  }
  ops.push(['merge', db.doc(`events/${ev.id}`), { boothCount: FieldValue.increment(-booths.length) }])
  console.log(`\nbooth docs: ${booths.length} booths + secrets + rosters + booth counters deleted; events/${ev.id} boothCount −${booths.length}`)

  console.log('\ncounters:')
  for (const [ref, data] of await checkedWrites(dec, COMMIT)) ops.push(['merge', ref, data])

  console.log(`\n${ops.length} writes in total${COMMIT ? '' : ''}.`)
  if (!COMMIT) { console.log('Dry run — nothing was written. Re-run with --commit to apply.'); return }

  // ponytail: batches of 400 are not one transaction; a crash between them needs a re-run, which
  // recomputes from what is left (deleted scans are not counted twice).
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch()
    for (const [kind, ref, data] of ops.slice(i, i + 400)) {
      if (kind === 'delete') batch.delete(ref)
      else if (kind === 'update') batch.update(ref, data)
      else if (kind === 'merge') batch.set(ref, data, { merge: true })
      else if (kind === 'audit') batch.set(db.collection('auditLog').doc(), { actorUid: 'script:remove-booths', ...data, at: FieldValue.serverTimestamp() })
    }
    await batch.commit()
  }
  for (const [uid, toVisitor] of release) {
    await auth.setCustomUserClaims(uid, toVisitor ? { role: 'visitor' } : {})
    await db.doc(`users/${uid}`).set({ role: toVisitor ? 'visitor' : FieldValue.delete(), boothId: null }, { merge: true })
  }
  console.log(`\nDone. ${booths.length} booths removed; ${release.length} organizers released (they see the change on their next sign-in or token refresh).`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message ?? e); process.exit(1) })
