import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { collection, limit, orderBy, query } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { ms, useCollection, useTiers } from '../../lib/data'
import { useAuth } from '../../lib/auth'
import { useLocale } from '../../lib/locale'
import { GhostBtn, PrimaryBtn } from '../../components/agency'
import { HandlerSession } from '../../components/Welcome'

/**
 * HANDLER // 0 for admins: one briefing on a device's first visit, then a priority alert when a
 * reward is running out or new applications arrive — in the same card visitors and exhibitors get.
 */

function read(key: string) { try { return localStorage.getItem(key) } catch { return null } }
function write(key: string, v: string) { try { localStorage.setItem(key, v) } catch { /* shows again; harmless */ } }

/* ---------- applications: "new since you last looked" ---------- */
const APPS_KEY = 'mfu-admin-apps-seen'
const APPS_EVT = 'mfu-admin-apps-seen'
export function markAppsSeen() { write(APPS_KEY, String(Date.now())); window.dispatchEvent(new Event(APPS_EVT)) }
/** Applications filed since this device last opened the Applications page. The first visit starts the clock. */
export function useNewApplications() {
  const rows = useCollection<{ createdAt: unknown }>(query(collection(db, 'applications'), orderBy('createdAt', 'desc'), limit(50)), [], 'applications').data
  const [seen, setSeen] = useState(() => {
    const v = Number(read(APPS_KEY))
    if (v) return v
    const now = Date.now(); write(APPS_KEY, String(now)); return now
  })
  useEffect(() => {
    const on = () => setSeen(Number(read(APPS_KEY)) || Date.now())
    window.addEventListener(APPS_EVT, on)
    return () => window.removeEventListener(APPS_EVT, on)
  }, [])
  return rows.filter((r) => (ms(r.createdAt) ?? 0) > seen).length
}

/* ---------- reward stock levels ---------- */
export type StockLevel = 'ok' | 'low' | 'out'
export function stockLevel(remaining: number, total: number): StockLevel {
  if (!total) return 'ok'
  if (remaining <= 0) return 'out'
  if (remaining <= Math.max(5, Math.round(total * 0.1))) return 'low'
  return 'ok'
}

type Alert = { id: string; text: string; to: string; label: string }

export function AdminHandler() {
  const { t } = useLocale()
  const nav = useNavigate()
  const loc = useLocation()
  const { user } = useAuth()
  const uid = user?.uid ?? 'anon'
  const tiers = useTiers()
  const newApps = useNewApplications()
  const briefKey = `mfu-admin-welcome:${uid}`
  const alertKey = `mfu-admin-alerts:${uid}`
  const [briefing, setBriefing] = useState(() => read(briefKey) !== '1')
  const [seen, setSeen] = useState<string[]>(() => { try { return JSON.parse(read(alertKey) ?? '[]') } catch { return [] } })
  const [open, setOpen] = useState<Alert | null>(null)

  useEffect(() => { if (loc.pathname.startsWith('/admin/applications')) markAppsSeen() }, [loc.pathname, newApps])

  const alerts = useMemo<Alert[]>(() => {
    const out: Alert[] = []
    for (const x of tiers.filter((x) => x.active)) {
      const lv = stockLevel(x.stockRemaining, x.stockTotal)
      if (lv === 'ok') continue
      out.push({
        id: `stock:${x.id}:${lv}`, to: '/admin/prizes', label: t('hxa.al.toStock'),
        text: lv === 'out' ? t('hxa.al.stockOut', { tier: x.name }) : t('hxa.al.stockLow', { tier: x.name, n: x.stockRemaining }),
      })
    }
    if (newApps > 0 && !loc.pathname.startsWith('/admin/applications')) out.push({ id: `apps:${newApps}`, to: '/admin/applications', label: t('hxa.al.toApps'), text: t('hxa.al.apps', { n: newApps }) })
    return out
  }, [tiers, newApps, loc.pathname, t])

  // One at a time, after the briefing, never over another open dialog.
  useEffect(() => {
    if (briefing || open) return
    const next = alerts.find((a) => !seen.includes(a.id))
    if (!next) return
    const id = window.setTimeout(() => { if (!document.querySelector('[aria-modal="true"], dialog[open]')) setOpen(next) }, 1200)
    return () => window.clearTimeout(id)
  }, [alerts, seen, briefing, open])

  const dismiss = (a: Alert) => {
    const s = [...seen.filter((x) => !x.startsWith(a.id.split(':').slice(0, 2).join(':'))), a.id].slice(-40)
    setSeen(s); write(alertKey, JSON.stringify(s)); setOpen(null)
  }
  const endBrief = () => { write(briefKey, '1'); setBriefing(false) }

  if (briefing) {
    return (
      <HandlerSession tag={t('hxa.tag')} onClose={endBrief}
        script={[t('hxa.b1'), t('hxa.b2'), t('hxa.b3'), t('hxa.b4')]}
        actions={(
          <>
            <PrimaryBtn onClick={() => { endBrief(); nav('/admin') }}>{t('hxa.a.home')}</PrimaryBtn>
            <GhostBtn onClick={() => { endBrief(); nav('/admin/booth-cards') }}>{t('hxa.a.print')}</GhostBtn>
            <button type="button" onClick={() => { endBrief(); nav('/admin/booths') }} className="min-h-11 cursor-pointer border-0 bg-transparent text-[14px] font-semibold text-white/90 underline underline-offset-4">{t('hxa.a.booths')}</button>
          </>
        )} />
    )
  }
  if (!open) return null
  return (
    <HandlerSession key={open.id} tag={t('hxa.al.tag')} onClose={() => dismiss(open)} script={[open.text]}
      actions={(
        <>
          <PrimaryBtn onClick={() => { dismiss(open); nav(open.to) }}>{open.label}</PrimaryBtn>
          <button type="button" onClick={() => dismiss(open)} className="min-h-11 cursor-pointer border-0 bg-transparent text-[14px] font-semibold text-white/90 underline underline-offset-4">{t('hx.a.later')}</button>
        </>
      )} />
  )
}
