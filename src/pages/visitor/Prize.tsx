import { useEffect, useState } from 'react'
import { Transmission } from '../../components/handler'
import { useAuth } from '../../lib/auth'
import { ms, useMyUnlocks, useTiers } from '../../lib/data'
import { EVENT_SURVEY_ID, minuteToHHMM } from '../../../shared/model'
import { prizeStock, usePrizeSession } from '../../lib/prizeSession'
import { useFestivalSurvey } from '../../lib/festivalSurvey'
import { api } from '../../lib/api'
import { setServerTime } from '../../lib/serverClock'
import { QR } from '../../components/QR'
import { BoardingPass } from '../../components/BoardingPass'
import { Spinner, fmt } from '../../components/ui'
import { AIcon, GoldTag, InkTag, LockedTag, PrimaryBtn, pad3, rankOf } from '../../components/agency'
import { APP_ORIGIN } from '../../lib/firebase'
import { useLocale } from '../../lib/locale'

function useRedemptionCode(enabled: boolean) {
  const [state, setState] = useState<{ code: string; payload: string; expiresAt: number; period: number } | null>(null)
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!enabled) return
    let stop = false
    let timer: ReturnType<typeof setTimeout>
    const load = async () => {
      try {
        const r = await api.redemptionCode({})
        if (stop) return
        setServerTime(r.serverTime)
        const skew = r.serverTime - Date.now()
        const periodMs = r.period * 1000
        const expiresAt = (r.counter + 1) * periodMs - skew
        setState({ code: r.code, payload: r.payload, expiresAt, period: r.period })
        timer = setTimeout(load, Math.max(500, expiresAt - Date.now() + 150))
      } catch (e) {
        console.warn(e)
        timer = setTimeout(load, 5000)
      }
    }
    void load()
    const tick = setInterval(() => setNow(Date.now()), 250)
    return () => { stop = true; clearTimeout(timer); clearInterval(tick) }
  }, [enabled])
  return state ? { ...state, secondsLeft: Math.max(0, Math.ceil((state.expiresAt - now) / 1000)) } : null
}

