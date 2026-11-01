import { useMemo, useState } from 'react'
import { collection } from 'firebase/firestore'
import { db, APP_ORIGIN } from '../../lib/firebase'
import { useBooths, useCollection } from '../../lib/data'
import { api, errorMessage } from '../../lib/api'
import { QR } from '../../components/QR'
import { Notice } from '../../components/ui'
import { useLocale } from '../../lib/locale'
import type { BoothRosterDoc } from '../../../shared/model'

type Row = { boothNo: string; nameEn: string; nameTh?: string; team: string[]; hostUnit?: string; location?: string }

/**
 * Rows copied out of a spreadsheet arrive tab-separated, and a cell holding line breaks (a team
 * list typed one name per line) arrives wrapped in double quotes. This reads exactly that.
 */
function parseSheet(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  const sep = text.includes('\t') ? '\t' : ','
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++ }
      else if (c === '"') quoted = false
      else cell += c
    } else if (c === '"' && cell === '') quoted = true
    else if (c === sep) { row.push(cell); cell = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(cell); cell = ''
      if (row.some((x) => x.trim())) rows.push(row)
      row = []
    } else cell += c
  }
  row.push(cell)
  if (row.some((x) => x.trim())) rows.push(row)
  return rows
}
const toRow = (c: string[]): Row => ({
  boothNo: (c[0] ?? '').trim(), nameEn: (c[1] ?? '').trim(), nameTh: (c[2] ?? '').trim() || undefined,
  team: (c[3] ?? '').split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean),
  hostUnit: (c[4] ?? '').trim() || undefined, location: (c[5] ?? '').trim() || undefined,
})

