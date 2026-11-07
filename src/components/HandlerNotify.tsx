import { useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { collection, query, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../lib/auth'
import { useCollection, useEvent, useTiers } from '../lib/data'
import { useFestivalSurvey } from '../lib/festivalSurvey'
import { useLocale } from '../lib/locale'
import { serverNow } from '../lib/serverClock'
import { EVENT_SURVEY_ID, dayOf, isMfuOnlyTier, minuteOfDay, tierEligible, type TierUnlockDoc } from '../../shared/model'
import { AIcon, GhostBtn, PrimaryBtn } from './agency'
import { HandlerSession, welcomePending } from './Welcome'
import { haptic } from './game'

/**
 * HANDLER // 0's transmissions after the briefing, in the same card as the briefing: message by
 * message, then buttons that go straight to the thing being talked about.
 *
 *   rewards unlocked   — what opened (photo, MFU333 for MFU students, the prize), and, while the
 *                        debrief is still owed, that every reward stays sealed until it is sent
 *   debrief received   — the seal breaks; photo and rewards are one tap away
 *   debrief asks       — at 2 stamps, at halfway to the first reward, 10 minutes after rewards
 *                        unlocked but stayed sealed, and in the last hours of the event day
 *   five files         — curiosity about the projects, and a nudge to post about them
 *
 * Each fires once per account on this device. The very first run on a device only takes note
 * of rewards already unlocked or handed over, so reopening the app never replays old news.
 *
 * Never over the welcome briefing, the survey itself, or a live camera (scanner, photo booth);
 * on the scan screen it waits a moment so the score animation plays first.
 */

type Seen = { u: string[]; r: string[]; p: boolean; t: boolean; seen: string[]; unlockAt?: number }
type Session = { id: string; tag: string; script: string[]; actions: Array<{ label: string; to?: string; icon?: ReactNode; primary?: boolean }> }

/** The festival's last stretch: debrief asks from 15:00 on an event day. */
const LATE_MINUTE = 15 * 60
const REMIND_AFTER_MS = 10 * 60_000
const SURVEY = `/survey/${EVENT_SURVEY_ID}`

export function HandlerNotifier() {
  const { t } = useLocale()
  const loc = useLocation()
  const { role, user, profile } = useAuth()
  const uid = role === 'visitor' ? user?.uid : undefined
  const unlocksQ = useCollection<TierUnlockDoc>(uid ? query(collection(db, 'tierUnlocks'), where('visitorId', '==', uid)) : null, [uid], 'your prize unlocks')
  const tiers = useTiers(!!uid).filter((x) => x.active).sort((a, b) => a.thresholdPoints - b.thresholdPoints)
  const fs = useFestivalSurvey(!!uid)
  const event = useEvent()
  const [session, setSession] = useState<Session | null>(null)
  const [pending, setPending] = useState<Session | null>(null)
  const [blocked, setBlocked] = useState(true)
  const [tick, setTick] = useState(0)

  // What stands in the way right now: re-checked every half second, because the briefing, the
  // camera and the photo booth are not routes.
  const path = loc.pathname
  useEffect(() => {
    const check = () => setBlocked(
      !uid || welcomePending(uid) || path.startsWith('/survey') || path.startsWith('/join')
      || !!document.querySelector('.hd-holo, video, [role=dialog][aria-modal=true]'),
    )
    check()
    const id = window.setInterval(() => { check(); setTick((n) => n + 1) }, 600)
    return () => window.clearInterval(id)
  }, [uid, path])

  const ready = !!uid && !!profile && !unlocksQ.loading && tiers.length > 0 && !fs.loading
  const first = tiers[0]
  const firstAt = first?.thresholdPoints ?? 50
  const points = profile?.points ?? 0
  const stamps = profile?.stampCount ?? 0
  const eligible = unlocksQ.data.filter((u) => !u.voidedAt && tierEligible(tiers.find((x) => x.id === u.tierId) ?? {}, u.tierId, profile ?? {}))
  const unlockedIds = eligible.map((u) => u.tierId).sort()
  const redeemedIds = eligible.filter((u) => u.redeemedAt).map((u) => u.tierId).sort()
  const photo = points >= firstAt
  const owed = fs.owed
  const name = (id: string) => tiers.find((x) => x.id === id)?.name ?? id

  useEffect(() => {
    if (!ready || !uid || session || pending || blocked) return
    const key = `mfu-hd:${uid}`
    let prev: Seen | null = null
    try { prev = JSON.parse(localStorage.getItem(key) ?? 'null') } catch { prev = null }
    const save = (s: Seen) => { try { localStorage.setItem(key, JSON.stringify(s)) } catch { /* may repeat once */ } }
    if (!prev) {
      // First run on this device: take note, announce nothing that already happened.
      save({ u: unlockedIds, r: redeemedIds, p: photo, t: fs.taken, seen: [], unlockAt: photo ? Date.now() : undefined })
      return
    }
    const next: Seen = { ...prev, seen: [...prev.seen] }
    const q = fs.count
    const debrief = { label: t('hx.a.debrief'), to: SURVEY, primary: true }
    const rewards = { label: t('hx.a.rewards'), to: '/mission/rewards' }
    const photoBtn = { label: t('hx.a.photo'), to: '/mission/rewards?photo=1', icon: AIcon.camera, primary: true }
    const nextBtn = { label: t('hx.a.next'), to: '/mission/files' }
    let s: Session | null = null

    const newTiers = unlockedIds.filter((id) => !prev!.u.includes(id))
    const newPhoto = photo && !prev.p
    const newRedeemed = redeemedIds.filter((id) => !prev!.r.includes(id))
    const justTaken = fs.taken && !prev.t

    if (newTiers.length || newPhoto) {
      // ── rewards unlocked ──
      const mfu = newTiers.find((id) => isMfuOnlyTier(tiers.find((x) => x.id === id) ?? {}, id))
      const prizes = newTiers.filter((id) => id !== mfu)
      const script = [newPhoto ? t('hx.u.open', { n: firstAt }) : t('hx.u.tier', { tier: name(newTiers[0]) })]
      if (mfu) script.push(t('hx.u.mfu'))
      if (newPhoto) script.push(t('hx.u.photo'))
      if (!newPhoto) { if (prizes.includes(newTiers[0])) script.push(t('hx.u.prizeIt')) }
      else for (const id of prizes) if (id !== first?.id) script.push(t('hx.u.prize', { tier: name(id) }))
      script.push(owed ? t('hx.u.sealed', { q }) : t('hx.share'))
      s = { id: 'unlock', tag: t('hx.tag.priority'), script, actions: owed ? [debrief, rewards] : [photo ? photoBtn : { ...rewards, primary: true }, ...(photo ? [rewards] : [])] }
      next.u = unlockedIds; next.p = photo; next.unlockAt = Date.now()
      if (justTaken) next.t = true
    } else if (justTaken) {
      // ── debrief received ──
      const mfuReady = unlockedIds.some((id) => isMfuOnlyTier(tiers.find((x) => x.id === id) ?? {}, id) && !redeemedIds.includes(id))
      s = photo || unlockedIds.length
        ? { id: 'taken', tag: t('hx.tag.debrief'), script: [t('hx.t.thanks'), mfuReady ? t('hx.t.releasedMfu') : t('hx.t.released'), t('hx.share')], actions: [photo ? photoBtn : { ...rewards, primary: true }, ...(photo ? [rewards] : [])] }
        : { id: 'taken', tag: t('hx.tag.debrief'), script: [t('hx.t.thanks'), t('hx.t.early', { n: firstAt })], actions: [{ ...nextBtn, primary: true }] }
      next.t = true
    } else if (fs.live && owed) {
      // ── the debrief, asked at the right moments ──
      const now = new Date(serverNow())
      const late = event.days.includes(dayOf(now)) && minuteOfDay(now) >= LATE_MINUTE
      const once = (id: string) => !prev!.seen.includes(id)
      const later = { label: t('hx.a.later') }
      if (photo && once('sv-remind') && prev.unlockAt && Date.now() - prev.unlockAt >= REMIND_AFTER_MS) {
        s = { id: 'sv-remind', tag: t('hx.tag.debrief'), script: [t('hx.s.remind1'), t('hx.s.remind2', { q })], actions: [debrief, later] }
      } else if (!photo && points >= firstAt / 2 && once('sv-half')) {
        s = { id: 'sv-half', tag: t('hx.tag.debrief'), script: [t('hx.s.half1', { left: firstAt - points }), t('hx.s.half2', { n: firstAt })], actions: [debrief, later] }
      } else if (!photo && stamps >= 2 && once('sv-early') && !prev.seen.includes('sv-half')) {
        s = { id: 'sv-early', tag: t('hx.tag.debrief'), script: [t('hx.s.early1', { q }), t('hx.s.early2', { n: firstAt })], actions: [debrief, later] }
      } else if (late && stamps >= 1 && once('sv-late')) {
        s = { id: 'sv-late', tag: t('hx.tag.debrief'), script: [t('hx.s.late1'), t('hx.s.late2', { q })], actions: [debrief, later] }
      }
      if (s) next.seen.push(s.id)
    }
    if (!s && stamps >= 5 && !prev.seen.includes('c-five')) {
      // ── curiosity, and something worth posting ──
      s = { id: 'c-five', tag: t('hx.tag.field'), script: [t('hx.c.five1'), t('hx.c.five2'), t('hx.c.five3')], actions: [{ ...nextBtn, primary: true }, { label: t('hx.a.ok') }] }
      next.seen.push('c-five')
    }
    // A hand-over at the desk is remembered quietly (no pop-up; the desk already said it).
    if (newRedeemed.length) next.r = redeemedIds
    if (!s) { if (newRedeemed.length) save(next); return }
    save(next)
    setPending(s)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, uid, session, pending, blocked, tick, JSON.stringify([unlockedIds, redeemedIds, photo, fs.taken, owed, stamps, points])])

  // Shown once nothing is in the way; on the scan screen, after the score has landed.
  useEffect(() => {
    if (!pending || blocked) return
    const id = window.setTimeout(() => { haptic([20, 60, 20]); setSession(pending); setPending(null) }, path.startsWith('/scan') ? 2600 : 500)
    return () => window.clearTimeout(id)
  }, [pending, blocked, path])

  if (!session) return null
  const close = () => setSession(null)
  return (
    <HandlerSession key={session.id} tag={session.tag} script={session.script} onClose={close} actions={(
      <>
        {session.actions.map((a, i) => a.to
          ? (a.primary
            ? <PrimaryBtn key={i} to={a.to} onClick={close} icon={a.icon}>{a.label}</PrimaryBtn>
            : <GhostBtn key={i} to={a.to} onClick={close} icon={a.icon}>{a.label}</GhostBtn>)
          : <button key={i} type="button" onClick={close} className="min-h-11 cursor-pointer border-0 bg-transparent text-[14px] font-semibold text-white/90 underline underline-offset-4">{a.label}</button>)}
      </>
    )} />
  )
}
