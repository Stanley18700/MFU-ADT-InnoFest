import { useAuth } from '../../lib/auth'
import { useBooths, useEvent, useTiers } from '../../lib/data'
import { Spinner } from '../../components/ui'
import { AgentCard, FilesProgress, NextTarget, rankOf } from '../../components/agency'
import { SurveyBanner } from '../../components/SurveyNudge'
import { HowItWorksLink } from '../../components/Welcome'
import { Transmission } from '../../components/handler'
import { dayOf } from '../../../shared/model'
import { useRewardBooths } from '../../lib/points'
import { useLocale } from '../../lib/locale'

export function tierProgress<T extends { id: string; name: string; thresholdPoints: number }>(points: number, tiers: T[]) {
  const sorted = [...tiers].sort((a, b) => a.thresholdPoints - b.thresholdPoints)
  const reached = sorted.filter((t) => points >= t.thresholdPoints)
  const next: T | null = sorted.find((t) => points < t.thresholdPoints) ?? null
  const prevThreshold = reached.length ? reached[reached.length - 1].thresholdPoints : 0
  const pct = next ? Math.min(1, (points - prevThreshold) / (next.thresholdPoints - prevThreshold)) : 1
  return { sorted, reached, next, pct }
}

export default function Cover() {
  const { profile } = useAuth()
  const tiers = useTiers().filter((t) => t.active)
  const booths = useRewardBooths(useBooths())
  const event = useEvent()
  // `pick` is why booths carry a Thai name at all (spec §1.4).
  const { t, pick } = useLocale()
  if (!profile) return <Spinner />
  const points = profile.points ?? 0
  const { sorted, next } = tierProgress(points, tiers)
  const thresholds = sorted.map((x) => x.thresholdPoints)
  const rank = rankOf(points, thresholds)
  const rankName = (k: typeof rank.key) => t(k === 'senior' ? 'a.rank.senior' : k === 'field' ? 'a.rank.field' : 'a.rank.recruit')
  // The scale the bar is drawn against: the top reward, or every booth if there are no tiers.
  const total = sorted.length ? sorted[sorted.length - 1].thresholdPoints : Math.max(booths.length, 1)

  /*
   * The one thing the tab bar cannot tell you: which booth to walk to. Worth the most, open today,
   * not yet stamped — the same ordering the Stamps route uses, resolved to a single answer.
   */
  const stamped = new Set(profile.stampedBoothIds ?? [])
  const today = dayOf(new Date())
  const nextBooth = booths
    .filter((b) => b.eventId === event.id && !stamped.has(b.id) && (!event.days.includes(today) || b.activeDays.includes(today)))
    .sort((a, b) => b.rewardPoints - a.rewardPoints || a.sortOrder - b.sortOrder)[0]
  const nextRank = next ? rankOf(next.thresholdPoints, thresholds) : null

  return (
    <main className="flex flex-col gap-3 px-4 pt-1">
      <SurveyBanner />
      <AgentCard
        name={profile.displayName} agentId={profile.passportNo ?? ''} rankLabel={rankName(rank.key)} rankIndex={rank.index}
        labels={{ agency: t('a.id.agency'), field: t('a.id.field'), agent: t('a.id.agent'), rank: t('a.id.rank') }}
      />
      <FilesProgress
        points={points} total={total}
        thresholds={sorted.map((x) => ({ at: x.thresholdPoints, label: x.name }))}
        labels={{
          title: t('a.prog.title'),
          toGo: next && nextRank ? t('a.prog.toGo', { n: next.thresholdPoints - points, rank: rankName(nextRank.key) }) : t('a.prog.allDone'),
          unlocked: (name) => t('a.prog.unlocked', { name }),
        }}
      />
      <Transmission text={
        !next ? t('h.cover.top')
          : points === 0 ? t('h.cover.start')
          : t('h.cover.go')
      } />
      {nextBooth ? (
        <div className="mt-1">
          <NextTarget
            to="/mission/files" title={pick(nextBooth.nameEn, nextBooth.nameTh)}
            meta={[nextBooth.shortName, nextBooth.location].filter(Boolean).join(' · ')}
            labels={{ tag: t('a.next.tag'), eyebrow: t('a.next.eyebrow') }}
          />
        </div>
      ) : (
        <div className="a-cut a-edge-line px-4 py-4 text-center text-sm text-ink-soft">
          {stamped.size >= booths.length && booths.length > 0 ? t('v.cover.allStamped') : t('v.cover.nothingToday')}
        </div>
      )}
      <div className="mt-1 text-center"><HowItWorksLink /></div>
    </main>
  )
}
