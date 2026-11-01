import { useEffect, useRef, useState } from 'react'
import { Transmission } from '../../components/handler'
import { Link } from 'react-router-dom'
import { doc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useAuth } from '../../lib/auth'
import { api } from '../../lib/api'
import { useBooths, useDoc, useTiers } from '../../lib/data'
import { RATING_COMMENT_MAX } from '../../../shared/model'
import { useLocale } from '../../lib/locale'
import { useBodyScrollLock } from '../../lib/useBodyScrollLock'
import { AIcon, ALang, ErrorPanel, Eyebrow, GhostBtn, GoldTag, InkTag, PrimaryBtn, pad3 } from '../../components/agency'
import { Notice } from '../../components/ui'
import type { ScanResult } from '../../../shared/model'

export function ScanResultView({ result, onRetry }: { result: ScanResult; onRetry: () => void }) {
  const { t, pick } = useLocale()
  const booths = useBooths()
  const tiers = useTiers().filter((x) => x.active)
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
        <Link to="/passport" aria-label={t('v.close')} className="-ml-3 flex h-11 w-11 shrink-0 items-center justify-center text-ink focus-visible:outline-[3px] focus-visible:outline-[#00B4EE]">{AIcon.close}</Link>
        <Eyebrow pulse>{eyebrow}</Eyebrow>
      </div>
      <ALang />
    </header>
  )

  if (result.status === 'success') {
    const name = booth ? pick(booth.nameEn, booth.nameTh) : ''
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
          <div className="flex items-stretch gap-3">
            <span className="a-cut a-solid a-fill-gold a-pop a-hd grid w-[62px] shrink-0 place-items-center text-2xl font-bold">+{result.pointsAwarded}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="a-label text-[var(--a-muted)]">{t('a.res.newTotal')}</span>
                <span><span className="a-mono a-neon-text text-[28px] font-semibold">{pad3(result.points)}</span>{top > 0 && <span className="a-mono text-base text-[var(--a-muted)]">/{top}</span>}</span>
              </div>
              {top > 0 && <div className="a-bar mt-1 h-[6px]"><span className="fill" style={{ width: `${Math.min(100, (result.points / top) * 100)}%` }} /></div>}
              <div className="mt-1 text-xs text-[var(--a-muted)]">{t('v.res.summary', { booth: name, points: result.points, stamps: result.stampCount })}</div>
            </div>
          </div>
          {result.unlockedTierIds.length > 0 && (
            <div className="a-cut a-edge-neon a-fill-foil flex items-center gap-3 px-3.5 py-3">
              <GoldTag pop>{AIcon.check}{t('a.res.unlockedTag')}</GoldTag>
              <span className="text-sm font-medium">{t('v.res.unlocked')}</span>
            </div>
          )}
          <Transmission tone="ink" text={result.unlockedTierIds.length > 0 ? t('h.res.unlocked') : t('h.res.ok')} />
          {/* Asked only once the stamp is safely in the passport, and never in the way of it. */}
          <RatingCard boothId={result.boothId} onDone={() => setDone(true)} />
          <div className="mt-3 flex flex-col gap-3">
            <PrimaryBtn to="/passport/stamps" disabled={!done}>{t('v.res.myStamps')}</PrimaryBtn>
            <GhostBtn onClick={onRetry} disabled={!done} icon={AIcon.scan}>{t('v.res.scanAnother')}</GhostBtn>
          </div>
        </div>
      </div>
    )
  }
  if (result.status === 'already') {
    return (
      <div className="page-in flex flex-col">
        {head(t('a.res.alreadyEyebrow'))}
        <div className="flex flex-col gap-3 px-4 pb-8">
          <div className="flex items-center gap-3">
            <span className="a-cut a-solid a-fill-neon grid h-12 w-12 shrink-0 place-items-center text-white"><svg aria-hidden width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12.5l4.5 4.5L15 8.5M10 16.5l.5.5L20 7.5" /></svg></span>
            <h1 className="a-hd m-0 text-2xl font-bold leading-tight">{t('v.res.already')}</h1>
          </div>
          {booth && (
            <div className="a-cut a-edge-soft a-fill-foil pulse-once flex items-center gap-3 px-3.5 py-3">
              <span className="a-cut a-cut-s a-solid a-fill-neon grid h-10 w-10 shrink-0 place-items-center text-white">{AIcon.file}</span>
              <div className="min-w-0">
                <div className="a-hd truncate text-[17px] font-bold">{pick(booth.nameEn, booth.nameTh)}</div>
                <div className="a-mono text-xs text-[#33415F]">{booth.shortName}</div>
              </div>
            </div>
          )}
          <Transmission text={t('h.res.already')} />
          <p className="m-0 text-sm text-[#33415F]">{t('v.res.alreadyNote', { booth: booth ? pick(booth.nameEn, booth.nameTh) : '' })}</p>
          <div className="mt-4 flex flex-col gap-3">
            <PrimaryBtn onClick={onRetry} icon={AIcon.scan}>{t('v.res.scanAnother')}</PrimaryBtn>
            <GhostBtn to="/passport/stamps">{t('v.res.whatsLeft')}</GhostBtn>
          </div>
        </div>
      </div>
    )
  }
  const map = {
    expired: { red: false, text: t('v.res.expired') },
    invalid: { red: true, text: t('v.res.invalid') },
    rate_limited: { red: false, text: t('v.res.tooFast') },
    not_registered: { red: false, text: t('v.res.notRegistered') },
  }[result.status]
  return (
    <div className="page-in flex flex-col">
      {head(t('v.scan.title'))}
      <div className="flex flex-col gap-4 px-4 pb-8">
        {map.red ? <ErrorPanel>{map.text}</ErrorPanel> : <Notice tone="amber">{map.text}</Notice>}
        {result.status !== 'not_registered' && <Transmission text={t('h.res.error')} />}
        {result.status === 'not_registered'
          ? <PrimaryBtn to="/join">{t('v.res.createPassport')}</PrimaryBtn>
          : <PrimaryBtn onClick={onRetry}>{t('v.res.tryAgain')}</PrimaryBtn>}
      </div>
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

  const [stars, setStars] = useState(0)
  const [hover, setHover] = useState(0)
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
    if (inFlight.current || stars === 0) return
    inFlight.current = true
    setBusy(true)
    const text = comment.trim()
    try {
      await api.rateBooth({ boothId, stars, ...(text ? { comment: text } : {}) })
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
    return (
      <div className="a-cut a-solid a-fill-tint flex items-center justify-between gap-3 px-4 py-3">
        <span className="a-hd text-[17px] font-bold">{t('v.rate.thanks')}</span>
        <span className="flex gap-1" role="img" aria-label={t('v.rate.rated', { n: stars })}>{[1, 2, 3, 4, 5].map((n) => <span key={n}>{AIcon.star(n <= stars, 22)}</span>)}</span>
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
  return <RatingSheet {...{ stars, setStars, hover, setHover, comment, setComment, busy, send }} />
}

function RatingSheet({
  stars, setStars, hover, setHover, comment, setComment, busy, send,
}: {
  stars: number; setStars: (n: number) => void
  hover: number; setHover: (n: number) => void
  comment: string; setComment: (s: string) => void
  busy: boolean; send: () => Promise<void>
}) {
  const { t } = useLocale()
  useBodyScrollLock(true)
  const shown = hover || stars
  return (
    <div className="scrim-in fixed inset-0 z-40 flex items-end justify-center bg-[rgb(10_19_64/.5)] p-3">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('v.rate.title')}
        className="a-cut a-cut-xl a-edge-neon sheet-in max-h-[90dvh] w-full max-w-md overflow-y-auto px-5 pt-5 text-left"
        style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
      >
        <h2 className="a-hd m-0 text-[22px] font-bold">{t('v.rate.title')}</h2>
        <p className="mb-0 mt-1 text-sm text-[#33415F]">{t('v.rate.lead')}</p>

        <div
          className="mt-4 flex justify-center gap-1.5"
          role="radiogroup"
          aria-label={t('v.rate.aria')}
          onMouseLeave={() => setHover(0)}
        >
          {[1, 2, 3, 4, 5].map((n) => {
            const on = n <= shown
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={stars === n}
                aria-label={n === 1 ? t('v.rate.star', { n }) : t('v.rate.stars', { n })}
                disabled={busy}
                onMouseEnter={() => setHover(n)}
                onFocus={() => setHover(n)}
                onClick={() => setStars(n)}
                // A big target and a big glyph: a phone held one-handed, outdoors, in a queue.
                className={`a-cut a-cut-s grid h-14 w-14 cursor-pointer place-items-center border-0 bg-transparent transition-transform active:scale-90 disabled:opacity-50 ${on ? 'a-edge-neon' : 'a-edge-strong'}`}
                style={{
                  // Always the SOLID star. Outline-against-filled is the distinction that
                  // disappears in sunlight; a lit blue star against a flat grey one does not.
                  color: on ? '#1D5BFF' : '#9AA6BF',
                  ['--fill' as string]: on ? '#EEF3FF' : '#F7F9FC',
                  filter: on ? 'drop-shadow(0 0 6px rgb(0 200 255 / .45))' : undefined,
                }}
              >
                {/*
                  * The size lives on the SPAN, not the button. `input, select, textarea, button
                  * { font: inherit }` (index.css) is unlayered, so it beats every layered
                  * `text-*` utility and silently resets a button's font-size to 16px — which is
                  * why these stars were tiny however large the class said they were.
                  */}
                <span aria-hidden className="text-[38px] leading-none">★</span>
              </button>
            )
          })}
        </div>

        <label className="mt-4 block">
          <span className="a-lbl">{t('v.rate.comment')}</span>
          <textarea
            className="a-field"
            rows={2}
            maxLength={RATING_COMMENT_MAX}
            value={comment}
            disabled={busy}
            onChange={(e) => setComment(e.target.value.slice(0, RATING_COMMENT_MAX))}
            placeholder={t('v.rate.placeholder')}
          />
        </label>

        <PrimaryBtn className="mt-5" onClick={() => void send()} disabled={busy || stars === 0}>
          {busy ? t('v.rate.sending') : stars === 0 ? t('v.rate.pick') : t('v.rate.send')}
        </PrimaryBtn>
      </div>
    </div>
  )
}
