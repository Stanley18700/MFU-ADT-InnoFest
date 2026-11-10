/**
 * Emulator check for scripts/remove-booths.mjs. A visitor stamps a real booth (snapshot of every
 * counter), then a demo booth and rates it; an organizer holds the demo booth. Removing the demo
 * booth must bring every counter back to the snapshot, leave the real stamp and points alone,
 * clear the demo rating and return the organizer to visitor.
 *
 *   npm run e2e:remove-booths    (inside `firebase emulators:exec` under a demo- project)
 */
import { initializeApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signOut } from 'firebase/auth'
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
const AUTH = `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/${PROJECT}`
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

let fail = 0
const ok = (name, cond, extra = '') => { if (!cond) fail++; console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? ' — ' + extra : ''}`) }
const val = (v) => v.mapValue ? Object.fromEntries(Object.entries(v.mapValue.fields ?? {}).map(([k, x]) => [k, val(x)]))
  : v.arrayValue ? (v.arrayValue.values ?? []).map(val)
  : v.integerValue != null ? Number(v.integerValue) : v.doubleValue ?? v.stringValue ?? v.booleanValue ?? null
const get = async (path) => { const r = await (await fetch(`${FS}/${path}`, { headers: OWNER })).json(); return r.fields ? val({ mapValue: r }) : null }
const list = async (path) => ((await (await fetch(`${FS}/${path}?pageSize=300`, { headers: OWNER })).json()).documents ?? []).map((d) => ({ id: d.name.split('/').pop(), ...val({ mapValue: d }) }))
const put = (path, fields) => fetch(`${FS}/${path.replace(/\/([^/]+)$/, '?documentId=$1')}`, { method: 'POST', headers: OWNER, body: JSON.stringify({ fields }) })
const S = (v) => ({ stringValue: v }), I = (v) => ({ integerValue: v })
/** Every number in the event-wide counters, summed; booth counters are compared for the real booth only. */
const totals = async () => {
  const out = {}
  const walk = (o, p) => { for (const [k, v] of Object.entries(o)) { if (typeof v === 'number') { if (v) out[p + k] = (out[p + k] ?? 0) + v } else if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, p + k + '.') } }
  for (const s of await list('stats/event/shards')) { const { id, ...rest } = s; walk(rest, '') }
  for (const s of await list('stats/demographics/shards')) { const { id, ...rest } = s; walk(rest, 'demo.') }
  for (const s of await list('stats/buckets/items')) { const { id, startsAt, day, ...rest } = s; walk(rest, `bucket.${id}.`) }
  const real = await get('stats/booths/items/real-1'); if (real) { const { rank, lastStampAt, updatedAt, boothId, ...rest } = real; walk(rest, 'booth.real-1.') }
  return out
}
const scan = async (uid, boothId, pts) => {
  await put(`scans/${uid}_${boothId}`, {
    visitorId: S(uid), boothId: S(boothId), eventId: S('adt-innofest-2026'), scannedAt: { timestampValue: new Date().toISOString() },
    day: S('2026-11-11'), pointsAwarded: I(pts), counter: I(1), uaHash: S('x'), ipPrefix: S('x'), visitorType: S('student'), institution: S('MFU'), school: S('ADT'),
  })
}
const waitPoints = async (uid, want) => { let u; for (let i = 0; i < 80 && (u = await get(`users/${uid}`))?.points !== want; i++) await sleep(250); await sleep(1200); return u }
async function visitor(email) {
  await createUserWithEmailAndPassword(auth, email, 'passw0rd!')
  const uid = auth.currentUser.uid
  await fetch(`${AUTH}/accounts:update`, { method: 'POST', headers: OWNER, body: JSON.stringify({ localId: uid, emailVerified: true }) })
  await auth.currentUser.getIdToken(true)
  await httpsCallable(fns, 'join')({ displayName: email.split('@')[0], visitorType: 'student', institution: 'MFU', studentId: '6731503077', countryCode: 'TH', consent: true })
  await signOut(auth)
  return uid
}

await put('booths/real-1', { nameEn: S('Real Project'), shortName: S('A-01'), active: { booleanValue: true }, eventId: S('adt-innofest-2026') })
await put('booths/demo-1', { nameEn: S('Sample Booth (Demo)'), shortName: S('T-01'), active: { booleanValue: false }, eventId: S('adt-innofest-2026') })
await put('boothSecrets/demo-1', { secret: S('x') })
const v = await visitor('v@example.com')
const org = await visitor('org@example.com')
await sleep(1500)
// The organizer: claims and mirror for the demo booth, as setUserRole writes them.
await fetch(`${AUTH}/accounts:update`, { method: 'POST', headers: OWNER, body: JSON.stringify({ localId: org, customAttributes: JSON.stringify({ role: 'organizer', boothId: 'demo-1' }) }) })
await fetch(`${FS}/users/${org}?updateMask.fieldPaths=role&updateMask.fieldPaths=boothId`, { method: 'PATCH', headers: OWNER, body: JSON.stringify({ fields: { role: S('organizer'), boothId: S('demo-1') } }) })

await scan(v, 'real-1', 3)
await waitPoints(v, 3)
const snapshot = await totals()
await scan(v, 'demo-1', 60) // crosses the 50-point reward
const before = await waitPoints(v, 63)
ok('both stamps counted, reward unlocked', before?.points === 63 && (await list('tierUnlocks')).some((t) => t.visitorId === v), `points ${before?.points}`)
await put(`boothRated/${v}_demo-1`, { boothId: S('demo-1') })
await put('boothRatings/r1', { boothId: S('demo-1'), stars: I(4) })
await put('stats/ratings/items/demo-1', { boothId: S('demo-1'), count: I(1), sum: I(4) })

const run = (...extra) => { try { return execFileSync('node', ['scripts/remove-booths.mjs', '--emulator', ...extra], { env: process.env, encoding: 'utf8' }) } catch (e) { return `EXIT ${e.status}\n${e.stdout}${e.stderr}` } }
ok('a booth not marked (Demo) is refused', run('--booths=real-1').includes('Not marked (Demo)'))
const dry = run('--booths=demo-1')
console.log(dry.split('\n').map((l) => '      | ' + l).join('\n'))
ok('dry run wrote nothing', (await get(`users/${v}`)).points === 63 && !!(await get('booths/demo-1')))
run('--booths=demo-1', '--commit')

const u = await get(`users/${v}`)
ok('visitor keeps only the real booth', u.points === 3 && u.stampCount === 1 && JSON.stringify(u.stampedBoothIds) === '["real-1"]', JSON.stringify({ points: u.points, stamps: u.stampCount, booths: u.stampedBoothIds }))
ok('real scan kept, demo scan and marker gone', !!(await get(`scans/${v}_real-1`)) && !(await get(`scans/${v}_demo-1`)) && !(await get(`countedScans/${v}_demo-1`)))
ok('unearned reward listed, not deleted by default', dry.includes('not collected, kept') && (await list('tierUnlocks')).some((t) => t.visitorId === v))
ok('demo ratings gone', !(await get(`boothRated/${v}_demo-1`)) && !(await get('boothRatings/r1')) && !(await get('stats/ratings/items/demo-1')))
ok('booth, secret and its counter gone', !(await get('booths/demo-1')) && !(await get('boothSecrets/demo-1')) && !(await get('stats/booths/items/demo-1')) && !!(await get('booths/real-1')))
const o = await get(`users/${org}`)
const oa = (await (await fetch(`${AUTH}/accounts:lookup`, { method: 'POST', headers: OWNER, body: JSON.stringify({ localId: [org] }) })).json()).users[0]
ok('organizer back to visitor, account kept', o.role === 'visitor' && !o.boothId && JSON.parse(oa.customAttributes ?? '{}').role === 'visitor', `${o.role} ${oa.customAttributes}`)
const end = await totals()
// The organizer becoming a visitor again is one more visitor (onUserWrite): exactly +1 in each
// visitor-count field, and nothing to do with stamps. Checked separately below.
const visitorField = (k) => /^(visitors$|byVisitorType\.|byDay\.[^.]+\.visitors|demo\.(by(Country|Institution|School|EthnicGroup)\.|ethnic))/.test(k)
const vdiff = [...new Set([...Object.keys(snapshot), ...Object.keys(end)])].filter(visitorField).filter((k) => (end[k] ?? 0) - (snapshot[k] ?? 0) !== 1)
ok('visitor counters: exactly +1 for the released organizer', vdiff.length === 0, vdiff.join('; '))
const keys = new Set([...Object.keys(snapshot), ...Object.keys(end)].filter((k) => !k.startsWith('tierReached') && !visitorField(k)))
const diff = [...keys].filter((k) => (snapshot[k] ?? 0) !== (end[k] ?? 0)).map((k) => `${k}: ${snapshot[k] ?? 0} -> ${end[k] ?? 0}`)
ok('every stamp/point counter back to the real-booth-only snapshot', diff.length === 0, diff.join('; '))

console.log(fail ? `\n${fail} FAILED` : '\nall passed')
process.exit(fail ? 1 : 0)
