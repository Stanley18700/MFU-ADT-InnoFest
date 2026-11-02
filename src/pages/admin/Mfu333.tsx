import { useMemo, useState } from 'react'
import { collection, query, where } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useCollection, useEventStats, useTiers } from '../../lib/data'
import { downloadCsv } from '../../lib/csv'
import { isMfuOnlyTier, isStudentIdValid, type TierUnlockDoc, type UserDoc } from '../../../shared/model'

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

  const rows = useMemo(() => {
    if (!mfuTier) return []
    const list = unlocks
      .filter((u) => u.tierId === mfuTier.id && u.redeemedAt && !u.voidedAt)
      .map((u) => ({
        uid: u.visitorId, at: ms(u.redeemedAt),
        studentId: u.studentIdAtRedeem ?? '', name: u.nameAtRedeem ?? '', passportNo: u.passportNoAtRedeem ?? '', points: u.pointsAtRedeem ?? null,
      }))
      .sort((a, b) => a.at - b.at)
    const count = new Map<string, number>()
    for (const r of list) if (r.studentId) count.set(r.studentId, (count.get(r.studentId) ?? 0) + 1)
    return list.map((r, i) => ({ ...r, no: i + 1, dup: !!r.studentId && (count.get(r.studentId) ?? 0) > 1, bad: !isStudentIdValid(r.studentId) }))
  }, [unlocks, mfuTier])

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

  const redeemedMfu = rows.length
  const prizesRedeemed = unlocks.filter((u) => prizeTierIds.includes(u.tierId) && u.redeemedAt && !u.voidedAt).length
  const collected = new Set(rows.map((r) => r.uid))
  const waiting = mfuTier ? students.filter((u) => (u.points ?? 0) >= mfuTier.thresholdPoints && isStudentIdValid(u.studentId) && !collected.has(u.id)).length : 0
  const dupCount = rows.filter((r) => r.dup).length

  function exportCsv() {
    downloadCsv(shown.map((r) => ({
      no: r.no, student_id: r.studentId, name: r.name, passport_no: r.passportNo,
      points_at_redeem: r.points ?? '', redeemed_at: bkkIso(r.at), duplicate_student_id: r.dup ? 'yes' : '',
    })), `mfu333-redemptions-${new Date().toISOString().slice(0, 10)}.csv`,
    ['no', 'student_id', 'name', 'passport_no', 'points_at_redeem', 'redeemed_at', 'duplicate_student_id'])
  }

  return (
    <div className="page-in">
      <header>
        <h1 className="text-2xl font-bold">MFU333 redemptions</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-soft">Everyone who collected MFU333 activity credit at the desk, for recording credit. The CSV contains student IDs: keep it in an access-restricted place and delete it once the credit is recorded.</p>
      </header>

      <section className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ['MFU333 redeemed', redeemedMfu],
          ['Prizes redeemed', prizesRedeemed],
          [`Reached ${mfuTier?.thresholdPoints ?? 50}, not collected`, waiting],
          ['Agents registered', stats.totals.visitors],
        ].map(([label, n]) => (
          <div key={label as string} className="rounded-2xl bg-white p-4 shadow-card">
            <div className="fig text-3xl">{n as number}</div>
            <div className="mt-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">{label}</div>
          </div>
        ))}
      </section>

      <section className="mt-4 rounded-2xl bg-white p-5 shadow-card">
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
                <th className="py-2 pr-3">Agent ID</th><th className="py-2 pr-3">Points</th><th className="py-2">Redeemed at</th>
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-ink-soft">{rows.length ? 'Nothing matches the search.' : 'No MFU333 redemptions yet.'}</td></tr>}
              {shown.map((r) => (
                <tr key={r.uid} className={`border-b border-[var(--a-line)] ${r.dup || r.bad ? 'bg-warn-bg/60' : ''}`}>
                  <td className="py-2 pr-3 text-ink-soft">{r.no}</td>
                  <td className="py-2 pr-3 font-mono">{r.studentId || '—'}{r.dup && <span className="ml-2 rounded bg-warn-text/15 px-1.5 py-0.5 text-[11px] font-semibold text-warn-text">duplicate</span>}</td>
                  <td className="py-2 pr-3">{r.name}</td>
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
