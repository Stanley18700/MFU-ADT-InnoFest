import { useEffect, useMemo, useRef, useState } from 'react'
import { Transmission } from '../../components/handler'
import { useAuth } from '../../lib/auth'
import { ms, useBooths, useEvent, useMyScans } from '../../lib/data'
import { AIcon, FileTile, GhostBtn, InkTag, LockedTag, PrimaryBtn, pad3 } from '../../components/agency'
import { Spinner } from '../../components/ui'
import { useBodyScrollLock } from '../../lib/useBodyScrollLock'
import { dayOf, type BoothDoc } from '../../../shared/model'
import { rewardExpiry, usePointsClock, useRewardBooths } from '../../lib/points'
import { useLocale } from '../../lib/locale'

function makeDayLabel(days: string[], dayName: (n: number) => string) {
  return (day: string) => {
    const i = days.indexOf(day)
    return i >= 0 ? dayName(i + 1) : day
  }
}

export default function Stamps() {
  const { profile, user } = useAuth()
  const booths = useRewardBooths(useBooths(true))
  const now = usePointsClock()
  const scans = useMyScans(user?.uid).data
  const event = useEvent()
  const { t, pick } = useLocale()
  const dayLabel = makeDayLabel(event.days, (n) => t('v.stamps.day', { n }))
  const [openId, setOpen] = useState<string | null>(null)
  const [fullId, setFull] = useState<string | null>(null)
  useBodyScrollLock(!!openId)
  const today = dayOf(new Date())

  const { collected, remaining, newest } = useMemo(() => {
    const have = new Set(profile?.stampedBoothIds ?? [])
    const mine = scans.filter((s) => s.eventId === event.id)
    const awards = new Map(mine.map((s) => [s.boothId, s.pointsAwarded]))
    const collected = booths.filter((b) => b.eventId === event.id && have.has(b.id))
      .map((b) => ({ ...b, displayPoints: awards.get(b.id) }))
    // §4.2 — uncollected sorted by value so the best booths lead; this is what turns points into a route.
    const remaining = booths.filter((b) => b.eventId === event.id && b.active && !have.has(b.id))
      .map((b) => ({ ...b, displayPoints: b.rewardPoints }))
      .sort((a, b) => b.rewardPoints - a.rewardPoints || a.sortOrder - b.sortOrder)
    // The file just recovered wears NEW until the next one replaces it.
    const newest = mine.reduce<{ id: string; at: number } | null>((best, s) => {
      const at = ms(s.scannedAt) ?? 0
      return !best || at > best.at ? { id: s.boothId, at } : best
    }, null)?.id ?? null
    return { collected, remaining, newest }
  }, [booths, profile, scans, event.id])

  const rows = [...collected, ...remaining]
  const open = rows.find((b) => b.id === openId)
  const full = collected.find((b) => b.id === fullId)

  if (!profile) return <Spinner />
  const have = !!open && (profile.stampedBoothIds?.includes(open.id) ?? false)
  const remainingPoints = remaining.reduce((s, b) => s + b.rewardPoints, 0)
  const tileLabels = { recovered: t('a.file.recovered'), encrypted: t('a.file.encrypted'), isNew: t('a.file.new'), isNext: t('a.file.next') }
  const tile = (b: (typeof rows)[number], recovered: boolean, isNext = false) => (
    <li key={b.id}>
      <FileTile
        to="#" code={b.shortName || b.id} title={pick(b.nameEn, b.nameTh)} recovered={recovered}
        isNew={recovered && b.id === newest} isNext={isNext} labels={tileLabels}
        onOpen={() => setOpen(b.id)}
      />
    </li>
  )

  return (
    <main className="px-4 pt-1">
      {/* "057/100" — the only account of progress a page whose whole subject is progress needs. */}
      <div className="flex items-center gap-3" role="img" aria-label={t('v.stamps.progress', { have: collected.length, total: rows.length })}>
        <span className="a-mono text-[15px] font-semibold text-[#1450E6]">{pad3(collected.length)}/{rows.length}</span>
        <span className="a-bar h-[5px] flex-1"><span className="fill" style={{ width: `${rows.length ? (collected.length / rows.length) * 100 : 0}%` }} /></span>
        <span className="text-xs text-[var(--a-muted)]">{t('a.files.recoveredLabel')}</span>
      </div>
      <Transmission className="mt-4" text={
        collected.length === 0 ? t('h.files.none') : remaining.length === 0 ? t('h.files.all') : t('h.files.some')
      } />

      {/* Recovered first: a collection should open on what you have, not on its to-do list. */}
      <section className="mt-6">
        <h2 className="a-label m-0">{t('v.stamps.yours')} · {collected.length}</h2>
        {collected.length === 0 ? (
          <p className="a-cut a-edge-line mt-3 px-4 py-6 text-center text-sm text-ink-soft">{t('v.stamps.none')}</p>
        ) : (
          <ul className="mt-4 grid list-none grid-cols-3 gap-x-2.5 gap-y-3.5 p-0">{collected.map((b) => tile(b, true))}</ul>
        )}
      </section>

      {/*
        * What is left is a route through the hall: best first, the first one tagged NEXT. Encrypted
        * tiles keep their booth code readable, because that code is what is printed on the booth.
        */}
      {remaining.length > 0 && (
        <section className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <h2 className="a-label m-0 text-[var(--a-muted)]">{t('v.stamps.left')} · {remaining.length}</h2>
            <span className="text-xs text-ink-soft">{t('v.stamps.onFloor', { n: remainingPoints })}</span>
          </div>
          <ul className="mt-4 grid list-none grid-cols-3 gap-x-2.5 gap-y-3.5 p-0">{remaining.map((b, i) => tile(b, false, i === 0))}</ul>
          <p className="mt-4 text-xs text-ink-soft">{t('v.stamps.rewardsNote')}</p>
        </section>
      )}

      {open && (
        <div className="scrim-in fixed inset-0 z-40 flex items-end justify-center bg-[rgb(10_19_64/.55)] p-3 sm:items-center" onClick={() => setOpen(null)}>
          <div role="dialog" aria-modal="true" aria-label={pick(open.nameEn, open.nameTh)} className={`a-cut a-cut-xl ${have ? 'a-edge-neon' : 'a-edge-strong'} sheet-in w-full max-w-md px-5 pb-5 pt-5`} onClick={(e) => e.stopPropagation()}>
            <CaseFileHead booth={open} recovered={have} />
            {!have && rewardExpiry(open, now) && <p className="mt-2 text-xs text-ink-soft">{rewardExpiry(open, now)}</p>}
            {open.hostUnit && (
              <div className="mt-4">
                <div className="a-label text-[var(--a-muted)]">{t('a.case.team')}</div>
                <ul className="mt-2 flex list-none flex-wrap gap-2 p-0">
                  {open.hostUnit.split(/\s*[·,]\s*/).filter(Boolean).map((m) => (
                    <li key={m} className="a-cut a-cut-s a-solid flex items-center gap-2 px-3 py-1.5 text-sm" style={{ ['--fill' as string]: '#F2F5FB' }}><span aria-hidden className="a-dot !h-1.5 !w-1.5 !bg-[#1D5BFF]" />{m}</li>
                  ))}
                </ul>
              </div>
            )}
            {(open.descriptionEn || open.descriptionTh) && (
              <div className="mt-4">
                <div className="a-label text-[var(--a-muted)]">{t('a.case.about')}</div>
                <p className="mb-0 mt-1.5 text-[15px] leading-relaxed text-[#24324F]">{pick(open.descriptionEn, open.descriptionTh)}</p>
              </div>
            )}
            <p className="mt-3 text-xs text-ink-soft">{t('v.stamps.present', { days: open.activeDays.map(dayLabel).join(', ') })}</p>
            {!have && !open.activeDays.includes(today) && event.days.includes(today) && <p className="mt-1 text-xs text-warn-text">{t('v.stamps.onlyOn', { days: open.activeDays.map(dayLabel).join(' · ') })}</p>}
            <div className="mt-5 flex gap-2.5">
              {/* Only for a file actually recovered — offering it on an encrypted one would read
                  as a way to claim it. */}
              {have
                ? <><GhostBtn onClick={() => setFull(open.id)} className="flex-1">{t('v.stamps.viewFull')}</GhostBtn><GhostBtn plain onClick={() => setOpen(null)} className="!w-auto px-5">{t('v.close')}</GhostBtn></>
                : <PrimaryBtn to="/scan" className="flex-1" icon={AIcon.scan}>{t('a.case.scanThis')}</PrimaryBtn>}
            </div>
            {!have && <button type="button" onClick={() => setOpen(null)} className="a-link mx-auto mt-3 block min-h-11 cursor-pointer border-0 bg-transparent">{t('v.close')}</button>}
          </div>
        </div>
      )}

      {full && <StampViewer booth={full} onClose={() => setFull(null)} />}
    </main>
  )
}

