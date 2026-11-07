import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBooths } from '../../lib/data'
import { useLocale } from '../../lib/locale'
import { useBodyScrollLock } from '../../lib/useBodyScrollLock'

export const SearchIcon = (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
)

export type SearchPage = { to: string; label: string; group: string; icon: ReactNode; away?: boolean }
type Hit = { key: string; kind: 'page' | 'booth' | 'people' | 'boothsAll'; title: string; meta?: string; to: string; icon?: ReactNode; newTab?: boolean }

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')

/**
 * Ctrl K / the Search tab: one box for the whole console. Pages and booths are matched here
 * (both are already on the device); a visitor or an account is handed to the Users page's own
 * search, which knows how to read the user list without opening all of it.
 */
export function QuickSearch({ pages, onClose }: { pages: SearchPage[]; onClose: () => void }) {
  const { t, pick } = useLocale()
  const nav = useNavigate()
  const booths = useBooths(true)
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLUListElement>(null)
  useBodyScrollLock(true)
  useEffect(() => { input.current?.focus() }, [])

  const hits = useMemo<Hit[]>(() => {
    const s = norm(q.trim())
    const out: Hit[] = []
    const pageHits = pages.filter((p) => !s || norm(p.label).includes(s) || norm(p.group).includes(s))
    if (s) {
      const boothHits = booths.filter((b) => [b.shortName, b.nameEn, b.nameTh, b.hostUnit, b.location].some((v) => v && norm(v).includes(s)))
      for (const b of boothHits.slice(0, 6)) {
        out.push({ key: `b:${b.id}`, kind: 'booth', title: `${b.shortName ? `${b.shortName} · ` : ''}${pick(b.nameEn, b.nameTh)}`, meta: [b.hostUnit, b.active ? '' : 'inactive'].filter(Boolean).join(' · '), to: `/admin/booths?q=${encodeURIComponent(b.shortName || b.nameEn)}` })
      }
      if (boothHits.length > 6) out.push({ key: 'ball', kind: 'boothsAll', title: t('cn.s.findBooths', { q: q.trim() }), to: `/admin/booths?q=${encodeURIComponent(q.trim())}` })
    }
    for (const p of pageHits.slice(0, s ? 5 : 8)) out.push({ key: `p:${p.to}`, kind: 'page', title: p.label, meta: p.group, to: p.to, icon: p.icon, newTab: p.to.startsWith('/admin/print') })
    if (s.length >= 2) out.push({ key: 'people', kind: 'people', title: t('cn.s.findPeople', { q: q.trim() }), to: `/admin/users?q=${encodeURIComponent(q.trim())}` })
    return out
  }, [q, pages, booths, pick, t])
  useEffect(() => { setSel(0) }, [q])
  useEffect(() => { list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' }) }, [sel])

  function go(h: Hit | undefined) {
    if (!h) return
    onClose()
    if (h.newTab) window.open(h.to, '_blank', 'noopener')
    else nav(h.to)
  }
  function key(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSel((i) => Math.min(hits.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((i) => Math.max(0, i - 1)) }
    else if (e.key === 'Enter') { e.preventDefault(); go(hits[sel]) }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  const groups: Array<[Hit['kind'][], string]> = [[['booth', 'boothsAll'], t('cn.s.booths')], [['page'], t('cn.s.pages')], [['people'], t('cn.s.people')]]
  const noMatch = q.trim().length > 0 && !hits.some((h) => h.kind === 'booth' || h.kind === 'page')
  return (
    <div className="scrim-in fixed inset-0 z-[70] flex items-start justify-center bg-[#060B26]/55 p-3 pt-[max(12px,8vh)] backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={t('cn.s.aria')} onClick={(e) => e.stopPropagation()}
        className="cn-palette hd-pop flex max-h-[80dvh] w-full max-w-[560px] flex-col overflow-hidden">
        <div className="flex items-center gap-2 border-0 border-b border-solid border-[#D2DCEE] px-4">
          <span className="text-[#1450E6]">{SearchIcon}</span>
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={key}
            placeholder={t('cn.s.placeholder')} aria-label={t('cn.s.aria')} role="combobox" aria-expanded aria-controls="cn-hits"
            aria-activedescendant={hits[sel] ? `cn-hit-${sel}` : undefined}
            className="h-14 min-w-0 flex-1 border-0 bg-transparent text-[16px] text-ink outline-none" />
          <button type="button" onClick={onClose} className="a-mono cursor-pointer rounded border border-solid border-[#C9D4EA] bg-white px-1.5 py-0.5 text-[11px] text-[var(--a-muted)]">Esc</button>
        </div>
        <ul id="cn-hits" ref={list} role="listbox" className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-2">
          {!q.trim() && <li className="px-3 pb-2 pt-1 text-[13px] text-[var(--a-muted)]">{t('cn.s.empty')}</li>}
          {noMatch && <li className="px-3 pb-2 pt-1 text-[13px] text-[var(--a-muted)]">{t('cn.s.none')}</li>}
          {groups.map(([kinds, label]) => {
            const rows = hits.map((h, i) => [h, i] as const).filter(([h]) => kinds.includes(h.kind))
            if (!rows.length) return null
            return (
              <li key={label} role="presentation">
                <div className="a-mono px-3 pb-1 pt-2 text-[10.5px] font-semibold tracking-[.14em] text-[var(--a-muted)]">{label.toUpperCase()}</div>
                <ul role="presentation" className="m-0 list-none p-0">
                  {rows.map(([h, i]) => (
                    <li key={h.key} id={`cn-hit-${i}`} role="option" aria-selected={i === sel}
                      onMouseMove={() => setSel(i)} onClick={() => go(h)}
                      className={`flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 ${i === sel ? 'cn-hit-on' : ''}`}>
                      <span className="grid h-7 w-7 shrink-0 place-items-center text-[#1450E6]">{h.icon ?? (h.kind === 'people' ? SearchIcon : <span className="a-mono text-[11px] font-bold">{h.kind === 'booth' ? '▣' : '⋯'}</span>)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[14.5px] font-semibold text-ink">{h.title}</span>
                        {h.meta && <span className="block truncate text-[12px] text-[var(--a-muted)]">{h.meta}</span>}
                      </span>
                      {i === sel && <span aria-hidden className="a-mono text-[12px] text-[#1450E6]">↵</span>}
                    </li>
                  ))}
                </ul>
              </li>
            )
          })}
        </ul>
        <div className="a-mono hidden border-0 border-t border-solid border-[#D2DCEE] px-4 py-2 text-[11px] text-[var(--a-muted)] sm:block">{t('cn.s.foot')}</div>
      </div>
    </div>
  )
}
