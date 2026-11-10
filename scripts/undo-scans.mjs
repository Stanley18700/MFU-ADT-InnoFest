/**
 * Shared by reset-visitor.mjs and remove-booths.mjs: undo exactly what onScanCreate
 * (functions/src/triggers.ts) added to the counters for a set of scans, without driving any
 * counter below zero. Import after the env vars are set, like the scripts that use it.
 */
const { db, FieldValue, bucketRef } = await import('../functions/lib/lib.js')
const { STATS_SHARDS, hourOf } = await import('../functions/lib/shared/model.js')

/** Same as triggers.ts `key()`: Firestore field names cannot hold '.', '/', etc. */
const key = (s) => s.replace(/[.~*/[\]]/g, '_').slice(0, 60)
/** ['a','b','c'], v -> { a: { b: { c: v } } }. Never dotted keys (see triggers.ts). */
const nest = (path, v) => path.reduceRight((acc, k) => ({ [k]: acc }), v)
const get = (o, path) => path.reduce((x, k) => (x == null ? undefined : x[k]), o)

export const SHARD = db.doc('stats/event/shards/0')
const DEMO = db.doc('stats/demographics/shards/0')

/** Per document, the amount each field loses. */
export function ledger() {
  const docs = new Map()
  const take = (ref, path, n) => {
    if (!n) return
    const e = docs.get(ref.path) ?? { ref, fields: [] }
    const f = e.fields.find(([p]) => p.join('\u0000') === path.join('\u0000'))
    if (f) f[1] += n; else e.fields.push([path, n])
    docs.set(ref.path, e)
  }
  return { docs, take }
}

/**
 * What one counted scan added, as `take` calls. `user` is the visitor's doc (for refBooth).
 * `skipBooth` leaves the booth's own counter alone, for when that document is being deleted.
 */
export function takeScan(take, x, at, user, { skipBooth = false } = {}) {
  const inst = x.institution || 'Unknown'
  const school = x.institution === 'MFU' ? x.school || 'Unknown school' : null
  take(SHARD, ['stamps'], 1)
  take(SHARD, ['points'], x.pointsAwarded)
  take(SHARD, ['byDay', x.day, 'stamps'], 1)
  take(DEMO, ['crossSchool', key(school ?? inst), x.boothId], 1)
  if (!skipBooth) {
    const b = db.doc(`stats/booths/items/${x.boothId}`)
    take(b, ['stamps'], 1)
    if (user?.refBooth === x.boothId) take(b, ['invitedCame'], 1)
    take(b, ['byVisitorType', x.visitorType ?? 'guest'], 1)
    take(b, ['byDay', x.day], 1)
    take(b, ['byHour', `${x.day}T${hourOf(at)}`], 1)
  }
  const { ref: bucket } = bucketRef(x.eventId, at)
  take(bucket, ['total'], 1)
  take(bucket, ['perBooth', x.boothId], 1)
}

/**
 * Check every decrement against the current value (sharded totals summed across shards), print
 * one line each, and return the [ref, data] merge-sets for the ones that are safe.
 */
export async function checkedWrites({ docs }, commit) {
  const sums = {}
  for (const base of ['stats/event/shards', 'stats/demographics/shards']) {
    const all = (await db.getAll(...Array.from({ length: STATS_SHARDS }, (_, i) => db.doc(`${base}/${i}`)))).map((d) => d.data() ?? {})
    sums[base] = (path) => all.reduce((n, d) => n + (Number(get(d, path)) || 0), 0)
  }
  const writes = []
  for (const { ref, fields } of docs.values()) {
    const base = ref.path.replace(/\/[^/]+$/, '')
    const cur = sums[base] ? null : (await ref.get()).data() ?? {}
    for (const [path, n] of fields) {
      const have = sums[base] ? sums[base](path) : Number(get(cur, path)) || 0
      const ok = have >= n
      console.log(`  ${ok ? (commit ? '-' : 'would -') : 'SKIP'.padEnd(commit ? 1 : 7)} ${String(n).padStart(3)}  ${ref.path} ${path.join('.')}  (now ${have}${ok ? ` -> ${have - n}` : ', already lower — left alone'})`)
      if (ok) writes.push([ref, nest(path, FieldValue.increment(-n))])
    }
  }
  return writes
}
