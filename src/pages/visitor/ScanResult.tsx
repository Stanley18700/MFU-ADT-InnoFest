import { useEffect, useRef, useState } from 'react'
import { Transmission } from '../../components/handler'
import { Link } from 'react-router-dom'
import { doc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../lib/auth'
import { api } from '../../lib/api'
import { useBooths, useDoc, useEvent, useTiers } from '../../lib/data'
import { RATING_COMMENT_MAX, RATING_CRITERIA, tierEligible, type RatingCriterion } from '../../../shared/model'
import { EVENT_SURVEY_ID } from '../../../shared/model'
import { useFestivalSurvey } from '../../lib/festivalSurvey'
import { useLocale } from '../../lib/locale'
import { useBodyScrollLock } from '../../lib/useBodyScrollLock'
import { AIcon, ALang, Eyebrow, GhostBtn, GoldTag, InkTag, NextTarget, PrimaryBtn, pad3, rankOf } from '../../components/agency'
import { haptic, useCountUp } from '../../components/game'
import { Notice } from '../../components/ui'
import type { ScanResult } from '../../../shared/model'

export function ScanResultView({ result, onRetry }: { result: ScanResult; onRetry: () => void }) {
  const { t, pick } = useLocale()
  const booths = useBooths()
  const tiers = useTiers().filter((x) => x.active)
  const event = useEvent()
  const { profile } = useAuth()
  const booth = 'boothId' in result ? booths.find((b) => b.id === result.boothId) : undefined
  /*
   * Held here, not inside the card, because it is what releases the two buttons below: the
   * rating is the one thing standing between a stamp and the next booth. `RatingCard` sets it
   * the moment there is nothing left to ask — a score sent, a booth already rated, or a call
   * that failed — so the lock can never outlive a reason for it.
   */
  const [done, setDone] = useState(false)
  const top = Math.max(0, ...tiers.map((x) => x.thresholdPoints))

  const head = (eyebrow: string) => (
    <header className="flex h-16 items-center justify-between gap-2 px-4">
      <div className="flex min-w-0 items-center gap-1">
        <Link to="/mission" aria-label={t('v.close')} className="-ml-3 flex h-11 w-11 shrink-0 items-center justify-center text-ink focus-visible:outline-[3px] focus-visible:outline-[#00B4EE]">{AIcon.close}</Link>
        <Eyebrow pulse>{eyebrow}</Eyebrow>
      </div>
      <ALang />
    </header>
  )

  if (result.status === 'success') {
    const name = booth ? pick(booth.nameEn, booth.nameTh) : ''
    // Only rewards this visitor can actually collect count as "unlocked" (MFU333 is MFU students only).
    const claimableUnlocked = result.unlockedTierIds.filter((id) => { const tr = tiers.find((x) => x.id === id); return !tr || tierEligible(tr, id, profile ?? {}) }).length
    return (
      <div className="page-in flex flex-col">
        {head(t('a.res.eyebrow'))}
        <div className="flex flex-col gap-3 px-4 pb-8">
          {/* The decrypt: the file's scrambled title flickers once and resolves, a foil sheen
              crosses it, and then it holds still. */}
          <div className="a-cut a-edge-neon a-fill-foil a-sheen a-glow-soft px-4 py-3.5">
            <span aria-hidden className="sheen" />
            <div className="flex items-center justify-between gap-2">
              <span className="a-label text-[var(--a-blue-deep)]">{booth?.shortName ? `${booth.shortName} · ` : ''}{t('a.res.decrypted')}</span>
              <InkTag>{AIcon.check}{t('a.file.recovered')}</InkTag>
            </div>
            <div className="a-hd a-flicker mt-2 text-[22px] font-bold leading-tight text-ink">{name}</div>
            {booth?.hostUnit && <div className="mt-1 text-sm text-[#33415F]">{booth.hostUnit}</div>}
          </div>
          <ScoreGain awarded={result.pointsAwarded} points={result.points} top={top}
            thresholds={tiers.map((x) => x.thresholdPoints)}
            summary={t('v.res.summary', { booth: name, points: result.points, stamps: result.stampCount })} />
          {claimableUnlocked > 0 && (
            /* The whole card is the way to the reward: brackets and an arrow say so. */
            <Link to="/mission/rewards" className="a-brk a-glow block text-ink no-underline focus-visible:outline-[3px] focus-visible:outline-offset-4 focus-visible:outline-[#00B4EE]">
              <div className="a-cut a-edge-neon a-fill-foil flex items-center gap-3 px-3.5 py-3">
                <GoldTag pop>{AIcon.check}{t('a.res.unlockedTag')}</GoldTag>
                <span className="min-w-0 flex-1 text-sm font-medium">{t('v.res.unlockedTap')}</span>
                <span aria-hidden className="a-cut a-cut-s a-solid a-fill-neon grid h-10 w-10 shrink-0 place-items-center text-white">{AIcon.arrow}</span>
              </div>
            </Link>
          )}
          <Transmission tone="ink" text={claimableUnlocked > 0 ? t('h.res.unlocked') : t('h.res.ok')} />
          {/* Asked only once the stamp is safely in the passport, and never in the way of it. */}
          <RatingCard boothId={result.boothId} onDone={() => setDone(true)} />
          <div className="mt-3 flex flex-col gap-3">
            <PrimaryBtn to="/mission/files" disabled={!done}>{t('v.res.myStamps')}</PrimaryBtn>
            <GhostBtn onClick={onRetry} disabled={!done} icon={AIcon.scan}>{t('v.res.scanAnother')}</GhostBtn>
          </div>
        </div>
      </div>
    )
  }
  if (result.status === 'already') {
    // The way forward from a duplicate: progress so far and the next booth worth walking to.
    const have = new Set(profile?.stampedBoothIds ?? [])
    const live = booths.filter((b) => b.active && (!event.id || b.eventId === event.id))
    const nextBooth = live.filter((b) => !have.has(b.id)).sort((a, b) => (b.points ?? 0) - (a.points ?? 0) || a.sortOrder - b.sortOrder)[0]
    return (
      <div className="page-in flex flex-col">
        {head(t('g.e.dupEyebrow'))}
        <div className="flex flex-col gap-3 px-4 pb-8">
          <GameAlert tone="amber" code={t('g.e.dupCode')} glyph="+0" title={t('v.res.already')}>
            {t('v.res.alreadyNote', { booth: booth ? pick(booth.nameEn, booth.nameTh) : '' })}
          </GameAlert>
          {booth && (
            <div className="relative">
              <div className="a-cut a-edge-soft a-fill-foil flex items-center gap-3 py-3 pl-3.5 pr-[112px]">
                <span className="a-cut a-cut-s a-solid a-fill-neon grid h-10 w-10 shrink-0 place-items-center text-white">{AIcon.file}</span>
                <div className="min-w-0">
                  <div className="a-hd truncate text-[17px] font-bold">{pick(booth.nameEn, booth.nameTh)}</div>
                  <div className="a-mono text-xs text-[#33415F]">{booth.shortName}</div>
                </div>
              </div>
              {/* Stamped onto the card: it is already in the archive. */}
              <span aria-hidden className="g-stamp">{t('g.e.archived')}</span>
            </div>
          )}
          <div className="a-cut a-solid a-fill-tint flex items-center justify-between gap-3 px-3.5 py-2.5">
            <span className="a-label text-[var(--a-muted)]">{t('a.prog.title')}</span>
            <span className="a-mono text-sm text-[var(--a-muted)]"><b className="text-[17px] font-semibold text-[#1450E6]">{pad3(have.size)}</b>/{live.length} · {t('g.e.left', { n: Math.max(0, live.length - have.size) })}</span>
          </div>
          {nextBooth && (
            <NextTarget to="/mission/files" title={pick(nextBooth.nameEn, nextBooth.nameTh)}
              meta={[nextBooth.shortName, nextBooth.location].filter(Boolean).join(' · ')}
              labels={{ tag: t('a.next.tag'), eyebrow: t('a.next.eyebrow') }} />
          )}
          <Transmission text={t('h.res.already')} />
          <div className="mt-2 flex flex-col gap-3">
            <PrimaryBtn onClick={onRetry} icon={AIcon.scan}>{t('v.res.scanAnother')}</PrimaryBtn>
            <GhostBtn to="/mission/files">{t('v.res.whatsLeft')}</GhostBtn>
          </div>
        </div>
      </div>
    )
  }
  const map = {
    expired: { tone: 'amber' as const, code: t('g.e.expCode'), glyph: '00:00', title: t('g.e.expTitle'), text: t('v.res.expired') },
    invalid: { tone: 'red' as const, code: t('g.e.badCode'), glyph: '#?!', title: t('g.e.badTitle'), text: t('v.res.invalid') },
    rate_limited: { tone: 'amber' as const, code: t('g.e.fastCode'), glyph: 'WAIT', title: t('g.e.fastTitle'), text: t('v.res.tooFast') },
    not_registered: { tone: 'blue' as const, code: t('g.e.regCode'), glyph: 'ID?', title: t('g.e.regTitle'), text: t('v.res.notRegistered') },
  }[result.status]
  return (
    <div className="page-in flex flex-col">
      {head(t('v.scan.title'))}
      <div className="flex flex-col gap-4 px-4 pb-8">
        <GameAlert tone={map.tone} code={map.code} glyph={map.glyph} title={map.title}>{map.text}</GameAlert>
        {result.status === 'rate_limited' && <Cooldown seconds={5} />}
        {result.status !== 'not_registered' && <Transmission text={t('h.res.error')} />}
        {result.status === 'not_registered'
          ? <PrimaryBtn to="/join">{t('v.res.createPassport')}</PrimaryBtn>
          : <PrimaryBtn onClick={onRetry} icon={AIcon.scan}>{t('v.res.tryAgain')}</PrimaryBtn>}
      </div>
    </div>
  )
}

/**
 * A scan that did not count, told like a game: a dark alert panel with hazard stripes that shakes
 * in, an error code, a big glyph (+0, 00:00, #?!) and the title glitching once. One short error
 * buzz on Android. Colour says how bad: amber = try again, red = wrong code, blue = sign up first.
 */
function GameAlert({ tone, code, glyph, title, children }: { tone: 'amber' | 'red' | 'blue'; code: string; glyph: string; title: string; children: React.ReactNode }) {
  useEffect(() => { haptic([60, 40, 60]) }, [])
  return (
    <section role="alert" className={`g-alert g-alert-${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="a-mono text-[11px] font-semibold tracking-[.16em] g-alert-ink">{code}</span>
        <span aria-hidden className="g-alert-dot" />
      </div>
      <div className="mt-2.5 flex items-center gap-3.5">
        <span aria-hidden className="g-alert-glyph a-mono">{glyph}</span>
        <h1 className="g-alert-title a-hd m-0 text-[22px] font-bold leading-tight text-white">{title}</h1>
      </div>
      <p className="mb-0 mt-2.5 text-[14px] leading-snug text-[#D6E0F7]">{children}</p>
    </section>
  )
}

/** "Too fast": a short cooldown bar, so waiting reads as the scanner recharging. */
function Cooldown({ seconds }: { seconds: number }) {
  const { t } = useLocale()
  const [left, setLeft] = useState(seconds)
  useEffect(() => { const id = window.setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000); return () => window.clearInterval(id) }, [])
  return (
    <div className="a-cut a-solid a-fill-tint px-3.5 py-2.5">
      <div className="flex items-center justify-between"><span className="a-label">{t('g.e.recharge')}</span><span className="a-mono text-sm font-semibold text-[#1450E6]">{left > 0 ? `${left}s` : 'READY'}</span></div>
      <div className="a-bar mt-1.5 h-[6px]"><span className="fill" style={{ width: `${((seconds - left) / seconds) * 100}%` }} /></div>
    </div>
  )
}

/**
 * How was this booth? A score, and a sentence if they want to leave one.
 *
 * Score and comment go up in **one** call, which is why the star does not submit on its own: a
 * rating is anonymous and cannot be found again from the marker, so there is no second write to
 * attach a comment to afterwards. Two taps for someone with nothing to add, which is the price
 * of not silently discarding what the other kind of visitor typed.
 *
 * Three things stop "required" from becoming a trap in a hall with bad signal:
 *
 *  - someone who already rated this booth is released at once and never sees the card;
 *  - a failed send releases them too, with an apology rather than a locked screen — a lost data
 *    point is cheaper than a visitor stranded on a dead page;
 *  - if the marker cannot be read at all, they are released rather than held behind a query.
 *
 * `boothRated` is read straight from Firestore rather than through a callable: this renders
 * mid-scan, and the rules already let a visitor read their own marker and nothing else.
 */
function RatingCard({ boothId, onDone }: { boothId: string; onDone: () => void }) {
  const { t } = useLocale()
  const { user } = useAuth()
  const { data: rated, loading, error } = useDoc(user ? doc(db, 'boothRated', `${user.uid}_${boothId}`) : null, [user?.uid, boothId])

  const [scores, setScores] = useState<Partial<Record<RatingCriterion, number>>>({})
  const complete = RATING_CRITERIA.every((k) => scores[k])
  const [comment, setComment] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  // Guards the double tap and the tap that lands while the first call is still open.
  const inFlight = useRef(false)

  // Nothing to ask: rated on an earlier scan, or we cannot tell and will not hold them for it.
  const skip = !!rated || !!error || !user
  useEffect(() => { if (skip) onDone() }, [skip, onDone])

  /*
   * The sheet waits for the stamp to land. It covers the visa and the "+27 points" — the one
   * moment of the whole app that is purely a reward — so it comes up just after the stamp has
   * animated in and the figure has been read, not on top of it. Long enough to see it, short
   * enough that nobody starts walking away first.
   */
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const id = setTimeout(() => setReady(true), 1400)
    return () => clearTimeout(id)
  }, [])

  const send = async () => {
    if (inFlight.current || !complete) return
    inFlight.current = true
    setBusy(true)
    const text = comment.trim()
    try {
      await api.rateBooth({ boothId, scores: scores as Record<RatingCriterion, number>, ...(text ? { comment: text } : {}) })
      setSent(true)
      onDone()
    } catch (e) {
      console.warn('rateBooth failed', e)
      setFailed(true)
      onDone()
    } finally {
      setBusy(false)
      inFlight.current = false
    }
  }

  if (skip || loading || !ready) return null

  if (failed) {
    return <div className="w-full"><Notice tone="amber">{t('v.rate.failed')}</Notice></div>
  }

  if (sent) {
    const avg = RATING_CRITERIA.reduce((n, k) => n + (scores[k] ?? 0), 0) / RATING_CRITERIA.length
    const stars = Math.round(avg)
    return (
      <div className="a-cut a-solid a-fill-tint flex items-center justify-between gap-3 px-4 py-3">
        <span className="a-hd text-[17px] font-bold">{t('v.rate.thanks')}</span>
        <span className="flex gap-1" role="img" aria-label={t('v.rate.ratedAvg', { n: avg.toFixed(1) })}>{[1, 2, 3, 4, 5].map((n) => <span key={n}>{AIcon.star(n <= stars, 22)}</span>)}</span>
      </div>
    )
  }

  /*
   * Asked in a sheet over the screen rather than in the column, where it sat between the stamp
   * and the two buttons it gates and read as one more thing to scroll past. It is the same
   * question and the same gate — the buttons were already locked until it was answered — but in
   * front of the visitor, where a question that must be answered belongs. The thanks and the
   * failure above stay inline: once there is nothing left to ask, an overlay is just in the way.
   */
  return <RatingSheet {...{ scores, setScore: (k: RatingCriterion, n: number) => setScores((s) => ({ ...s, [k]: n })), complete, comment, setComment, busy, send }} />
}

function RatingSheet({
  scores, setScore, complete, comment, setComment, busy, send,
}: {
  scores: Partial<Record<RatingCriterion, number>>; setScore: (k: RatingCriterion, n: number) => void
  complete: boolean
  comment: string; setComment: (s: string) => void
  busy: boolean; send: () => Promise<void>
}) {
  const { t } = useLocale()
  useBodyScrollLock(true)
  return (
    <div className="scrim-in fixed inset-0 z-40 flex items-end justify-center bg-[rgb(10_19_64/.5)] p-3">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('v.rate.title')}
        className="a-cut a-cut-xl a-edge-neon sheet-in max-h-[92dvh] w-full max-w-md overflow-y-auto px-5 pt-3 text-left"
        style={{ paddingBottom: 'max(.75rem, env(safe-area-inset-bottom))' }}
      >
        <h2 className="a-hd m-0 text-[20px] font-bold">{t('v.rate.title')}</h2>
        <p className="mb-0 mt-0.5 text-sm text-[#33415F]">{t('v.rate.lead')}</p>

        {/* Five rows, label over stars: the stars get the full width, so each target stays ~44px+
            on the narrowest phone and the whole sheet still fits without scrolling. */}
        <div className="mt-2 space-y-1">
          {RATING_CRITERIA.map((k) => {
            const label = t(`v.rate.c.${k}` as 'v.rate.c.design')
            const v = scores[k] ?? 0
            return (
              <div key={k}>
                <div className="text-[13px] font-semibold text-[#1B2748]">{label}</div>
                <div className="flex gap-1" role="radiogroup" aria-label={t('v.rate.critAria', { c: label })}>
                  {[1, 2, 3, 4, 5].map((n) => {
                    const on = n <= v
                    return (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={v === n}
                        aria-label={n === 1 ? t('v.rate.star', { n }) : t('v.rate.stars', { n })}
                        disabled={busy}
                        onClick={() => setScore(k, n)}
                        className={`a-cut a-cut-s grid h-11 flex-1 cursor-pointer place-items-center border-0 bg-transparent transition-transform active:scale-90 disabled:opacity-50 ${on ? 'a-edge-neon' : 'a-edge-strong'}`}
                        style={{
                          // Always the SOLID star. Outline-against-filled is the distinction that
                          // disappears in sunlight; a lit blue star against a flat grey one does not.
                          color: on ? '#1D5BFF' : '#9AA6BF',
                          ['--fill' as string]: on ? '#EEF3FF' : '#F7F9FC',
                          filter: on ? 'drop-shadow(0 0 5px rgb(0 200 255 / .4))' : undefined,
                        }}
                      >
                        {/*
                          * The size lives on the SPAN, not the button. `input, select, textarea, button
                          * { font: inherit }` (index.css) is unlayered, so it beats every layered
                          * `text-*` utility and silently resets a button's font-size to 16px.
                          */}
                        <span aria-hidden className="text-[26px] leading-none">★</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        <label className="mt-2 block">
          <span className="a-lbl">{t('v.rate.comment')}</span>
          <textarea
            className="a-field"
            rows={1}
            maxLength={RATING_COMMENT_MAX}
            value={comment}
            disabled={busy}
            onChange={(e) => setComment(e.target.value.slice(0, RATING_COMMENT_MAX))}
            placeholder={t('v.rate.placeholder')}
          />
        </label>

        <PrimaryBtn className="mt-2.5" onClick={() => void send()} disabled={busy || !complete} loading={busy}>
          {busy ? t('v.rate.sending') : !complete ? t('v.rate.pickAll') : t('v.rate.send')}
        </PrimaryBtn>
      </div>
    </div>
  )
}

/**
 * The score moment after a recovery, played like a game: "+1" rises off the gold tile, the new
 * total counts up from the old one and the bar fills with it, the phone buzzes once — and if this
 * scan moved the agent up a rank, a RANK UP banner slams in.
 */
function ScoreGain({ awarded, points, top, thresholds, summary }: { awarded: number; points: number; top: number; thresholds: number[]; summary: string }) {
  // Rewards stay sealed until the festival survey is answered: the button goes there instead.
  const fs = useFestivalSurvey()
  const { t } = useLocale()
  const before = Math.max(0, points - awarded)
  const shown = useCountUp(points, { from: before, ms: 900 })
  const r0 = rankOf(before, thresholds), r1 = rankOf(points, thresholds)
  const rankName = (k: typeof r1.key) => t(k === 'senior' ? 'a.rank.senior' : k === 'field' ? 'a.rank.field' : 'a.rank.recruit')
  useEffect(() => { haptic(r1.index > r0.index ? [30, 60, 30, 60, 60] : [20, 50, 20]) }, [])  // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div className="flex items-stretch gap-3">
        <span className="relative">
          <span className="a-cut a-solid a-fill-gold a-pop a-hd grid h-full w-[62px] place-items-center text-2xl font-bold">+{awarded}</span>
          <span aria-hidden className="g-float text-lg">+{awarded}</span>
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <span className="a-label text-[var(--a-muted)]">{t('a.res.newTotal')}</span>
            <span><span className="a-mono a-neon-text text-[28px] font-semibold" aria-label={String(points)}>{pad3(shown)}</span>{top > 0 && <span className="a-mono text-base text-[var(--a-muted)]">/{top}</span>}</span>
          </div>
          {top > 0 && <div className="a-bar mt-1 h-[6px]"><span className="fill !transition-none" style={{ width: `${Math.min(100, (shown / top) * 100)}%` }} /></div>}
          <div className="mt-1 text-xs text-[var(--a-muted)]">{summary}</div>
        </div>
      </div>
      {r1.index > r0.index && (
        <div role="status" className="g-rankup a-cut a-solid a-fill-gold flex items-center justify-between gap-3 px-4 py-3">
          <span aria-hidden className="g-shine" />
          <span className="a-mono text-[13px] font-bold tracking-[.18em]">{t('g.rankUp')}</span>
          <span className="a-hd text-lg font-bold">{rankName(r1.key)}</span>
        </div>
      )}
      {/* Crossing the first reward (50) unlocks the agent photo: one tap straight into the camera. */}
      {thresholds.length > 0 && before < Math.min(...thresholds) && points >= Math.min(...thresholds) && (
        fs.owed
          ? <PrimaryBtn to={`/survey/${EVENT_SURVEY_ID}`}>{t('hx.a.debrief')}</PrimaryBtn>
          : <PrimaryBtn to="/mission/rewards?photo=1" icon={AIcon.camera}>{t('p.cta')}</PrimaryBtn>
      )}
    </>
  )
}