/** Code, title and status: the top of a case file, in the sheet and the full-screen view. */
function CaseFileHead({ booth, recovered, big = false }: { booth: BoothDoc & { id: string }; recovered: boolean; big?: boolean }) {
  const { t, pick } = useLocale()
  return (
    <div className={`a-cut ${recovered ? 'a-edge-neon a-fill-foil' : 'a-edge-strong a-fill-muted'} ${big ? 'px-6 py-6' : 'px-4 py-3.5'}`}>
      <div className="flex items-start justify-between gap-3">
        <span className={`a-mono font-semibold ${big ? 'text-[34px]' : 'text-[22px]'} ${recovered ? 'text-[var(--a-blue-deep)]' : ''}`}>{booth.shortName || booth.id}</span>
        {recovered ? <InkTag>{AIcon.check}{t('a.file.recovered')}</InkTag> : <LockedTag>{t('a.file.encrypted')}</LockedTag>}
      </div>
      <div className={`a-hd mt-1 font-bold leading-tight text-ink ${big ? 'text-[34px]' : 'text-[22px]'}`}>{pick(booth.nameEn, booth.nameTh)}</div>
      {booth.location && <div className="a-mono mt-2 inline-flex items-center gap-1 bg-white/80 px-2 py-1 text-xs text-[#33415F]">{AIcon.pin}{booth.location}</div>}
    </div>
  )
}

