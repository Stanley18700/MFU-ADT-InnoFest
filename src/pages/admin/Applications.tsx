import { collection, limit, orderBy, query } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useCollection } from '../../lib/data'
import { ts } from '../../lib/eventText'

type Row = { kind: 'exhibitor' | 'admin'; name: string; email: string; org: string; event: string; booth?: string; message?: string; createdAt: unknown }

/** Requests filed at /apply/exhibitor and /apply/admin. Read-only: reply by email, then invite. */
export default function Applications() {
  const rows = useCollection<Row>(query(collection(db, 'applications'), orderBy('createdAt', 'desc'), limit(500)), [], 'applications').data
  return (
    <div className="page-in">
      <header>
        <h1 className="text-2xl font-bold">Applications</h1>
        <p className="mt-1 text-sm text-ink-soft">Requests from /apply/exhibitor and /apply/admin. Reply by email, then send an invite from Users &amp; invites.</p>
      </header>
      <div className="mt-5 grid gap-3">
        {rows.length === 0 && <div className="rounded-2xl bg-white p-5 text-sm text-ink-soft shadow-card">No applications yet.</div>}
        {rows.map((r) => (
          <article key={r.id} className="rounded-2xl bg-white p-5 shadow-card">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="font-semibold">{r.name} · {r.org}</div>
              <span className="text-xs text-ink-soft">{ts(r.createdAt)}</span>
            </div>
            <div className="mt-1 text-sm">
              <span className={`mr-2 rounded-full px-2 py-0.5 text-xs font-semibold ${r.kind === 'admin' ? 'bg-action text-white' : 'bg-reward text-ink'}`}>{r.kind === 'admin' ? 'Admin' : 'Exhibitor'}</span>
              {r.event}{r.booth ? ` — booth: ${r.booth}` : ''}
            </div>
            <div className="mt-1 select-all text-sm text-action">{r.email}</div>
            {r.message && <p className="mt-2 whitespace-pre-wrap text-sm text-ink-soft">{r.message}</p>}
          </article>
        ))}
      </div>
    </div>
  )
}
