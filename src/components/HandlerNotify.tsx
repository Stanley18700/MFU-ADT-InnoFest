import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { collection, query, where } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { useAuth } from '../lib/auth'
import { useCollection, useTiers } from '../lib/data'
import { useLocale } from '../lib/locale'
import { tierEligible, type TierUnlockDoc } from '../../shared/model'
import { Decode, HandlerAvatar } from './handler'
import { haptic } from './game'

type Note = { id: string; text: string; to?: string }

/**
 * HANDLER // 0 drops in from the top when something changes for the agent: a reward unlocks
 * (tap → Rewards), the agent photo unlocks at the first reward (tap → camera), or the desk hands
 * a reward over. Works on every screen, because it watches the data, not a page.
 *
 * What the agent has already been told is remembered per account on this device, so reopening
 * the app never replays old news; the first time it runs on a device it just takes note.
 */
export function HandlerNotifier() {
  const { t } = useLocale()
  const nav = useNavigate()
  const { role, user, profile } = useAuth()
  const uid = role === 'visitor' ? user?.uid : undefined
  const unlocksQ = useCollection<TierUnlockDoc>(uid ? query(collection(db, 'tierUnlocks'), where('visitorId', '==', uid)) : null, [uid], 'your prize unlocks')
  const tiers = useTiers(!!uid).filter((x) => x.active).sort((a, b) => a.thresholdPoints - b.thresholdPoints)
  const [queue, setQueue] = useState<Note[]>([])
  const [leaving, setLeaving] = useState(false)

  const ready = !!uid && !!profile && !unlocksQ.loading && tiers.length > 0
  const firstAt = tiers[0]?.thresholdPoints ?? 50
  const eligible = unlocksQ.data.filter((u) => !u.voidedAt && tierEligible(tiers.find((x) => x.id === u.tierId) ?? {}, u.tierId, profile ?? {}))
  const unlockedIds = eligible.map((u) => u.tierId).sort()
  const redeemedIds = eligible.filter((u) => u.redeemedAt).map((u) => u.tierId).sort()
  const photo = (profile?.points ?? 0) >= firstAt
  const sig = JSON.stringify({ u: unlockedIds, r: redeemedIds, p: photo })

  useEffect(() => {
    if (!ready || !uid) return
    const key = `mfu-notify:${uid}`
    let prev: { u: string[]; r: string[]; p: boolean } | null = null
    try { prev = JSON.parse(localStorage.getItem(key) ?? 'null') } catch { prev = null }
    try { localStorage.setItem(key, sig) } catch { /* will re-announce at worst */ }
    if (!prev) return
    const name = (id: string) => tiers.find((x) => x.id === id)?.name ?? id
    const notes: Note[] = []
    if (photo && !prev.p) notes.push({ id: `photo`, text: t('n.photo'), to: '/mission/rewards?photo=1' })
    for (const id of unlockedIds) if (!prev.u.includes(id)) notes.push({ id: `u-${id}`, text: t('n.unlocked', { tier: name(id) }), to: '/mission/rewards' })
    for (const id of redeemedIds) if (!prev.r.includes(id)) notes.push({ id: `r-${id}`, text: t('n.redeemed', { tier: name(id) }), to: '/mission/rewards' })
    if (notes.length) setQueue((q) => [...q, ...notes])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, uid, sig])

  // Hold the news while the briefing is open (the two would stack on the same spot).
  const [briefing, setBriefing] = useState(false)
  useEffect(() => {
    if (!queue.length) return
    const check = () => setBriefing(!!document.querySelector('.hd-holo'))
    check()
    const id = window.setInterval(check, 600)
    return () => window.clearInterval(id)
  }, [queue.length])

  const current = briefing ? undefined : queue[0]
  const timer = useRef(0)
  useEffect(() => {
    if (!current) return
    haptic([20, 60, 20])
    setLeaving(false)
    timer.current = window.setTimeout(() => dismiss(), 7000)
    return () => window.clearTimeout(timer.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id])

  function dismiss() {
    window.clearTimeout(timer.current)
    setLeaving(true)
    window.setTimeout(() => { setQueue((q) => q.slice(1)); setLeaving(false) }, 260)
  }
  if (!current) return null

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[65] flex justify-center px-2 pt-[max(8px,env(safe-area-inset-top))]">
      <div role="status" aria-live="polite"
        className={`hn-drop pointer-events-auto flex w-full max-w-[420px] items-start gap-3 rounded-2xl px-3.5 py-3 text-white ${leaving ? 'hn-out' : ''}`}>
        <button type="button" onClick={() => { dismiss(); if (current.to) nav(current.to) }}
          className="flex min-w-0 flex-1 cursor-pointer items-start gap-3 border-0 bg-transparent p-0 text-left text-white">
          <HandlerAvatar size={40} />
          <span className="min-w-0 flex-1">
            <span className="a-mono flex items-center gap-1.5 text-[10.5px] tracking-[.14em] text-[#7FE7FF]"><span className="hd-dot" aria-hidden />{t('h.name')} · 2036</span>
            <Decode key={current.id} text={current.text} remember={false} signalMs={360} className="mt-0.5 text-[14.5px] font-medium leading-snug" />
          </span>
          {current.to && <span aria-hidden className="mt-3 shrink-0 text-[#7FE7FF]">›</span>}
        </button>
        <button type="button" aria-label={t('n.dismiss')} onClick={dismiss}
          className="grid h-8 w-8 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-white/10 text-base text-white">×</button>
      </div>
    </div>
  )
}
