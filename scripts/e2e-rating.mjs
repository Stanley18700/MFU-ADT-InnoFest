/**
 * Smoke test of the five-criteria booth rating against the local emulators: validation, the
 * stored row, the per-criterion counters, and the "already rated" path.
 *
 *   npm run e2e:rating      (builds functions, then runs this inside `firebase emulators:exec`
 *                            under a demo- project, which cannot reach any real project)
 */
import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth'
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions'

const PROJECT = process.env.GCLOUD_PROJECT ?? 'mfu-passport'
const app = initializeApp({ projectId: PROJECT, apiKey: 'demo-key', authDomain: 'localhost' })
const auth = getAuth(app)
const fns = getFunctions(app, 'asia-southeast1')
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
connectFunctionsEmulator(fns, '127.0.0.1', 5001)
const call = (n) => async (d = {}) => (await httpsCallable(fns, n)(d)).data
const OWNER = { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`

let fail = 0
const ok = (name, cond, extra = '') => { if (!cond) fail++; console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`) }
async function throws(name, fn, wanted) {
  try { await fn(); ok(name, false, 'no error thrown') } catch (e) { ok(name, `${e.code} ${e.message}`.includes(wanted), `${e.code} — ${e.message}`) }
}

/** Firestore REST value → plain JS, enough for maps, numbers and strings. */
const val = (v) => v.mapValue ? Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, val(x)]))
  : v.integerValue != null ? Number(v.integerValue) : v.doubleValue ?? v.stringValue ?? v.booleanValue ?? null
const get = async (path) => { const r = await (await fetch(`${FS}/${path}`, { headers: OWNER })).json(); return r.fields ? val({ mapValue: r }) : null }
const list = async (path) => ((await (await fetch(`${FS}/${path}`, { headers: OWNER })).json()).documents ?? []).map((d) => val({ mapValue: d }))

await createUserWithEmailAndPassword(auth, 'rater@example.com', 'passw0rd!')
const uid = auth.currentUser.uid
await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, { method: 'POST', headers: OWNER, body: JSON.stringify({ localId: uid, emailVerified: true }) })
await auth.currentUser.getIdToken(true)
await call('join')({ displayName: 'Rater', visitorType: 'student', institution: 'MFU', studentId: '6731503077', countryCode: 'TH', consent: true })
await auth.currentUser.getIdToken(true)

/*
 * Only `rateBooth` is under test. A real `scan` is gated to the event's hours and the seed has
 * no booths, so the "stamped" proof — the scan row — is written directly, as the owner.
 */
const boothId = 'smoke-booth'
await fetch(`${FS}/scans?documentId=${uid}_${boothId}`, { method: 'POST', headers: OWNER, body: JSON.stringify({ fields: { visitorId: { stringValue: uid }, boothId: { stringValue: boothId } } }) })
ok('stamp row in place', !!(await get(`scans/${uid}_${boothId}`)))

/*
 * The cutoff is driven through the event document's `ratingClosesAt` override (the same knob an
 * admin has), so production code has no test-only clock. Open for the first part of the test,
 * whatever today's date is.
 */
const EVENT = 'adt-innofest-2026'
const setClosesAt = (iso) => fetch(`${FS}/events/${EVENT}?updateMask.fieldPaths=ratingClosesAt`, { method: 'PATCH', headers: OWNER, body: JSON.stringify({ fields: { ratingClosesAt: { timestampValue: iso } } }) })
await setClosesAt(new Date(Date.now() + 3600_000).toISOString())

const good = { design: 5, problem: 4, creativity: 4, future: 3, impact: 5 } // mean 4.2 → 4
const rate = call('rateBooth')
await throws('old single-score call is refused', () => rate({ boothId, stars: 4 }), 'invalid-argument')
await throws('a missing criterion is refused', () => rate({ boothId, scores: { ...good, impact: undefined } }), 'impact')
await throws('a half star is refused', () => rate({ boothId, scores: { ...good, design: 3.5 } }), 'design')
await throws('a 0 is refused', () => rate({ boothId, scores: { ...good, future: 0 } }), 'future')
await throws('an unknown key is refused', () => rate({ boothId, scores: { ...good, award: 5 } }), 'unknown')

const first = await rate({ boothId, scores: good, comment: 'Great demo' })
ok('before the cutoff: first rating saved', first.ok && first.already === false)
const again = await rate({ boothId, scores: good })
ok('second rating is "already"', again.ok && again.already === true)

const rows = (await list('boothRatings')).filter((r) => r.boothId === boothId)
ok('one row, with scores and rounded stars', rows.length === 1 && rows[0].stars === 4 && rows[0].scores?.future === 3, JSON.stringify(rows[0]))
ok('the row carries no visitor id', !JSON.stringify(rows[0]).includes(uid))
const s = await get(`stats/ratings/items/${boothId}`)
ok('count and overall sum', s.count === 1 && Math.abs(s.sum - 4.2) < 1e-9 && s.dist['4'] === 1 && s.comments === 1, JSON.stringify(s))
ok('per-criterion sums and dists, nested not dotted', s.crit?.design?.sum === 5 && s.crit?.future?.dist?.['3'] === 1 && !Object.keys(s).some((k) => k.includes('.')), JSON.stringify(s.crit))

// ---- after the cutoff ----
const late = 'late-booth'
await fetch(`${FS}/scans?documentId=${uid}_${late}`, { method: 'POST', headers: OWNER, body: JSON.stringify({ fields: { visitorId: { stringValue: uid }, boothId: { stringValue: late } } }) })
await setClosesAt(new Date(Date.now() - 60_000).toISOString())
// rateBooth reads the event through a 30-second per-instance cache (functions/src/lib.ts).
console.log('  …waiting 31s for the event cache')
await new Promise((r) => setTimeout(r, 31_000))
await throws('after the cutoff: a rating is refused', () => rate({ boothId: late, scores: good }), 'Rating has closed')
ok('after the cutoff: nothing was stored', !(await get(`boothRated/${uid}_${late}`)) && !(await get(`stats/ratings/items/${late}`)))

console.log(fail ? `\n${fail} FAILED` : '\nall passed')
process.exit(fail ? 1 : 0)