export default function Prize() {
  const { t } = useLocale()
  const { profile } = useAuth()
  const tiers = useTiers().filter((t) => t.active).sort((a, b) => a.thresholdPoints - b.thresholdPoints)
  const unlocks = useMyUnlocks(profile?.id)
  const { active: activeSession, next: nextSession } = usePrizeSession()
  const anyUnlockedUnredeemed = unlocks.some((u) => !u.redeemedAt && !u.voidedAt) || unlocks.some((u) => !!u.voidedAt)
  /*
   * The festival survey comes before the gift (organisers' decision, 15 Sep): while it is
   * gating the gift (see `gateGift`) and this visitor has not answered, the QR is withheld and the survey card takes
   * its place. `loading` keeps the QR from flashing for the half-second before the two survey
   * documents arrive. Points are never touched by this — only the moment of hand-over is.
   */
  const fs = useFestivalSurvey()
  const gated = anyUnlockedUnredeemed && (fs.loading || (fs.gate && !fs.taken))
  const code = useRedemptionCode(anyUnlockedUnredeemed && !gated)
  if (!profile) return <Spinner />
  const points = profile.points ?? 0

  // The first tier still out of reach is the one this page is actually about.
  const nextId = tiers.find((t) => points < t.thresholdPoints && !unlocks.some((u) => u.tierId === t.id && !u.voidedAt))?.id

  const rank = rankOf(points, tiers.map((x) => x.thresholdPoints))
  const rankName = t(rank.key === 'senior' ? 'a.rank.senior' : rank.key === 'field' ? 'a.rank.field' : 'a.rank.recruit')
  const top = tiers[tiers.length - 1]?.thresholdPoints ?? 0

  return (
    <main className="flex flex-col gap-3 px-4 pt-1">
      <div className="a-cut a-solid a-fill-tint flex items-center justify-between gap-3 px-3.5 py-2.5">
        <span className="a-label text-[var(--a-muted)]">{t('a.rewards.points')}</span>
        <span className="a-mono text-sm text-[var(--a-muted)]"><b className="text-[17px] font-semibold text-[#1450E6]">{pad3(points)}</b>{top ? `/${top}` : ''} · {rankName}</span>
      </div>

      {anyUnlockedUnredeemed
        ? <Transmission text={t('h.rewards.ready')} />
        : tiers.length > 0 && points < (tiers[0]?.thresholdPoints ?? 0) && <Transmission text={t('h.rewards.locked', { n: tiers[0].thresholdPoints })} />}
      <FeedbackCard gate={anyUnlockedUnredeemed && fs.gate} />
      {anyUnlockedUnredeemed && !gated && (
        /* One code for every unlocked reward: the desk sees which tiers are waiting when it scans. */
        <section className="a-cut a-edge-neon a-fill-foil a-glow-soft px-4 pb-4 pt-3.5">
          <div className="flex items-center justify-between gap-2">
            <GoldTag>{AIcon.check}{t('a.rewards.ready')}</GoldTag>
            <span className="a-label text-[var(--a-blue-deep)]">{t('v.prize.visa')}</span>
          </div>
          <div className="mt-3 flex items-center gap-3.5">
            <div className="shrink-0 bg-white p-2">
              {code ? <QR value={`${APP_ORIGIN}/r/${code.payload}`} size={148} /> : <div className="grid h-[148px] w-[148px] place-items-center text-center text-xs text-ink-soft">{t('v.prize.preparing')}</div>}
            </div>
            {/* The desk can also type these two: the code alone cannot name a visitor (§4.4). */}
            <div className="min-w-0">
              <div className="a-label text-[var(--a-muted)]">{t('a.rewards.agentId')}</div>
              <div className="a-mono text-[15px] font-semibold text-ink">{profile.passportNo}</div>
              <div className="a-mono mt-2 whitespace-nowrap text-lg font-semibold tracking-[.12em] text-ink">{code ? code.code.slice(0, 4) + ' ' + code.code.slice(4) : '···· ····'}</div>
              <p className="mb-0 mt-1.5 text-xs leading-snug text-[#33415F]">{t('v.prize.refresh', { n: code?.secondsLeft ?? '–' })}</p>
            </div>
          </div>
        </section>
      )}

      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {/* `tier`, not `t` — `t` is the translator now, and the old name shadowed it. */}
        {tiers.map((tier) => {
          const u = unlocks.find((x) => x.tierId === tier.id)
          const unlocked = points >= tier.thresholdPoints || (!!u && !u.voidedAt)
          const redeemed = !!u?.redeemedAt && !u?.voidedAt
          const isNext = tier.id === nextId
          // Per-session stock where the tier has it, the single event pool where it does not.
          // `closed` is not `gone` — the desk being shut says nothing about whether there are
          // gifts left — so the state is named rather than inferred from a number.
          const perSession = typeof tier.stockPerSession === 'number'
          const stock = prizeStock(tier, activeSession)
          /*
           * `session.label` is admin-set and single-language, so the two default windows are
           * named properly; anything an organiser adds by hand falls back to their wording.
           */
          const sessionName = !activeSession ? ''
            : activeSession.session.id === 'am' ? t('v.prize.sessionAm')
            : activeSession.session.id === 'pm' ? t('v.prize.sessionPm')
            : activeSession.session.label.toLowerCase()
          const redeemedAt = ms(u?.redeemedAt)
          // Foil = earned (ready), grey = still locked, a plain card once it is in your hands.
          const shell = redeemed ? 'a-edge-line' : unlocked ? 'a-edge-neon a-fill-foil' : 'a-edge-line a-fill-muted'
          return (
            <li key={tier.id} className={isNext ? 'a-brk' : ''}><div className={`a-cut ${shell} px-4 py-3.5`}>
              <div className="flex items-center justify-between gap-3">
                {redeemed ? <InkTag>{AIcon.check}{t('v.prize.collected')}</InkTag>
                  : unlocked ? <GoldTag>{AIcon.check}{t('a.rewards.ready')}</GoldTag>
                  : <LockedTag><span className="scale-75">{AIcon.lock}</span>{t('a.rewards.locked')}</LockedTag>}
                <span className="a-mono text-xs font-semibold text-[#33415F]">{t('v.stamps.pts', { n: tier.thresholdPoints })}</span>
              </div>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="a-hd m-0 text-[19px] font-bold leading-tight text-ink">{tier.name}</h2>
                  <p className="mb-0 mt-0.5 text-sm text-[#33415F]">{tier.reward}</p>
                  {tier.grantsDrawEntry && <p className="mb-0 mt-1 text-xs font-semibold text-[#1450E6]">{t('v.prize.drawEntry')}</p>}
                </div>
                {redeemed && redeemedAt && (
                  <div className="shrink-0 text-right">
                    <div className="a-label text-[var(--a-muted)]">{t('a.rewards.time')}</div>
                    <div className="a-mono text-[22px] font-semibold">{new Date(redeemedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })}</div>
                  </div>
                )}
              </div>
              {!unlocked && (
                <div className="mt-3">
                  <div className="flex items-baseline justify-between">
                    <span className="a-mono text-[22px] font-semibold text-ink">{fmt(tier.thresholdPoints - points)}</span>
                    <span className="text-xs text-[#33415F]">{t('a.rewards.toGo')}</span>
                  </div>
                  <div className="a-bar mt-1.5 h-[6px]"><span className="fill" style={{ width: `${Math.min(100, (points / tier.thresholdPoints) * 100)}%` }} /></div>
                </div>
              )}
              {/*
                * Stock is the organisers' fact, not yours, so it sits apart from your own gap. It
                * also renders while the desk is shut: "how many are left" is the question people
                * open this page to ask, before as well as during.
                */}
              {/* A reward with no real limit (the MFU333 credit, stocked far past attendance)
                  has no count worth showing. */}
              {!redeemed && stock.capacity > 0 && stock.capacity < 10000 && (
                <div className="mt-3 border-t border-[#D2DCEE] pt-2.5">
                  {stock.state === 'closed' ? (
                    <p className="m-0 text-sm text-[#33415F]">
                      {perSession
                        ? nextSession
                          ? t('v.prize.allowanceClosed', { n: fmt(stock.capacity), time: minuteToHHMM(nextSession.session.startMinute) })
                          : t('v.prize.allowanceEnded', { n: fmt(stock.capacity) })
                        : nextSession
                          ? t('v.prize.collectFrom', { time: minuteToHHMM(nextSession.session.startMinute) })
                          : t('v.prize.deskClosed')}
                    </p>
                  ) : (
                    <>
                      <p className={`m-0 text-sm font-medium ${stock.state === 'gone' ? 'text-danger-text' : stock.low ? 'text-warn-text' : 'text-ink'}`}>
                        {stock.state === 'gone'
                          ? (tier.outOfStockNoteEn || t('v.prize.runOut'))
                          : perSession && activeSession
                            ? t('v.prize.leftOfSession', { n: fmt(stock.remaining), capacity: fmt(stock.capacity), session: sessionName })
                            : t('v.prize.leftOf', { n: fmt(stock.remaining), capacity: fmt(stock.capacity) })}
                      </p>
                      {/* The bar repeats the sentence, never replaces it: the number has to survive
                          a screen reader and a colour-blind eye on its own. */}
                      <div
                        role="progressbar" aria-label={t('v.prize.stockLabel')} aria-valuemin={0} aria-valuemax={stock.capacity}
                        aria-valuenow={stock.state === 'gone' ? 0 : stock.remaining}
                        className="mt-1.5 h-1.5 overflow-hidden bg-[#E3EAF7]"
                      >
                        <div
                          className={`h-full transition-[width] duration-500 ${stock.state === 'gone' ? 'bg-danger' : stock.low ? 'bg-warn' : ''}`}
                          style={{ width: stock.state === 'gone' ? '0%' : `${Math.max(4, Math.round((stock.remaining / stock.capacity) * 100))}%`, ...(stock.state !== 'gone' && !stock.low ? { background: 'var(--a-gold)' } : {}) }}
                        />
                      </div>
                    </>
                  )}
                  {/* Points outlive a session. Someone who qualifies at 11:58 with none left must
                      be told that plainly, or they will assume they missed it and go home. */}
                  {unlocked && perSession && stock.state === 'gone' && nextSession && (
                    <p className="mb-0 mt-1.5 text-xs text-[#33415F]">{t('v.prize.pointsStay', { time: minuteToHHMM(nextSession.session.startMinute) })}</p>
                  )}
                </div>
              )}
            </div></li>
          )
        })}
      </ul>

      {!anyUnlockedUnredeemed && <div className="a-cut a-solid a-fill-tint px-4 py-3 text-sm text-ink">{t('v.prize.codeLater')}</div>}
    </main>
  )
}

