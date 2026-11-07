import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useEvent } from '../../lib/data'
import { AccountMenu } from '../../components/AccountMenu'
import { DataErrors, Icon } from '../../components/ui'
import { useSlidingPill } from '../../lib/useSlidingPill'
import { useLocale } from '../../lib/locale'
import type { StringKey } from '../../lib/strings'
import { QuickSearch, SearchIcon, type SearchPage } from './QuickSearch'
import { AdminHandler } from './AdminHandler'

/**
 * Keys, not words: this table is module-level, evaluated once at import, so a translated label
 * held here could never follow the language toggle. Resolved with `t()` at render instead.
 */
type Item = { to: string; label: StringKey; icon: ReactNode; end?: boolean; away?: boolean }

/**
 * Four groups in the order the festival happens: what you watch on the day, what you set up
 * before it, what you consult afterwards, and the printed and shared materials. Screens that
 * leave the console (hall screen, prize desk, print pages) carry a `↗`.
 */
const GROUPS: Array<{ title: StringKey; items: Item[] }> = [
  { title: 'cn.g.live', items: [
    { to: '/admin', label: 'cn.nav.home', icon: Icon.dashboard, end: true },
    { to: '/redeem', label: 'admin.nav.desk', icon: Icon.desk, away: true },
    { to: '/admin/wall', label: 'admin.nav.wall', icon: Icon.screen, away: true },
    { to: '/admin/mfu333', label: 'm.nav', icon: Icon.audit },
    { to: '/admin/draw', label: 'admin.nav.draw', icon: Icon.draw },
  ] },
  { title: 'cn.g.before', items: [
    { to: '/admin/event', label: 'admin.nav.event', icon: Icon.event },
    { to: '/admin/booths', label: 'admin.nav.booths', icon: Icon.booths },
    { to: '/admin/exhibitors', label: 'exa.nav', icon: Icon.users },
    { to: '/admin/prizes', label: 'admin.nav.prizes', icon: Icon.prizes },
    { to: '/admin/feedback', label: 'cn.nav.survey', icon: Icon.lists },
    { to: '/admin/users', label: 'admin.nav.users', icon: Icon.users },
    { to: '/admin/applications', label: 'admin.nav.applications', icon: Icon.users },
  ] },
  { title: 'cn.g.after', items: [
    { to: '/admin/ratings', label: 'admin.nav.ratings', icon: Icon.audit },
    { to: '/admin/audit', label: 'admin.nav.audit', icon: Icon.audit },
    { to: '/admin/refdata', label: 'admin.nav.refdata', icon: Icon.lists },
  ] },
  { title: 'cn.g.print', items: [
    { to: '/admin/booth-cards', label: 'cn.nav.cards', icon: Icon.print, away: true },
    { to: '/admin/poster', label: 'cn.nav.poster', icon: Icon.print, away: true },
    { to: '/admin/print?day=all', label: 'cn.nav.report', icon: Icon.print, away: true },
  ] },
]


const ALL = GROUPS.flatMap((g) => g.items)
const RAIL_KEY = 'admin-rail-collapsed'
const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

function readCollapsed(): boolean {
  try { return localStorage.getItem(RAIL_KEY) === '1' } catch { return false }
}

