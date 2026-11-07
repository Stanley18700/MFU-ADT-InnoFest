import { useEffect, useState } from 'react'
import { doc } from 'firebase/firestore'
import { db, APP_ORIGIN } from '../lib/firebase'
import { useBoothStat, useBooths, useDoc, useEvent } from '../lib/data'
import { useLocale } from '../lib/locale'
import { useBodyScrollLock } from '../lib/useBodyScrollLock'
import { inviteUrl } from '../lib/invite'
import { CARD_H, CARD_W, cardBlob, drawBoothCard } from '../lib/boothCard'
import { dayOf, type BoothDoc } from '../../shared/model'
import { AIcon, PrimaryBtn } from './agency'
import { IOS } from './AgentPhoto'
import { SegLoader } from './game'

type Booth = BoothDoc & { id: string }

/**
 * "Share my booth": a poster and a caption, ready for Instagram, Facebook or LINE.
 *
 * Before the event the poster is the invitation (where, when, scan to join). On an event day it
 * shows the booth's numbers by default, with "without stats" one tap away. The caption carries the
 * booth's invite link, which credits the booth with sign-ups apart from its visitors.
 */
export function BoothShare({ booth, onClose }: { booth: Booth; onClose: () => void }) {
  const { t, pick } = useLocale()
  const event = useEvent()
  const stat = useBoothStat(booth.id).data
  const rating = useDoc<{ count?: number; sum?: number }>(doc(db, 'stats/ratings/items', booth.id), [booth.id]).data
  const boothCount = useBooths().filter((b) => b.active && b.eventId === booth.eventId).length
  const eventDay = event.days.includes(dayOf(new Date()))
  const hasStats = eventDay && (stat?.stamps ?? 0) > 0
  const [withStats, setWithStats] = useState(hasStats)
  useEffect(() => { setWithStats(hasStats) }, [hasStats])
  const [img, setImg] = useState<{ url: string; blob: Blob; data: string } | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [hold, setHold] = useState(false)
  useBodyScrollLock(true)

  const link = inviteUrl(APP_ORIGIN, booth.id)
  const name = pick(booth.nameEn, booth.nameTh)
  const where = booth.location || booth.shortName
  const stars = rating?.count && rating.count >= 5 && rating.sum ? rating.sum / rating.count : null
  const mode = withStats && hasStats ? 'stats' : 'invite'
  const caption = mode === 'stats'
    ? t('sh.capStats', { n: stat?.stamps ?? 0, name, booth: booth.shortName, link })
    : t('sh.capInvite', { name, booth: booth.shortName, where, link })

  const key = JSON.stringify([mode, stat?.stamps, stat?.rank, stars, name, t('sh.findUs')])
  useEffect(() => {
    let live = true
    setImg(null)
    void drawBoothCard({
      mode, shortName: booth.shortName, name, hostUnit: booth.hostUnit, where, link,
      visitors: stat?.stamps ?? 0, rank: stat?.rank ?? null, boothCount, rating: stars,
      labels: {
        eyebrowInvite: t('sh.eyebrowInvite'), eyebrowStats: t('sh.eyebrowStats'), findUs: t('sh.findUs'), date: t('sh.date'),
        agents: t('sh.agents'), rank: t('sh.rank'), rating: t('sh.rating'), scan: t('sh.scan'), tag: '#ADTInnoFest2026 · RECOVER THE FUTURE',
      },
    }).then(async (c) => {
      const blob = await cardBlob(c)
      if (live) setImg({ url: URL.createObjectURL(blob), blob, data: c.toDataURL('image/png') })
    })
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  function file() { return img ? new File([img.blob], `innofest-${booth.shortName}.png`, { type: 'image/png' }) : null }
  async function copy(text: string, done: string) {
    try { await navigator.clipboard.writeText(text); setNote(done) } catch { setNote(t('sh.copyFail')) }
  }
  async function shareImage() {
    const f = file(); if (!f) return
    // The caption goes to the clipboard first: Instagram and Facebook drop text sent with a picture.
    try { await navigator.clipboard.writeText(caption) } catch { /* the Copy caption button is there */ }
    const data = { files: [f] }
    if (navigator.canShare?.(data)) {
      try { await navigator.share(data); setNote(t('sh.captionReady')); return } catch (e) { if ((e as { name?: string }).name === 'AbortError') return }
    }
    save()
  }
  async function save() {
    if (!img) return
    if (IOS) {
      const f = file(); const data = f ? { files: [f] } : null
      if (data && navigator.canShare?.(data)) { try { await navigator.share(data); return } catch (e) { if ((e as { name?: string }).name === 'AbortError') return } }
      setHold(true); return
    }
    const a = document.createElement('a'); a.href = img.url; a.download = `innofest-${booth.shortName}.png`
    document.body.appendChild(a); a.click(); a.remove(); setNote(t('sh.saved'))
  }
  async function shareLink() {
    const data = { title: 'ADT InnoFest 2026', text: caption }
    if (navigator.share) { try { await navigator.share(data); return } catch (e) { if ((e as { name?: string }).name === 'AbortError') return } }
    void copy(caption, t('sh.copied'))
  }

  return (
    <div className="hd-scrim-holo scrim-in fixed inset-0 z-[60] flex items-end justify-center p-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:items-center" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={t('sh.title')} onClick={(e) => e.stopPropagation()}
        className="hd-holo hd-pop flex max-h-[92dvh] w-full max-w-[440px] flex-col overflow-hidden rounded-[22px] text-white">
        <div className="hd-holo-head flex items-center justify-between gap-2 border-0 border-b border-solid border-white/25 px-4 py-3">
          <div className="min-w-0">
            <div className="a-mono text-[10.5px] font-semibold tracking-[.14em] text-white/85">{t('sh.eyebrow')}</div>
            <div className="a-hd text-[18px] font-bold">{t('sh.title')}</div>
          </div>
          <button type="button" aria-label={t('p.close')} onClick={onClose}
            className="grid h-10 w-10 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-white/15 text-white">{AIcon.close}</button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-3">
          {eventDay && (
            <div role="radiogroup" aria-label={t('sh.mode')} className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-white/10 p-1">
              {([['stats', t('sh.withStats')], ['invite', t('sh.noStats')]] as const).map(([m, label]) => (
                <button key={m} type="button" role="radio" aria-checked={(m === 'stats') === withStats} disabled={m === 'stats' && !hasStats}
                  onClick={() => setWithStats(m === 'stats')}
                  className={`min-h-10 cursor-pointer rounded-lg border-0 px-2 text-[13.5px] font-semibold ${(m === 'stats') === withStats ? 'bg-white text-[#0A1433]' : 'bg-transparent text-white'} disabled:opacity-40`}>{label}</button>
              ))}
            </div>
          )}
          <div className="relative mx-auto w-full max-w-[300px] overflow-hidden rounded-xl bg-[#060B26]" style={{ paddingBottom: `${(CARD_H / CARD_W) * 100}%` }}>
            {img
              ? <img src={img.data} alt={t('sh.alt')} className="absolute inset-0 h-full w-full" style={{ WebkitTouchCallout: 'default' }} />
              : <div className="absolute inset-0 grid place-items-center"><SegLoader segments={4} /></div>}
          </div>
          <div className="mt-3 rounded-xl bg-white/95 px-3 py-2.5 text-[13px] leading-snug text-ink">
            <div className="a-label mb-1 text-[var(--a-muted)]">{t('sh.caption')}</div>
            <p className="m-0 whitespace-pre-line break-words">{caption}</p>
          </div>
          {note && <p className="mb-0 mt-2 text-center text-[12.5px] text-[#FFE08A]">{note}</p>}
        </div>
        <div className="hd-holo-foot flex flex-col gap-2.5 border-0 border-t border-solid border-white/25 px-4 pb-4 pt-3">
          <PrimaryBtn onClick={() => void shareImage()} icon={AIcon.share}>{t('sh.shareImage')}</PrimaryBtn>
          <div className="grid grid-cols-3 gap-2">
            {[
              [t(IOS ? 'p.saveIos' : 'sh.save'), () => void save()],
              [t('sh.copyCaption'), () => void copy(caption, t('sh.copied'))],
              [t('sh.shareLink'), () => void shareLink()],
            ].map(([label, fn]) => (
              <button key={label as string} type="button" onClick={fn as () => void}
                className="min-h-11 cursor-pointer rounded-lg border border-solid border-white/45 bg-white/10 px-1.5 text-[12.5px] font-semibold leading-tight text-white">{label as string}</button>
            ))}
          </div>
        </div>
      </div>
      {hold && img && (
        <div className="fixed inset-0 z-[75] flex flex-col items-center justify-center gap-4 bg-[#060B26]/95 p-4 text-center" onClick={(e) => { e.stopPropagation(); setHold(false) }}>
          <p className="m-0 max-w-xs text-[15px] font-semibold text-white">{t('p.holdTitle')}</p>
          <img src={img.data} alt={t('sh.alt')} onClick={(e) => e.stopPropagation()} className="max-h-[70vh] w-auto max-w-full rounded-xl" style={{ WebkitTouchCallout: 'default' }} />
          <button type="button" className="h-11 cursor-pointer rounded-lg border border-solid border-white/40 bg-white/10 px-6 text-[15px] font-semibold text-white">{t('p.done')}</button>
        </div>
      )}
    </div>
  )
}