/**
 * The festival's feedback survey, on the page a visitor opens to collect a prize.
 *
 * In the app, not a link out. The form this replaces was a Google Form that asked for a Google
 * sign-in, which would have shut out every General Public visitor at the one moment they were
 * being asked what they thought — and would have sent them to another site to say it. Here the
 * visitor is already signed in, the questions are the same ones, and the answers land next to
 * everything else the festival knows.
 *
 * Since 15 Sep it also stands before the gift: the organisers want every collector's answers,
 * so while the survey is published and unanswered the Prize page shows this card where the
 * entry visa would be (`gate`), and the QR appears the moment the answers are in. Points are
 * untouched either way — the survey decides when the hand-over happens, never whether.
 *
 * Once answered, the card becomes the boarding pass: the keepsake PNG for having taken part.
 *
 * `surveys/{EVENT_SURVEY_ID}` is read straight from Firestore — any signed-in visitor may read
 * a survey, and this renders on a page they are already waiting on. Nothing shows until it is
 * published, so an unfinished form cannot reach anybody, and nothing is gated on it either.
 */
function FeedbackCard({ gate }: { gate: boolean }) {
  const { t } = useLocale()
  const fs = useFestivalSurvey()

  if (fs.loading || !fs.live) return null

  if (fs.taken) {
    return (
      <>
        <section className="a-cut a-solid a-fill-tint px-4 py-3 text-center">
          <div className="a-label">{t('v.survey.thanks')}</div>
          <p className="mb-0 mt-1 text-sm text-[#33415F]">{t('v.prize.feedbackDone')}</p>
        </section>
        <BoardingPass />
      </>
    )
  }

  return (
    <section className={`a-cut ${gate ? 'a-edge-neon a-fill-foil' : 'a-solid a-fill-tint'} px-4 py-4`}>
      {/* Both languages on this card whichever way the toggle is set: it is the one thing every
          visitor is asked, and the pair reads as an invitation rather than a wall of the other
          language. The toggle decides which comes first. */}
      {gate ? <GoldTag>{t('v.prize.gateEyebrow')}</GoldTag> : <div className="a-label">{t('v.prize.feedbackEyebrow')}</div>}
      <h2 className="a-hd mb-0 mt-2 text-lg font-bold leading-snug">
        {gate ? t('v.prize.gateTitle') : t('v.prize.feedbackTitle')}
        <span className="block text-[#33415F]">{gate ? t('v.prize.gateTitleTh') : t('v.prize.feedbackTitleTh')}</span>
      </h2>
      <p className="mb-0 mt-2 text-sm text-[#33415F]">
        {gate ? t('v.prize.gateLead', { n: fs.count }) : t('v.prize.feedbackLead', { n: fs.count })}
        <span className="mt-1 block">{gate ? t('v.prize.gateLeadTh', { n: fs.count }) : t('v.prize.feedbackLeadTh', { n: fs.count })}</span>
      </p>
      <PrimaryBtn to={`/survey/${EVENT_SURVEY_ID}`} className="mt-4">{t('v.prize.feedbackCta')}</PrimaryBtn>
    </section>
  )
}