/** The sidebar's contents, rendered by two hosts: the sticky desktop rail and the phone drawer. */
function SideNav({ collapsed, onToggle, onSearch }: { collapsed: boolean; onToggle?: () => void; onSearch: () => void }) {
  const event = useEvent()
  const nav = useSlidingPill<HTMLElement>()
  const { t } = useLocale()
  return (
    <>
      <div aria-hidden className="cn-rail-ground pointer-events-none absolute inset-0 -z-10" />
      <div className={`relative flex items-center gap-3 py-4 ${collapsed ? 'justify-center px-2' : 'px-4'}`}>
        {!collapsed && (
          <Link to="/admin" className="flex min-w-0 flex-1 items-center gap-2.5 text-white no-underline" title={event.nameEn}>
            <img src="/brand/logo-innofest.webp" alt="" className="h-9 w-auto shrink-0" />
            <span className="min-w-0">
              <span className="a-hd block truncate text-[15px] font-bold leading-tight">{t('cn.brand')}</span>
              <span className="a-mono block truncate text-[9.5px] tracking-[.12em] text-[#7FE7FF]">{t('cn.brandSub')}</span>
            </span>
          </Link>
        )}
        {onToggle && (
          <button
            type="button" onClick={onToggle} className="btn-dark btn-sm btn-icon-sm"
            aria-label={t(collapsed ? 'admin.rail.expand' : 'admin.rail.collapse')} aria-pressed={collapsed}
          >
            <span aria-hidden className={`inline-block transition-transform ${collapsed ? 'rotate-180' : ''}`}>‹</span>
          </button>
        )}
      </div>

      <div className={collapsed ? 'flex justify-center px-2 pb-2' : 'px-3 pb-2'}>
        <button type="button" onClick={onSearch} title={collapsed ? t('cn.s.open') : undefined} aria-label={t('cn.s.aria')}
          className={`cn-railsearch flex min-h-10 w-full cursor-pointer items-center gap-2 text-left text-[13.5px] text-white/80 ${collapsed ? 'justify-center px-0' : 'px-3'}`}>
          {SearchIcon}
          {!collapsed && <><span className="min-w-0 flex-1 truncate">{t('cn.s.open')}</span><kbd className="a-mono text-[10.5px] text-white/60">{isMac ? '⌘K' : t('cn.s.key')}</kbd></>}
        </button>
      </div>

      <nav ref={nav} className="cn-rail tab-rail-v min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
        {GROUPS.map((g) => (
          <div key={g.title} className="mb-3">
            {!collapsed && <div className="a-mono px-3 pb-1 pt-2 text-[10px] font-semibold tracking-[.16em] text-[#7FE7FF]/80">{t(g.title).toUpperCase()}</div>}
            {collapsed && <div className="mx-auto my-2 h-px w-6 bg-white/15" />}
            {g.items.map((n) => (
              <NavLink
                key={n.to} to={n.to} end={n.end} title={collapsed ? t(n.label) : undefined}
                target={n.to.startsWith('/admin/print') ? '_blank' : undefined}
                className={({ isActive }) => `relative z-[1] flex items-center gap-3 whitespace-nowrap py-2 text-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7FE7FF]/60 ${collapsed ? 'justify-center px-0' : 'px-3.5'} ${isActive ? 'font-semibold text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}`}
              >
                <span aria-hidden className="shrink-0">{n.icon}</span>
                {!collapsed && <span className="min-w-0 flex-1 truncate">{t(n.label)}</span>}
                {!collapsed && n.away && <span aria-hidden className="shrink-0 text-xs text-white/50">↗</span>}
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className={`mt-auto border-t border-white/10 py-3 ${collapsed ? 'flex justify-center px-2' : 'px-3'}`}>
        <AccountMenu dark up rail={collapsed ? 'icon' : 'full'} />
      </div>
    </>
  )
}

/** Phone: the four places an admin walking the hall needs, and the full menu. */
function BottomBar({ onSearch, onMenu }: { onSearch: () => void; onMenu: () => void }) {
  const { t } = useLocale()
  const item = 'flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 border-0 bg-transparent px-1 !text-[11px] font-semibold leading-tight no-underline cursor-pointer'
  const cls = ({ isActive }: { isActive: boolean }) => `${item} ${isActive ? 'text-[#7FE7FF]' : 'text-white/75'}`
  return (
    <nav aria-label={t('admin.menu')} className="cn-bottombar fixed inset-x-0 bottom-0 z-30 flex pb-[env(safe-area-inset-bottom)] lg:hidden print:hidden">
      <NavLink to="/admin" end className={cls}>{Icon.dashboard}<span>{t('cn.bar.home')}</span></NavLink>
      <NavLink to="/admin/booths" className={cls}>{Icon.booths}<span>{t('cn.bar.booths')}</span></NavLink>
      <button type="button" onClick={onSearch} className={`${item} text-white/75`}><span className="cn-searchfab grid h-9 w-9 place-items-center">{SearchIcon}</span><span>{t('cn.bar.search')}</span></button>
      <NavLink to="/redeem" className={cls}>{Icon.desk}<span>{t('cn.bar.desk')}</span></NavLink>
      <button type="button" onClick={onMenu} className={`${item} text-white/75`}>{Icon.menu}<span>{t('cn.bar.menu')}</span></button>
    </nav>
  )
}

export default function AdminLayout() {
  const loc = useLocation()
  const { t } = useLocale()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState(false)
  const [collapsed, setCollapsed] = useState(readCollapsed)
  const dlg = useRef<HTMLDialogElement>(null)

  useEffect(() => { setOpen(false) }, [loc.pathname])

  // StrictMode double-invokes this; `showModal()` on an open dialog throws, so the guards stay.
  useEffect(() => {
    const d = dlg.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  // Ctrl K / ⌘K, and "/" when no field has focus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))
      if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setSearch(true) }
      else if (e.key === '/' && !typing) { e.preventDefault(); setSearch(true) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function toggleRail() {
    setCollapsed((c) => {
      try { localStorage.setItem(RAIL_KEY, c ? '0' : '1') } catch { /* private window */ }
      return !c
    })
  }
  function openSearch() { setOpen(false); setSearch(true) }

  const here = ALL.find((i) => (i.end ? loc.pathname === i.to : loc.pathname.startsWith(i.to.split('?')[0])))
  const title = here ? t(here.label) : t('admin.title')
  const pages = useMemo<SearchPage[]>(() => GROUPS.flatMap((g) => g.items.map((i) => ({ to: i.to, label: t(i.label), group: t(g.title), icon: i.icon, away: i.away }))), [t])

  return (
    <div className="admin-console flex min-h-full flex-col lg:flex-row">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 bg-page print:hidden"><div className="a-grid" /></div>

      {/* Phone and tablet: a slim top bar for where you are, the bottom bar for getting around. */}
      <header className="cn-topbar fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-2 px-3 text-white lg:hidden">
        <img src="/brand/logo-innofest.webp" alt="" className="h-7 w-auto shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="a-mono truncate text-[9.5px] tracking-[.14em] text-[#7FE7FF]">{t('cn.brand').toUpperCase()}</div>
          <div className="a-hd truncate text-[15px] font-bold leading-tight">{title}</div>
        </div>
        <AccountMenu dark />
      </header>

      <aside className={`cn-aside sticky top-0 hidden h-dvh shrink-0 flex-col self-start text-white isolate transition-[width] duration-200 lg:flex ${collapsed ? 'w-[72px]' : 'w-64'}`}>
        <SideNav collapsed={collapsed} onToggle={toggleRail} onSearch={openSearch} />
      </aside>

      <dialog
        ref={dlg} id="admin-nav" className="nav-drawer" onClose={() => setOpen(false)}
        onClick={(e) => { if (e.target === dlg.current) setOpen(false) }}
      >
        <div className="cn-aside relative isolate flex h-full flex-col overflow-hidden text-white">
          <SideNav collapsed={false} onSearch={openSearch} />
        </div>
      </dialog>

      <main className="on-stage min-w-0 flex-1 px-4 pb-[calc(84px+env(safe-area-inset-bottom))] pt-[4.5rem] lg:px-8 lg:py-6">
        <DataErrors className="mb-4" />
        <Outlet />
      </main>

      <BottomBar onSearch={openSearch} onMenu={() => setOpen(true)} />
      {search && <QuickSearch pages={pages} onClose={() => setSearch(false)} />}
      <AdminHandler />
    </div>
  )
}
