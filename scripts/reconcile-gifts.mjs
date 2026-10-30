/**
 * Closing reconciliation for the gift stock (18 Sep 2026).
 *
 *   node scripts/reconcile-gifts.mjs                      # dry run: prints what it would do
 *   node scripts/reconcile-gifts.mjs --commit             # apply
 *   node scripts/reconcile-gifts.mjs --total=100 --left=0 # the real figures, if they differ
 *
 * Needs application-default credentials and `functions/lib` built, like the other scripts here.
 *
 * WHY THIS EXISTS
 *   Two different things went wrong with the gift figures on the day, and neither can be put
 *   right through /admin/prizes.
 *
 *   1. `stockTotal`/`stockRemaining` are fiction. They were seeded from 50-per-session x sessions
 *      and then pushed around by guessed adjustments (-50 "error", +50 "k", -22 "change", -5 "fix",
 *      +50 "more prizes have arrived", -6 physical recount). There were only ever 100 gifts.
 *      `adjustStock` cannot fix it: it moves the pool and the OPEN session by the same delta and
 *      refuses to take the session below zero, and once the desk shuts it refuses outright because
 *      there is no session to adjust. So the pool can never be dragged down to the truth from the UI.
 *
 *   2. The display board (/admin/wall) shows `redeemed` summed over `stats/event/shards/*`, which
 *      only counts hand-overs made through the prize desk. The seven gifts given away by hand —
 *      one of the event organizers (P' Gift) wanted what was left over to go to the dev team —
 *      never touched that counter, so the board would close the day several short of the 100 that
 *      actually left the box. They asked for those to count like redemptions, so the board reads a
 *      plain 100 at the end and the closing figure needs no explaining.
 *
 * WHAT IT WRITES
 *   stats/event/shards/0 .redeemed  += (claimed - counted)   the same increment confirmRedemption
 *                                                            makes, so the board counts every gift
 *                                                            that left the box, however it left
 *   prizeTiers/{tier}   .stockTotal     = --total            the audit figures, made true
 *                       .stockRemaining = --left
 *   stockAdjustments/   one 'correction' row with the arithmetic in its reason
 *   auditLog/           one row
 *
 * ⚠ HONEST CAVEAT, worth saying out loud to whoever reads the closing report: after this runs, the
 * board's figure counts every gift that left the box, while `tierUnlocks` and the per-visitor
 * redemption records still hold ONLY the ones handed over through the desk. Any report built from
 * those will legitimately be lower than the board by the hand-out count. The stockAdjustments row
 * this writes is what reconciles the two, so do not delete it.
 *
 * Safe to re-run: it computes the gap from the live counter each time, so a second run with the
 * same figures is a no-op rather than a double count.
 */
import { readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const args = process.argv.slice(2)
const COMMIT = args.includes('--commit')
const arg = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`))
  return hit ? Number(hit.slice(name.length + 3)) : fallback
}

/** Gifts that ever existed for this event. */
const TOTAL = arg('total', 100)
/** Gifts physically still in the box when the desk closed. */
const LEFT = arg('left', 0)
const TIER = args.find((a) => a.startsWith('--tier='))?.slice(7) ?? 'global-passport'

if (!Number.isInteger(TOTAL) || TOTAL < 0) throw new Error('--total must be a whole number')
if (!Number.isInteger(LEFT) || LEFT < 0 || LEFT > TOTAL) throw new Error('--left must be between 0 and --total')

const here = dirname(fileURLToPath(import.meta.url))
const projectId = process.env.GCLOUD_PROJECT
  ?? (() => { try { return JSON.parse(readFileSync(resolve(here, '..', '.firebaserc'), 'utf8')).projects.default } catch { return 'mfu-passport' } })()
process.env.GCLOUD_PROJECT ??= projectId

const { db, FieldValue } = await import('../functions/lib/lib.js')
const { STATS_SHARDS } = await import('../functions/lib/shared/model.js')

async function main() {
  console.log(`${COMMIT ? 'APPLYING' : 'DRY RUN'} — project ${projectId}\n`)

  const tierRef = db.doc(`prizeTiers/${TIER}`)
  const tierSnap = await tierRef.get()
  if (!tierSnap.exists) throw new Error(`prizeTiers/${TIER} does not exist`)
  const tier = tierSnap.data()

  // The board's number, exactly as the wall computes it: every shard summed, unclamped.
  const shardRefs = Array.from({ length: STATS_SHARDS }, (_, i) => db.doc(`stats/event/shards/${i}`))
  const shards = await db.getAll(...shardRefs)
  const counted = shards.reduce((sum, s) => sum + (s.data()?.redeemed ?? 0), 0)

  const claimed = TOTAL - LEFT
  const delta = claimed - counted

  console.log('gifts')
  console.log(`  existed for this event      ${TOTAL}`)
  console.log(`  physically left at close    ${LEFT}`)
  console.log(`  therefore claimed           ${claimed}`)
  console.log(`  counted by the prize desk   ${counted}   (sum of stats/event/shards/*.redeemed)`)
  console.log(`  given away off-app          ${delta}   <- the board is short by this`)

  console.log('\nprize tier')
  console.log(`  stockTotal      ${tier.stockTotal} -> ${TOTAL}`)
  console.log(`  stockRemaining  ${tier.stockRemaining} -> ${LEFT}`)
  if (typeof tier.stockPerSession === 'number') {
    console.log(`  stockPerSession ${tier.stockPerSession} left alone — the sessions are over; it is only what a session WOULD start from`)
  }

  console.log('\ndisplay board')
  if (delta === 0) {
    console.log('  already reads the right number — nothing to add')
  } else if (delta < 0) {
    console.log(`  ⚠ the desk counted MORE hand-overs (${counted}) than gifts claimed (${claimed}).`)
    console.log('    Check --total/--left before applying; this would SUBTRACT from the board.')
  } else {
    console.log(`  stats/event/shards/0.redeemed += ${delta}  ->  board reads ${claimed}`)
  }

  if (!COMMIT) {
    console.log('\nDry run — nothing was written. Re-run with --commit to apply.')
    return
  }

  const reason = `closing reconciliation: ${TOTAL} gifts existed, ${LEFT} left at close, `
    + `${claimed} claimed; desk recorded ${counted}, ${delta} given away off-app and added to the board counter`

  const batch = db.batch()
  batch.set(tierRef, { stockTotal: TOTAL, stockRemaining: LEFT }, { merge: true })
  if (delta !== 0) batch.set(db.doc('stats/event/shards/0'), { redeemed: FieldValue.increment(delta) }, { merge: true })
  batch.create(db.collection('stockAdjustments').doc(), {
    tierId: TIER, delta: LEFT - tier.stockRemaining, reason, kind: 'correction',
    actorUid: 'script:reconcile-gifts', createdAt: FieldValue.serverTimestamp(),
  })
  await batch.commit()
  await db.collection('auditLog').add({
    actorUid: 'script:reconcile-gifts', action: 'reconcileGifts', targetType: 'prizeTier', targetId: TIER,
    before: { stockTotal: tier.stockTotal, stockRemaining: tier.stockRemaining, boardRedeemed: counted },
    after: { stockTotal: TOTAL, stockRemaining: LEFT, boardRedeemed: claimed, offAppGifts: delta },
    createdAt: FieldValue.serverTimestamp(),
  })

  console.log(`\nDone. The board should read ${claimed} within a second or two — it is a live subscription.`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.message ?? e); process.exit(1) })
