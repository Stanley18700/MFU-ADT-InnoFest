/**
 * Emulator check for scripts/reset-visitor.mjs: two scans counted by the real onScanCreate
 * trigger (with a prize unlock), then a reset, then every counter back where it started.
 *
 *   npm run e2e:reset    (runs inside `firebase emulators:exec` under a demo- project)
 */
import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword } from 'firebase/auth'
import { getFunctions, connectFunctionsEmulator, httpsCallable } from 'firebase/functions'
import { execFileSync } from 'node:child_process'

const PROJECT = process.env.GCLOUD_PROJECT ?? 'mfu-passport'
const app = initializeApp({ projectId: PROJECT, apiKey: 'demo-key', authDomain: 'localhost' })
const auth = getAuth(app)
const fns = getFunctions(app, 'asia-southeast1')
connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
connectFunctionsEmulator(fns, '127.0.0.1', 5001)
const OWNER = { 'Content-Type': 'application/json', Authorization: 'Bearer owner' }
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let fail = 0
const ok = (name, cond, extra = '') => { if (!cond) fail++; console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`) }
const val = (v) => v.mapValue ? Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, val(x)]))
  : v.arrayValue ? (v.arrayValue.values ?? []).map(val)
  : v.integerValue != null ? Number(v.integerValue) : v.doubleValue ?? v.stringValue ?? v.booleanValue ?? null
const get = async (path) => { const r = await (await fetch(`${FS}/${path}`, { headers: OWNER })).json(); return r.fields ? val({ mapValue: r }) : null }
const list = async (path) => ((await (await fetch(`${FS}/${path}?pageSize=300`, { headers: OWNER })).json()).documents ?? []).map((d) => ({ id: d.name.split('/').pop(), ...val({ mapValue: d }) }))
/** Every number in the event shards, summed, so the comparison does not care which shard was hit. */
const totals = async () => {
  const out = {}
  const walk = (o, p) => { for (const [k, v] of Object.entries(o)) { if (typeof v === 'number') out[p + k] = (out[p + k] ?? 0) + v; else if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, p + k + '.') } }
  for (const s of await list('stats/event/shards')) { const { id, ...rest } = s; walk(rest, '') }
  for (const s of await list('stats/demographics/shards')) { const { id, ...rest } = s; walk(rest, 'demo.') }
  for (const s of await list('stats/booths/items')) { const { id, rank, lastStampAt, updatedAt, boothId, ...rest } = s; walk(rest, `booth.${id}.`) }
  for (const s of await list('stats/buckets/items')) { const { id, startsAt, day, ...rest } = s; walk(rest, `bucket.${id}.`) }
  return out
}

await createUserWithEmailAndPassword(auth, 'resetme@example.com', 'passw0rd!')
const uid = auth.currentUser.uid
await fetch(`http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, { method: 'POST', headers: OWNER, body: JSON.stringify({ localId: uid, emailVerified: true }) })
await auth.currentUser.getIdToken(true)
await httpsCallable(fns, 'join')({ displayName: 'Reset Me', visitorType: 'student', institution: 'MFU', studentId: '6731503077', countryCode: 'TH', consent: true })
await sleep(1500)
const base = await totals()

const now = new Date()
for (const [boothId, pts] of [['bA', 30], ['bB', 25]]) {
  await fetch(`${FS}/scans?documentId=${uid}_${boothId}`, { method: 'POST', headers: OWNER, body: JSON.stringify({ fields: {
    visitorId: { stringValue: uid }, boothId: { stringValue: boothId }, eventId: { stringValue: 'adt-innofest-2026' },
    scannedAt: { timestampValue: now.toISOString() }, day: { stringValue: '2026-11-11' }, pointsAwarded: { integerValue: pts },
    counter: { integerValue: 1 }, uaHash: { stringValue: 'x' }, ipPrefix: { stringValue: 'x' },
    visitorType: { stringValue: 'student' }, institution: { stringValue: 'MFU' }, school: { stringValue: 'ADT' },
  } }) })
}
await fetch(`${FS}/boothRated?documentId=${uid}_bA`, { method: 'POST', headers: OWNER, body: JSON.stringify({ fields: { boothId: { stringValue: 'bA' } } }) })
let u
for (let i = 0; i < 60 && (u = await get(`users/${uid}`))?.points !== 55; i++) await sleep(250)
await sleep(1500) // the unlock pass runs after the counting transaction
ok('trigger counted both scans', u?.points === 55 && u?.stampCount === 2, JSON.stringify({ points: u?.points, stamps: u?.stampCount }))
ok('a prize unlocked', (await list('tierUnlocks')).some((t) => t.visitorId === uid))

const run = (...extra) => execFileSync('node', ['scripts/reset-visitor.mjs', `--uid=${uid}`, '--emulator', ...extra], { env: process.env, encoding: 'utf8' })
const dry = run()
console.log(dry.split('\n').map((l) => '      | ' + l).join('\n'))
ok('dry run wrote nothing', (await get(`users/${uid}`)).points === 55 && !!(await get(`scans/${uid}_bA`)))
run('--commit')

const after = await get(`users/${uid}`)
ok('user reset, account kept', after.points === 0 && after.stampCount === 0 && after.stampedBoothIds.length === 0 && after.role === 'visitor', JSON.stringify({ points: after.points, role: after.role }))
ok('scans and markers gone', !(await get(`scans/${uid}_bA`)) && !(await get(`countedScans/${uid}_bB`)) && !(await get(`boothRated/${uid}_bA`)))
ok('unlock gone', !(await list('tierUnlocks')).some((t) => t.visitorId === uid))
const end = await totals()
const diff = Object.keys({ ...base, ...end }).filter((k) => (base[k] ?? 0) !== (end[k] ?? 0)).map((k) => `${k}: ${base[k] ?? 0} -> ${end[k] ?? 0}`)
ok('every counter back to where it started', diff.length === 0, diff.join('; '))

console.log(fail ? `\n${fail} FAILED` : '\nall passed')
process.exit(fail ? 1 : 0)