/**
 * The visa at the size it was drawn for, and the only place in the app that shows it that way.
 *
 * A real `<dialog>`: Escape, the focus trap and `inert` on the page behind are the browser's, and
 * the visa is 105 x 74 — landscape — so on a phone held upright it is turned a quarter turn and
 * fills the screen the way a passport page does when you tilt it. The two widths are the same
 * expression with the axes swapped; 133 is 94 x the 105/74 ratio.
 */
function StampViewer({ booth, onClose }: {
  booth: BoothDoc & { id: string }
  onClose: () => void
}) {
  const { t, pick } = useLocale()
  const dlg = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = dlg.current
    if (d && !d.open) d.showModal()
  }, [])
  return (
    <dialog
      ref={dlg} onClose={onClose} onClick={onClose} aria-label={t('v.stamps.visa', { booth: pick(booth.nameEn, booth.nameTh) })}
      className="m-0 h-dvh max-h-none w-full max-w-none bg-[rgb(10_19_64/.9)] p-0"
    >
      <div className="grid h-full w-full place-items-center p-5">
        <div className="a-glow w-full max-w-md"><CaseFileHead booth={booth} recovered big /></div>
      </div>
      {/* The way back stays in the corner, wherever the phone is. */}
      <button type="button" onClick={onClose} autoFocus className="btn-quiet btn-sm fixed right-4 top-4 shadow-raised">{t('v.close')}</button>
    </dialog>
  )
}