/** The official project list: load it, share the exhibitor link, see who has registered. */
export default function Exhibitors() {
  const { t } = useLocale()
  const booths = useBooths()
  const rosters = useCollection<BoothRosterDoc>(collection(db, 'boothRosters'), [], 'team lists').data
  const link = `${APP_ORIGIN}/exhibit`
  const [copied, setCopied] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ tone: 'green' | 'red'; text: string } | null>(null)
  const [q, setQ] = useState('')

  const parsed = useMemo(() => {
    // The same booth key the server uses, so "A-01" and "A1" are caught as the same booth here.
    const key = (b: string) => b.normalize('NFKC').toLowerCase().replace(/[^a-z0-9]/g, '').replace(/(\d+)/g, (d) => String(Number(d)))
    const seen = new Set<string>()
    return parseSheet(text).map(toRow).map((r) => {
      const k = key(r.boothNo)
      const dup = !!k && seen.has(k)
      if (k) seen.add(k)
      return { ...r, dup, ok: !!k && !!r.nameEn && !dup }
    })
  }, [text])
  const good = parsed.filter((r) => r.ok).map(({ dup: _d, ok: _o, ...r }) => r)
  const bad = parsed.length - good.length

  async function load() {
    setBusy(true); setMsg(null)
    try {
      let created = 0, updated = 0, members = 0, released = 0
      for (let i = 0; i < good.length; i += 40) {
        const r = await api.importProjectList({ rows: good.slice(i, i + 40) })
        created += r.created; updated += r.updated; members += r.members; released += r.released
      }
      setMsg({ tone: 'green', text: t('exa.done', { created, updated, members }) + (released ? ' ' + t('exa.released', { n: released }) : '') }); setText('')
    } catch (e) { setMsg({ tone: 'red', text: errorMessage(e) }) } finally { setBusy(false) }
  }

  async function reset(boothId: string, name: string) {
    if (!window.confirm(t('exa.resetConfirm', { name }))) return
    try { await api.resetTeamSeat({ boothId, name }) } catch (e) { setMsg({ tone: 'red', text: errorMessage(e) }) }
  }

  const teams = useMemo(() => {
    const s = q.trim().toLowerCase()
    return rosters
      .map((r) => ({ r, b: booths.find((b) => b.id === r.id) }))
      .filter(({ r, b }) => !s || [b?.shortName, b?.nameEn, b?.nameTh, ...r.members.map((m) => m.name)].some((x) => (x ?? '').toLowerCase().includes(s)))
      .sort((a, b) => (a.b?.shortName ?? '').localeCompare(b.b?.shortName ?? '', undefined, { numeric: true }))
  }, [rosters, booths, q])
  const total = rosters.reduce((n, r) => n + r.members.length, 0)
  const claimed = rosters.reduce((n, r) => n + r.members.filter((m) => m.uid).length, 0)

  return (
    <div className="page-in">
      <header>
        <h1 className="text-2xl font-bold">{t('exa.title')}</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-soft">{t('exa.lead')}</p>
      </header>

      {/* The link to share */}
      <section className="mt-5 flex flex-wrap items-center gap-5 rounded-2xl bg-white p-5 shadow-card">
        <QR value={link} size={132} />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-soft">{t('exa.link')}</div>
          <div className="mt-1 select-all break-all text-lg font-semibold text-action">{link}</div>
          <p className="mt-1 text-sm text-ink-soft">{t('exa.share')}</p>
          <button className="btn-primary mt-3 px-4 py-2" onClick={() => { void navigator.clipboard?.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 1600) }}>
            {copied ? t('exa.copied') : t('exa.copy')}
          </button>
        </div>
      </section>

      {/* Load the list */}
      <section className="mt-4 rounded-2xl bg-white p-5 shadow-card">
        <h2 className="text-lg font-bold">{t('exa.pasteTitle')}</h2>
        <p className="mt-1 text-sm text-ink-soft">{t('exa.pasteLead')}</p>
        <p className="mt-1 rounded-lg bg-sky-50 px-3 py-2 font-mono text-xs">{t('exa.cols')}</p>
        <p className="mt-1 text-xs text-ink-soft">{t('exa.colsNote')}</p>
        <textarea className="field mt-3 font-mono text-xs" rows={7} value={text} onChange={(e) => setText(e.target.value)} disabled={busy}
          placeholder={'A-01\tAR Campus Navigator\tแอปนำทางในมหาวิทยาลัย\tSomchai Jaidee / สมชาย ใจดี, Ploy Chan\tSoftware Engineering\tZone A'} />
        {parsed.length > 0 && (
          <>
            <div className="mt-2 text-sm">
              {t('exa.preview', { n: good.length, m: good.reduce((n, r) => n + r.team.length, 0) })}
              {bad > 0 && <span className="ml-2 text-danger-text">{t('exa.bad', { n: bad })}</span>}
            </div>
            <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-[var(--a-line)]">
              <table className="w-full text-left text-xs">
                <tbody>
                  {parsed.slice(0, 50).map((r, i) => (
                    <tr key={i} className={`border-b border-[var(--a-line)] align-top ${!r.ok ? 'bg-red-50' : ''}`}>
                      <td className="px-2 py-1.5 font-mono font-semibold">{r.boothNo || '—'}{r.dup && <div className="font-sans font-normal text-danger-text">{t('exa.dup')}</div>}</td>
                      <td className="px-2 py-1.5">{r.nameEn || '—'}{r.nameTh && <div className="text-ink-soft">{r.nameTh}</div>}</td>
                      <td className="px-2 py-1.5">{r.team.join(' · ') || <span className="text-danger-text">no team</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button className="btn-primary mt-3 px-5 py-2.5" disabled={busy || good.length === 0} onClick={load}>
              {busy ? t('exa.importing') : t('exa.import', { n: good.length })}
            </button>
          </>
        )}
        {msg && <div className="mt-3"><Notice tone={msg.tone}>{msg.text}</Notice></div>}
      </section>

      {/* Who has registered */}
      <section className="mt-4 rounded-2xl bg-white p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">{t('exa.teams')} <span className="ml-1 text-sm font-normal text-ink-soft">{t('exa.registered', { n: claimed, total })}</span></h2>
          <input className="field max-w-xs" placeholder={t('exa.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {teams.length === 0 && <p className="mt-3 text-sm text-ink-soft">{t('exa.none')}</p>}
        <ul className="mt-3 grid grid-cols-[minmax(0,1fr)] gap-2 md:grid-cols-2">
          {teams.map(({ r, b }) => (
            <li key={r.id} className="min-w-0 rounded-xl border border-[var(--a-line)] px-3 py-2.5">
              <div className="flex items-baseline gap-2">
                <span className="font-mono text-sm font-semibold text-action">{b?.shortName ?? r.id}</span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{b?.nameEn ?? '—'}</span>
                <span className="shrink-0 text-xs text-ink-soft">{r.members.filter((m) => m.uid).length}/{r.members.length}</span>
              </div>
              <ul className="mt-1.5 grid grid-cols-[minmax(0,1fr)] gap-1">
                {r.members.map((m) => (
                  <li key={m.name} className="flex items-center gap-2 text-sm">
                    <span aria-hidden className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${m.uid ? 'bg-action text-white' : 'bg-sky-50 text-ink-soft'}`}>{m.uid ? '✓' : '·'}</span>
                    <span className="min-w-0 flex-1 truncate">{m.name}{m.email && <span className="ml-1.5 text-xs text-ink-soft max-sm:block max-sm:ml-0 max-sm:truncate">{m.email}</span>}</span>
                    {m.uid && <button className="shrink-0 text-xs text-ink-soft underline" onClick={() => void reset(r.id, m.name)}>{t('exa.reset')}</button>}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
