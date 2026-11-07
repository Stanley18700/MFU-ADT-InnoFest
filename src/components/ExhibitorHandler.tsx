import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBooth, useEvent } from '../lib/data'
import { useLocale } from '../lib/locale'
import { dayOf, type BoothDoc } from '../../shared/model'
import { AIcon, GhostBtn, PrimaryBtn } from './agency'
import { BoothShare } from './BoothShare'
import { Transmission } from './handler'
import { HandlerSession } from './Welcome'

type Booth = BoothDoc & { id: string }

/**
 * HANDLER // 0 for exhibitors, in the same card visitors get: the booth-screen briefing (why the
 * screen stays on, how points and stats work, share your booth), and the "share your booth" asks —
 * once after registering, and on the stats page, before and on the event day.
 */

function remembered(key: string) { try { return localStorage.getItem(key) === '1' } catch { return false } }
function remember(key: string) { try { localStorage.setItem(key, '1') } catch { /* shows again; harmless */ } }

/** Days until the first event day (0 on the day, negative after). */
export function useDaysToGo() {
  const event = useEvent()
  const first = event.days[0]
  if (!first) return null
  const today = dayOf(new Date())
  return Math.round((Date.parse(first) - Date.parse(today)) / 86_400_000)
}

/** The booth-screen briefing: once per booth on this device. */
export function ExhibitorBriefing({ boothId }: { boothId: string }) {
  const { t } = useLocale()
  const nav = useNavigate()
  const { data: booth } = useBooth(boothId)
  const key = `mfu-org-welcome:${boothId}`
  const [open, setOpen] = useState(() => !remembered(key))
  const [share, setShare] = useState(false)
  const close = () => { remember(key); setOpen(false) }
  if (share && booth) return <BoothShare booth={booth} onClose={() => setShare(false)} />
  if (!open) return null
  const script = [t('hxo.b1'), t('hxo.b2'), t('hxo.b3'), t('hxo.b4'), t('hxo.b5')]
  return (
    <HandlerSession tag={t('hxo.tag')} script={script} onClose={close} actions={(
      <>
        {booth && <PrimaryBtn onClick={() => { close(); setShare(true) }} icon={AIcon.share}>{t('hxo.share')}</PrimaryBtn>}
        <GhostBtn onClick={() => { close(); nav('/booth/stats') }}>{t('hxo.stats')}</GhostBtn>
        <button type="button" onClick={close} className="min-h-11 cursor-pointer border-0 bg-transparent text-[14px] font-semibold text-white/90 underline underline-offset-4">{t('hxo.screen')}</button>
      </>
    )} />
  )
}

/** Right after registering (and once only): spread the signal before the event. */
export function RegisteredNudge({ booth }: { booth: Booth }) {
  const { t } = useLocale()
  const nav = useNavigate()
  const key = `mfu-ex-share:${booth.id}`
  const days = useDaysToGo()
  const [open, setOpen] = useState(() => !remembered(key))
  const [share, setShare] = useState(false)
  const close = () => { remember(key); setOpen(false) }
  if (share) return <BoothShare booth={booth} onClose={() => setShare(false)} />
  if (!open) return null
  const script = [
    t('hxo.r1', { booth: booth.shortName }),
    days !== null && days > 0 ? t('hxo.r2', { n: days }) : t('hxo.r2today'),
    t('hxo.r3'),
  ]
  return (
    <HandlerSession tag={t('hxo.tag')} script={script} onClose={close} actions={(
      <>
        <PrimaryBtn onClick={() => { close(); setShare(true) }} icon={AIcon.share}>{t('hxo.share')}</PrimaryBtn>
        <GhostBtn onClick={() => { close(); nav('/booth') }} icon={AIcon.scan}>{t('ex.openQr')}</GhostBtn>
        <button type="button" onClick={close} className="min-h-11 cursor-pointer border-0 bg-transparent text-[14px] font-semibold text-white/90 underline underline-offset-4">{t('hx.a.later')}</button>
      </>
    )} />
  )
}

/**
 * The share block for a page: the Handler's line for the moment (days to go, or live numbers),
 * the invite counts kept apart from visits, and the button that opens the share card.
 */
export function ShareBlock({ booth, invited, came, visitors }: { booth: Booth; invited?: number; came?: number; visitors?: number }) {
  const { t } = useLocale()
  const days = useDaysToGo()
  const [share, setShare] = useState(false)
  const live = days === 0
  const line = live
    ? ((visitors ?? 0) > 0 ? t('hxo.s.live', { n: visitors ?? 0 }) : t('hxo.s.liveZero'))
    : days !== null && days > 0 ? t('hxo.s.before', { n: days }) : t('hxo.s.after')
  return (
    <section className="flex flex-col gap-2.5">
      <Transmission text={line} />
      <div className="a-cut a-edge-neon a-fill-foil a-glow-soft px-4 pb-4 pt-3.5">
        <div className="a-mono text-[11px] font-semibold tracking-[.14em] text-[#1450E6]">{t('hxo.s.eyebrow')}</div>
        <div className="a-hd mt-1 text-[20px] font-bold leading-tight text-ink">{t('hxo.s.title')}</div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="a-cut a-cut-s a-solid a-fill-tint px-3 py-2">
            <div className="a-mono text-[22px] font-semibold text-[#1450E6]">{invited ?? 0}</div>
            <div className="a-label text-[var(--a-muted)]">{t('hxo.s.invited')}</div>
          </div>
          <div className="a-cut a-cut-s a-solid a-fill-tint px-3 py-2">
            <div className="a-mono text-[22px] font-semibold text-[#1450E6]">{came ?? 0}</div>
            <div className="a-label text-[var(--a-muted)]">{t('hxo.s.came')}</div>
          </div>
        </div>
        <p className="mb-0 mt-2 text-[12.5px] leading-snug text-[#33415F]">{t('hxo.s.note')}</p>
        <div className="mt-3"><PrimaryBtn onClick={() => setShare(true)} icon={AIcon.share}>{t('hxo.share')}</PrimaryBtn></div>
      </div>
      {share && <BoothShare booth={booth} onClose={() => setShare(false)} />}
    </section>
  )
}
