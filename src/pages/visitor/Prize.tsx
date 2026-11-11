import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { AgentPhotoCard } from '../../components/AgentPhoto'
import { Transmission } from '../../components/handler'
import { useAuth } from '../../lib/auth'
import { ms, useMyUnlocks, useTiers } from '../../lib/data'
import { EVENT_SURVEY_ID, isMfuOnlyTier, isMfuStudent, isStudentIdValid, minuteToHHMM, tierEligible, tierShownTo } from '../../../shared/model'
import { prizeStock, usePrizeSession } from '../../lib/prizeSession'
import { useFestivalSurvey } from '../../lib/festivalSurvey'
import { api, errorMessage } from '../../lib/api'
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
  const allTiers = useTiers().filter((t) => t.active).sort((a, b) => a.thresholdPoints - b.thresholdPoints)
  /*
   * MFU333 is activity credit for Mae Fah Luang students, recorded against their student ID. A
   * visitor who is not an MFU student never sees it; an MFU student without a valid ID sees it
   * with a box to add the ID; only an eligible visitor's unlock brings up the reward QR for it.
   */
  const mfu = profile ? isMfuStudent(profile) : false
  const idOk = isStudentIdValid(profile?.studentId)
  const tiers = allTiers.filter((x) => tierShownTo(x, x.id, profile ?? {}))
  const claimable = (tierId: string) => { const tr = allTiers.find((x) => x.id === tierId); return !tr || tierEligible(tr, tierId, profile ?? {}) }
  const unlocks = useMyUnlocks(profile?.id)
  const { active: activeSession, next: nextSession } = usePrizeSession()
  /*
   * MFU activity points are recorded automatically once the threshold is reached (11 Nov 10:23):
   * nobody has to bring a QR to the desk for them, so they never bring up the QR card.
   */
  const isAuto = (tierId: string) => { const tr = allTiers.find((x) => x.id === tierId); return !!tr && isMfuOnlyTier(tr, tierId) }
  const anyUnlockedUnredeemed = unlocks.some((u) => !isAuto(u.tierId) && claimable(u.tierId) && ((!u.redeemedAt && !u.voidedAt) || !!u.voidedAt))
  const hasDeskReward = tiers.some((x) => !isAuto(x.id))
  /*
   * The festival survey comes before every reward (organisers' decision, 7 Nov): while it is
   * published (see `surveyGates`) and this visitor has not answered, the QR (prize and MFU333) and
   * the agent photo are withheld and the survey card takes their place. `loading` keeps the QR from flashing for the half-second before the two survey
   * documents arrive. Points are never touched by this — only the moment of hand-over is.
   */
  // ?photo=1 (from the scan result's "take your agent photo") opens the camera straight away.
  const wantPhoto = new URLSearchParams(useLocation().search).get('photo') === '1'
  const fs = useFestivalSurvey()
  const gated = anyUnlockedUnredeemed && (fs.loading || (fs.gate && !fs.taken))
  const code = useRedemptionCode(anyUnlockedUnredeemed && !gated)
  if (!profile) return <Spinner />
  const points = profile.points ?? 0

  // The first tier still out of reach is the one this page is actually about.
  const nextId = tiers.find((t) => points < t.thresholdPoints && !unlocks.some((u) => u.tierId === t.id && !u.voidedAt))?.id

  // Ranks are the same for everyone, so they count every reward's threshold, MFU333 included.
  const rank = rankOf(points, allTiers.map((x) => x.thresholdPoints))
  const rankName = t(rank.key === 'senior' ? 'a.rank.senior' : rank.key === 'field' ? 'a.rank.field' : 'a.rank.recruit')
  const frame = { name: profile.displayName, agentId: profile.passportNo ?? '', points, rank: rankName, place: '11 NOV 2026 · INDOOR STADIUM · MFU', tag: '#ADTInnoFest2026 · RECOVER THE FUTURE' }
  const top = allTiers[allTiers.length - 1]?.thresholdPoints ?? 0
  const feedbackGate = (anyUnlockedUnredeemed || points >= (allTiers[0]?.thresholdPoints ?? Infinity)) && fs.owed

  return (
    <main className="flex flex-col gap-3 px-4 pt-1">
      <div className="a-cut a-solid a-fill-tint flex items-center justify-between gap-3 px-3.5 py-2.5">
        <span className="a-label text-[var(--a-muted)]">{t('a.rewards.points')}</span>
        <span className="a-mono text-sm text-[var(--a-muted)]"><b className="text-[17px] font-semibold text-[#1450E6]">{pad3(points)}</b>{top ? `/${top}` : ''} · {rankName}</span>
      </div>

      {anyUnlockedUnredeemed
        ? <Transmission text={fs.owed ? t('h.rewards.sealed') : t('h.rewards.ready')} />
        : allTiers.length > 0 && points < (allTiers[0]?.thresholdPoints ?? 0) && <Transmission text={t('h.rewards.locked', { n: allTiers[0].thresholdPoints })} />}
      {/* What the visitor came here to do comes first: the survey if it stands in the way, else the QR. */}
      {feedbackGate && <FeedbackCard gate />}
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
              <div className="a-mono mt-2 whitespace-nowrap text-[clamp(14px,4.6vw,18px)] font-semibold tracking-[.08em] text-ink min-[380px]:tracking-[.12em]">{code ? code.code.slice(0, 4) + ' ' + code.code.slice(4) : '···· ····'}</div>
              <p className="mb-0 mt-1.5 text-xs leading-snug text-[#33415F]">{t('v.prize.refresh', { n: code?.secondsLeft ?? '–' })}</p>
            </div>
          </div>
        </section>
      )}

      {mfu && (idOk ? <StudentIdLine id={profile.studentId ?? ''} /> : <StudentIdCard />)}
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {/* `tier`, not `t` — `t` is the translator now, and the old name shadowed it. */}
        {tiers.map((tier) => {
          const u = unlocks.find((x) => x.tierId === tier.id)
          const unlocked = points >= tier.thresholdPoints || (!!u && !u.voidedAt)
          const auto = isAuto(tier.id)
          // An automatic reward counts as received the moment it unlocks, with a valid student ID.
          const redeemed = (!!u?.redeemedAt && !u?.voidedAt) || (auto && unlocked && idOk)
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
                {redeemed && auto ? <GoldTag>{AIcon.check}{t('v.prize.auto')}</GoldTag>
                  : redeemed ? <InkTag>{AIcon.check}{t('v.prize.collected')}</InkTag>
                  : unlocked ? <GoldTag>{AIcon.check}{t('a.rewards.ready')}</GoldTag>
                  : <LockedTag><span className="scale-75">{AIcon.lock}</span>{t('a.rewards.locked')}</LockedTag>}
                <span className="a-mono text-xs font-semibold text-[#33415F]">{t('v.stamps.pts', { n: tier.thresholdPoints })}</span>
              </div>
              <div className="mt-2 flex items-end justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="a-hd m-0 text-[19px] font-bold leading-tight text-ink">{tier.name}</h2>
                  <p className="mb-0 mt-0.5 text-sm text-[#33415F]">{tier.reward}</p>
                  {auto && unlocked && <p className="mb-0 mt-1 text-xs font-semibold text-[#1450E6]">{idOk ? t('v.prize.autoNote') : t('v.prize.autoNeedId')}</p>}
                  {tier.grantsDrawEntry && <p className="mb-0 mt-1 text-xs font-semibold text-[#1450E6]">{t('v.prize.drawEntry')}</p>}
                </div>
                {redeemed && !auto && redeemedAt && (
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

      {!anyUnlockedUnredeemed && hasDeskReward && <div className="a-cut a-solid a-fill-tint px-4 py-3 text-sm text-ink">{t('v.prize.codeLater')}</div>}
      {/* The 50-point reward for everyone: an agent photo in the InnoFest frame. */}
      <AgentPhotoCard points={points} at={allTiers[0]?.thresholdPoints ?? 50} autoOpen={wantPhoto && !fs.owed} frame={frame} sealed={fs.loading || fs.owed} />
      {!feedbackGate && <FeedbackCard gate={false} />}
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

/** An MFU student's ID as MFU333 will record it, with a way to correct a typo. */
function StudentIdLine({ id }: { id: string }) {
  const { t } = useLocale()
  const [edit, setEdit] = useState(false)
  if (edit) return <StudentIdCard />
  return (
    <div className="a-cut a-solid a-fill-tint flex items-center justify-between gap-3 px-3.5 py-2.5">
      <span className="a-label text-[var(--a-muted)]">{t('m.yourId')}</span>
      <span className="flex items-center gap-3">
        <span className="a-mono text-sm font-semibold tracking-[.1em] text-ink">{id}</span>
        <button type="button" className="a-link cursor-pointer border-0 bg-transparent p-0 text-sm" onClick={() => setEdit(true)}>{t('ex.change')}</button>
      </span>
    </div>
  )
}

/** For an MFU student who joined without a valid ID: add it here to collect MFU333. */
function StudentIdCard() {
  const { t } = useLocale()
  const [id, setId] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState(false)
  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!isStudentIdValid(id)) { setErr(t('m.idBad')); return }
    setBusy(true); setErr(null)
    try { await api.setStudentId({ studentId: id }); setOk(true) } catch (e) { setErr(errorMessage(e)) } finally { setBusy(false) }
  }
  if (ok) return <div className="a-cut a-solid a-fill-ok px-4 py-3 text-sm font-medium text-ink">{t('m.saved')}</div>
  return (
    <form onSubmit={save} className="a-cut a-edge-neon px-4 py-3.5">
      <div className="a-hd text-[17px] font-bold leading-tight">{t('m.addTitle')}</div>
      <p className="mb-0 mt-1 text-[13px] leading-snug text-[#33415F]">{t('m.addLead')}</p>
      <div className="mt-3 flex gap-2">
        <input aria-label={t('m.idLabel')} className="a-field a-mono min-w-0 flex-1 tracking-[.12em]" inputMode="numeric" maxLength={10} autoComplete="off"
          value={id} onChange={(e) => setId(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="6731500000" />
        <button className="a-btn a-btn-primary a-cut !h-12 !w-auto shrink-0 px-4 !text-[15px]" disabled={busy || id.length !== 10}>{t('m.addSave')}</button>
      </div>
      {err && <p className="mb-0 mt-2 text-xs text-danger-text">{err}</p>}
    </form>
  )
}
