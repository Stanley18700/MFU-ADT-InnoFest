import { Outlet, useLocation } from 'react-router-dom'
import { DataErrors, LiveDot } from '../../components/ui'
import { AGround, AHeader, AIcon, ATabBar } from '../../components/agency'
import { SurveyNudge } from '../../components/SurveyNudge'
import { VisitorWelcome } from '../../components/Welcome'
import { useOnline } from '../../lib/useOnline'
import { useLocale } from '../../lib/locale'
import type { StringKey } from '../../lib/strings'

const TITLES: Array<[string, StringKey]> = [
  ['/mission/files', 'a.title.files'],
  ['/mission/rewards', 'a.title.rewards'],
  ['/mission/profile', 'a.title.profile'],
  ['/mission', 'a.title.cover'],
]

export default function PassportLayout() {
  const loc = useLocation()
  const online = useOnline()
  const { t } = useLocale()
  const title = TITLES.find(([p]) => loc.pathname.startsWith(p))?.[1] ?? 'a.title.cover'
  return (
    <AGround className="mx-auto max-w-md" grid="h-[300px]">
      <div style={{
        /*
         * The bar is its own height plus the band the scan circle is raised into, and the circle
         * overhangs that band by half its diameter. This clears all of it.
         */
        paddingBottom: 'calc(8rem + env(safe-area-inset-bottom))',
      }}>
        {/*
          * The language switch sits in every tab's header, not only in Profile: half the hall is
          * Thai-speaking and most of them will never open Profile. Sticky, so it stays in reach
          * down a long list of files.
          */}
        <AHeader lead="mark" title={t(title)} sticky />
        {/*
          * Losing the network says nothing on its own — Firestore serves the cache — so the
          * passport would quietly show old stamps as current. Said plainly, and only then.
          */}
        {!online && (
          <div className="a-cut a-edge-line mx-4 mt-1 px-4 py-3">
            <LiveDot state="offline" size="sm">{t('v.offline')}</LiveDot>
            <p className="mt-1 text-xs text-ink-soft">{t('v.offline.note')}</p>
          </div>
        )}
        <DataErrors agent className="mx-4 mt-3" />
        <div key={loc.pathname} className="page-in">
          <Outlet />
        </div>
        {/* The festival survey's asks, over whichever tab is open. Outside the keyed page so a
            tab change does not re-run its once-only logic. */}
        <SurveyNudge />
        {/* First-time explanation; reopened by the cover's "How it works". */}
        <VisitorWelcome />
        <ATabBar scanTo="/scan" scanLabel={t('a.scan.label')} tabs={[
          { to: '/mission', label: t('v.tab.cover'), icon: AIcon.cover, end: true },
          { to: '/mission/files', label: t('v.tab.stamps'), icon: AIcon.files },
          { to: '/mission/rewards', label: t('v.tab.prize'), icon: AIcon.rewards },
          { to: '/mission/profile', label: t('v.tab.profile'), icon: AIcon.profile },
        ]} />
      </div>
    </AGround>
  )
}
