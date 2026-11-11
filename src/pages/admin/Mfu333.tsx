import { useMemo, useState } from 'react'
import { collection, query, where } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useCollection, useEventStats, useTiers } from '../../lib/data'
import { downloadCsv } from '../../lib/csv'
import { isAdtSchool, isMfuOnlyTier, isStudentIdValid, type TierUnlockDoc, type UserDoc } from '../../../shared/model'

const ms = (v: unknown) => (v && typeof (v as { toMillis?: () => number }).toMillis === 'function' ? (v as { toMillis(): number }).toMillis() : 0)
/** "2026-11-11T08:20:00+07:00": Bangkok time, the shape the brief's export uses. */
const bkkIso = (t: number) => {
  const d = new Date(t + 7 * 3600_000)
  return d.toISOString().slice(0, 19) + '+07:00'
}
const bkkClock = (t: number) => new Date(t).toLocaleString('en-GB', { timeZone: 'Asia/Bangkok', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

/**
 * MFU333 redemptions — the list organizers record activity credit from (brief, screen 16).
 *
 * Every row is a hand-over confirmed at the desk; the student ID, name, agent ID and points are
 * the ones snapshotted at that moment. A student ID that appears on more than one row is flagged
 * for the organizers to check, never blocked. The CSV holds student IDs: keep it somewhere
 * access-restricted and delete it once the credit is recorded.
 */
export default function Mfu333() {
  const tiers = useTiers()
  const mfuTier = tiers.find((x) => isMfuOnlyTier(x, x.id))
  const prizeTierIds = tiers.filter((x) => !isMfuOnlyTier(x, x.id)).map((x) => x.id)
  const unlocks = useCollection<TierUnlockDoc>(query(collection(db, 'tierUnlocks')), [], 'redemptions').data
  // MFU students, to count who has reached 50 but not collected yet.
  const students = useCollection<UserDoc>(query(collection(db, 'users'), where('visitorType', '==', 'student'), where('institution', '==', 'MFU')), [], 'MFU students').data
  const stats = useEventStats()
  const [q, setQ] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const studentOf = useMemo(() => new Map(students.map((u) => [u.id, u])), [students])
  /*
   * Automatic since 11 Nov 10:23 (Stanley): an MFU student is on this list the moment they reach
   * the threshold, whether or not they ever came to the desk. Desk hand-overs keep their snapshot;
   * everyone else is read from their profile as it is now.
   */
  const rows = useMemo(() => {
    if (!mfuTier) return []
    const list = unlocks
      .filter((u) => u.tierId === mfuTier.id && !u.voidedAt)
      // The server records the threshold for every visitor; only MFU students earn the credit.
      .filter((u) => !!u.redeemedAt || studentOf.has(u.visitorId))
      .map((u) => {
        const p = studentOf.get(u.visitorId)
        const atDesk = !!u.redeemedAt
        return {
          uid: u.visitorId, at: ms(u.unlockedAt) || ms(u.redeemedAt), atDesk,
          studentId: (atDesk ? u.studentIdAtRedeem : null) ?? p?.studentId ?? '',
          name: (atDesk ? u.nameAtRedeem : null) ?? p?.displayName ?? '',
          passportNo: (atDesk ? u.passportNoAtRedeem : null) ?? p?.passportNo ?? '',
          points: p?.points ?? u.pointsAtRedeem ?? u.pointsAtUnlock ?? null,
          // ADT students' points go on the School activity list, everyone else's on the Extracurricular one.
          school: (atDesk ? u.schoolAtRedeem : null) ?? p?.school ?? '',
        }
      })
      .map((r) => ({ ...r, credit: isAdtSchool(r.school) ? 'School activity (ADT)' : 'Extracurricular' }))
      .sort((a, b) => a.at - b.at)
    const count = new Map<string, number>()
    for (const r of list) if (r.studentId) count.set(r.studentId, (count.get(r.studentId) ?? 0) + 1)
    return list.map((r, i) => ({ ...r, no: i + 1, dup: !!r.studentId && (count.get(r.studentId) ?? 0) > 1, bad: !isStudentIdValid(r.studentId) }))
  }, [unlocks, mfuTier, studentOf])

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    const tf = (hhmm: string) => (hhmm ? Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5)) : null)
    const f = tf(from), tt = tf(to)
    return rows.filter((r) => {
      if (s && !r.studentId.includes(s) && !r.name.toLowerCase().includes(s) && !r.passportNo.toLowerCase().includes(s)) return false
      const d = new Date(r.at + 7 * 3600_000), m = d.getUTCHours() * 60 + d.getUTCMinutes()
      if (f !== null && m < f) return false
      if (tt !== null && m > tt) return false
      return true
    })
  }, [rows, q, from, to])

  const earned = rows.filter((r) => !r.bad).length
  const prizesRedeemed = unlocks.filter((u) => prizeTierIds.includes(u.tierId) && u.redeemedAt && !u.voidedAt).length
  const noId = rows.filter((r) => r.bad).length
  const dupCount = rows.filter((r) => r.dup).length

  function exportCsv() {
    downloadCsv(shown.map((r) => ({
      no: r.no, student_id: r.studentId, name: r.name, school: r.school, credit_type: r.credit, passport_no: r.passportNo,
      points: r.points ?? '', reached_at: bkkIso(r.at), collected_at_desk: r.atDesk ? 'yes' : '', student_id_missing: r.bad ? 'yes' : '', duplicate_student_id: r.dup ? 'yes' : '',
    })), `activity-points-${new Date().toISOString().slice(0, 10)}.csv`,
    ['no', 'student_id', 'name', 'school', 'credit_type', 'passport_no', 'points', 'reached_at', 'collected_at_desk', 'student_id_missing', 'duplicate_student_id'])
  }

  return (
    <div className="page-in">
      <header>
        <h1 className="text-2xl font-bold">Activity points (MFU students)</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-soft">Every MFU student who has reached {mfuTier?.thresholdPoints ?? 50} points, added automatically — they don't need to come to the desk. ADT students go on the School activity list, students of other schools on the Extracurricular list — the Credit column and the CSV say which. The CSV contains student IDs: keep it in an access-restricted place and delete it once the credit is recorded.</p>
      </header>

      <section className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['Students earning activity points', earned],
          ['Reached it but no valid student ID', noId],
          ['Lucky-draw tries given', prizesRedeemed],
          ['Agents registered', stats.totals.visitors],
        ].map(([label, n]) => (
          <div key={label as string} className="card !p-4">
            <div className="fig text-3xl">{n as number}</div>
            <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</div>
          </div>
        ))}
      </section>

      <section className="mt-4 card">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[200px] flex-1">
            <span className="text-xs font-semibold text-ink-soft">Search student ID, name or agent ID</span>
            <input className="field mt-1" value={q} onChange={(e) => setQ(e.target.value)} placeholder="6731500000 or Somchai" />
          </label>
          <label><span className="text-xs font-semibold text-ink-soft">From (time)</span><input type="time" className="field mt-1" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
          <label><span className="text-xs font-semibold text-ink-soft">To (time)</span><input type="time" className="field mt-1" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          <button className="btn-primary px-4 py-2.5" onClick={exportCsv} disabled={shown.length === 0}>Export CSV ({shown.length})</button>
        </div>
        {dupCount > 0 && <p className="mt-3 rounded-lg bg-warn-bg px-3 py-2 text-sm text-warn-text">{dupCount} rows share a student ID with another account — check them before recording credit.</p>}

        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase tracking-wide text-ink-soft">
              <tr className="border-b border-[var(--a-line)]">
                <th className="py-2 pr-3">No</th><th className="py-2 pr-3">Student ID</th><th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Credit</th><th className="py-2 pr-3">Agent ID</th><th className="py-2 pr-3">Points</th><th className="py-2">Reached at</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={7} className="py-6 text-center text-ink-soft">{rows.length ? 'Nothing matches the search.' : 'No MFU student has reached the threshold yet.'}</td></tr>}
              {shown.map((r) => (
                <tr key={r.uid} className={`border-b border-[var(--a-line)] ${r.dup || r.bad ? 'bg-warn-bg/60' : ''}`}>
                  <td className="py-2 pr-3 text-ink-soft">{r.no}</td>
                  <td className="py-2 pr-3 font-mono">{r.studentId || '—'}{r.bad && <span className="ml-2 rounded bg-warn-text/15 px-1.5 py-0.5 text-[11px] font-semibold text-warn-text">no valid ID</span>}{r.dup && <span className="ml-2 rounded bg-warn-text/15 px-1.5 py-0.5 text-[11px] font-semibold text-warn-text">duplicate</span>}</td>
                  <td className="py-2 pr-3">{r.name}</td>
                  <td className="py-2 pr-3 text-xs"><div>{r.credit}</div><div className="max-w-[14rem] truncate text-ink-soft">{r.school}</div></td>
                  <td className="py-2 pr-3 font-mono">{r.passportNo}</td>
                  <td className="py-2 pr-3">{r.points ?? '—'}</td>
                  <td className="py-2">{bkkClock(r.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
