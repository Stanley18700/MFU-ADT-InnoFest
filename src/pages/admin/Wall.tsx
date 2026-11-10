import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { collection, limit, orderBy, query } from 'firebase/firestore'
import { APP_ORIGIN, db } from '../../lib/firebase'
import { ms, useBooths, useBoothStats, useCollection, useEvent, useEventStats } from '../../lib/data'
import { Crest, DataErrors, Icon, fmt } from '../../components/ui'
import { QR } from '../../components/QR'
import { fullscreenElement, isStandalone, onFullscreenChange, requestFullscreen } from '../../lib/fullscreen'
import { useLocale } from '../../lib/locale'
import type { DrawName } from './Draw'

/**
 * Big enough to scan from the middle of a hall, small enough to leave the board room: 17 stage
 * units, the same unit as `--u` in index.css (1vw on a 16:9 screen, held by the height on a
 * shorter one), so the QR scales with the rest of the composition.
 */
function qrPx() {
  if (typeof window === 'undefined') return 260
  const u = Math.min(window.innerWidth / 100, window.innerHeight / 56.25)
  return Math.round(Math.max(180, u * 17))
}

const STEPS: Array<[string, string]> = [
  ['Sign up — Google is fastest', 'ลงทะเบียน'],
  ['Scan the QR at each booth', 'สแกน QR ที่บูธ'],
  ['Collect points, get rewards', 'สะสมคะแนน รับรางวัล'],
]

/**
 * The hall screen's ground, free of the app's design system on purpose (10 Nov): a pale sky with
 * a soft halo, the faintest grid, the campus and Doi Tung washed in light across the foot, and
 * the uplink streams rising out of it.
 */
function HallGround() {
  return (
    <div aria-hidden className="hall-ground hall-stage pointer-events-none fixed inset-0 -z-20 overflow-hidden">
      <div className="hall-grid absolute inset-0" />
      <div className="hall-halo absolute inset-0" />
      {/* One box the shape of the picture: the streams are placed inside it, on the buildings.
          Sized in stage units so an ultrawide screen doesn't raise Doi Tung behind the headline. */}
      <div className="absolute bottom-0 left-1/2 aspect-[1200/394] w-[max(100vw,calc(var(--u)*124))] -translate-x-1/2">
        <img src="/brand/campus-holo.webp" alt="" className="hall-campus absolute inset-0 h-full w-full" />
      </div>
      <div className="hall-mist absolute inset-x-0 bottom-0 h-[30vh]" />
    </div>
  )
}

/** How long the draw holds the screen before the live stats come back. */
const REVEAL_MS = 60_000
/** The beat between the button being pressed and the name landing. */
const SUSPENSE_MS = 1600

/** §6.1 — presentation mode for a hall screen: dark navy, oversized figures, auto-rotating. */
export default function Wall() {
  const { t, pick } = useLocale()
  const ev = useEventStats()
  const event = useEvent()
  const booths = useBooths()
  const { data: bstats } = useBoothStats()

  /*
   * §6.7 asks for a draw "suitable for projection", and this is the surface already pointed at the
   * projector. The console at /admin/draw runs the draw; the reveal arrives here on the listener,
   * holds the screen for a minute and hands it back.
   *
   * Only a draw that has just happened takes over. Opening this screen an hour later would
   * otherwise replay the last one as though it were news.
   */
  const draws = useCollection<{ names: DrawName[]; poolSize: number; createdAt: unknown }>(
    query(collection(db, 'draws'), orderBy('createdAt', 'desc'), limit(1)), [], 'the stage draw',
  ).data
  const latest = draws[0]
  const [reveal, setReveal] = useState<typeof latest | null>(null)
  const [suspense, setSuspense] = useState(false)
  useEffect(() => {
    if (!latest) return
    const at = ms(latest.createdAt)
    const age = at ? Date.now() - at : Infinity
    if (age > REVEAL_MS) return
    setReveal(latest)
    setSuspense(age < SUSPENSE_MS)
    const beat = setTimeout(() => setSuspense(false), Math.max(0, SUSPENSE_MS - age))
    const over = setTimeout(() => setReveal(null), REVEAL_MS - age)
    return () => { clearTimeout(beat); clearTimeout(over) }
  }, [latest?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Full screen is an explicit button (and the F key), not a click anywhere: the old page-wide
  // handler gave no hint it existed and threw an unhandled rejection when the browser refused.
  // Same story as the booth screen: an iPad shown the hall screen has no Fullscreen API on iOS
  // before iPadOS 13, and an iPhone never does. Two of the three hints are the booth screen's
  // own, reused rather than reworded.
  /*
   * The QR is the whole point of the screen for a visitor walking past, so it is sized off the
   * viewport rather than fixed: a 320px square is a postage stamp on a 4K projector. Recomputed
   * on resize because entering full screen changes the viewport under it.
   */
  /*
   * The app reserves a scrollbar gutter on <html> (index.css) so other pages don't shift sideways.
   * This screen never scrolls, and the reserved strip showed as a white bar down the right edge of
   * the TV. Released while the hall screen is open, put back when it closes.
   */
  useEffect(() => {
    const root = document.documentElement.style
    const prev = { gutter: root.getPropertyValue('scrollbar-gutter'), overflow: root.overflow }
    root.setProperty('scrollbar-gutter', 'auto')
    root.overflow = 'hidden'
    return () => {
      if (prev.gutter) root.setProperty('scrollbar-gutter', prev.gutter); else root.removeProperty('scrollbar-gutter')
      root.overflow = prev.overflow
    }
  }, [])

  const [qrSize, setQrSize] = useState(() => qrPx())
  useEffect(() => {
    const on = () => setQrSize(qrPx())
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])

  const [fs, setFs] = useState(() => !!fullscreenElement() || isStandalone())
  const [hint, setHint] = useState<string | null>(null)
  useEffect(() => onFullscreenChange(() => setFs(!!fullscreenElement() || isStandalone())), [])
  const goFull = useCallback(async () => {
    const failure = await requestFullscreen()
    setHint(failure === null ? null
      : failure === 'ios' ? t('wall.fsIos')
      : failure === 'unsupported' ? t('booth.fsUnavailable')
      : t('booth.fsBlocked'))
  }, [t])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey) goFull() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [goFull])

  const board = booths.map((b) => ({ ...b, stamps: bstats.find((s) => s.id === b.id)?.stamps ?? 0 })).sort((a, b) => b.stamps - a.stamps)
  /*
   * Five, not seventy-eight. The full ranking belongs to the admin dashboard; here it ran off the
   * bottom of the screen and under the footer, and seventy rows reading 0 is the opposite of the
   * impression an entrance screen exists to give. Hidden entirely until something has happened.
   */
  const top = board.filter((b) => b.stamps > 0).slice(0, 5)

  /*
   * The counters are sharded increments, so a deleted test visitor decrements a total that is
   * already zero and the hall screen shows "-6 visitors" to the whole room. Clamped here because
   * this is the screen the public reads; the real repair is Purge event data → event counters in
   * the Event admin, which is also what clears a test run before the festival opens.
   */
  const show = (n: number) => fmt(Math.max(0, n))

  // The hall clock, Bangkok time, as on the mock-up: big enough to read from the door.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 10_000); return () => clearInterval(id) }, [])
  const clock = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now)
  const dateLine = `${new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Bangkok', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(now).replace(/,/g, '').toUpperCase()} · INDOOR STADIUM`

  return (
    <>
    <HallGround />
    <main className="hall-stage on-stage relative flex h-dvh flex-col overflow-hidden px-[calc(var(--u)*3.2)] pb-[calc(var(--u)*1.35)] pt-[calc(var(--u)*1.4625)] text-ink">
      <header className="relative flex shrink-0 items-start justify-between gap-[calc(var(--u)*2)]">
        <div className="flex items-center gap-[calc(var(--u)*1)] rounded-[calc(var(--u)*0.5)] bg-white/85 px-[calc(var(--u)*1.1)] py-[calc(var(--u)*0.3937)] shadow-[0_calc(var(--u)*0.3)_calc(var(--u)*1.4)_rgba(29,91,255,.12)] backdrop-blur">
          <img src="/brand/mfu28.png" alt="" className="h-[calc(var(--u)*2.9)] w-auto" />
          <span className="h-[calc(var(--u)*2)] w-px bg-[#C9D4EA]" />
          <img src="/brand/adt-mark.png" alt="" className="h-[calc(var(--u)*2)] w-auto" />
          <span className="h-[calc(var(--u)*2)] w-px bg-[#C9D4EA]" />
          <img src="/brand/logo-innofest.webp" alt={pick(event.nameEn, event.nameTh)} className="h-[calc(var(--u)*3.2)] w-auto" />
        </div>
        <div className="absolute left-1/2 top-[calc(var(--u)*0.225)] -translate-x-1/2 text-center">
          <div className="a-mono flex items-center justify-center gap-[calc(var(--u)*0.6)] text-[length:calc(var(--u)*1.05)] font-semibold tracking-[.2em] text-[#1450E6]"><span className="mc-pulse" aria-hidden style={{ ['--tone' as string]: '#3BE38B' }} />AGENCY HQ · LIVE</div>
          <div className="mt-[calc(var(--u)*0.1687)] text-[length:calc(var(--u)*0.85)] text-[#33415F]">กองบัญชาการ · ถ่ายทอดสด</div>
        </div>
        <div className="text-right">
          <div className="a-mono text-[length:calc(var(--u)*3)] font-semibold leading-none tracking-tight text-[#0A1433]">{clock}</div>
          <div className="a-mono mt-[calc(var(--u)*0.3375)] text-[length:calc(var(--u)*0.8)] tracking-[.14em] text-[#33415F]">{dateLine}</div>
        </div>
      </header>
      <DataErrors className="mt-[calc(var(--u)*0.8438)] text-[length:calc(var(--u)*1.1)]" />
      {reveal ? (
        <section className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="stamp-text text-[length:calc(var(--u)*1.4)] text-action">
            {t(suspense ? 'wall.drawing' : reveal.names.length === 1 ? 'wall.winner' : 'wall.winners')}
          </div>
          {suspense ? (
            <Crest className="mt-[calc(var(--u)*2.8125)] h-[calc(var(--u)*16)] w-[calc(var(--u)*16)] animate-pulse text-action" />
          ) : reveal.names.length === 0 ? (
            <p className="mt-[calc(var(--u)*3.375)] text-[length:calc(var(--u)*3)] text-ink-soft">{t('wall.nobodyEligible')}</p>
          ) : (
            <>
              <ol className="mt-[calc(var(--u)*2.25)] flex flex-col gap-[calc(var(--u)*1.6875)]">
                {reveal.names.map((n, i) => (
                  /* Staggered, so a row of five names arrives one at a time rather than as a block. */
                  <li key={n.uid} className="winner-in" style={{ animationDelay: `${i * 120}ms` }}>
                    <div className="fig text-[length:calc(var(--u)*6)] leading-none">{n.displayName}</div>
                    <div className="mt-[calc(var(--u)*0.5625)] font-mono text-[length:calc(var(--u)*1.8)] tracking-[0.2em] text-action">{n.passportNo}</div>
                  </li>
                ))}
              </ol>
              <div className="stamp-text mt-[calc(var(--u)*3.375)] text-[length:calc(var(--u)*1.2)] text-ink-soft">{t('wall.drawnFrom', { n: fmt(reveal.poolSize) })}</div>
            </>
          )}
        </section>
      ) : (
      /*
       * An entrance screen, not a dashboard: one centred composition — the line, the QR with the
       * three steps on its left and the live numbers on its right — floating over the campus.
       * Bilingual on the screen itself, because the hall is mostly Thai visitors.
       */
      <section className="relative flex min-h-0 flex-1 flex-col items-center justify-center text-center">
        <span className="hall-badge a-mono inline-block px-[calc(var(--u)*1.3)] py-[calc(var(--u)*0.3094)] text-[length:calc(var(--u)*1.05)] font-semibold tracking-[.18em]">RECOVER THE FUTURE · กู้คืนอนาคต</span>
        <h1 className="a-hd m-0 mt-[calc(var(--u)*0.9)] text-[length:calc(var(--u)*4.9)] font-bold leading-[1.02] tracking-[-0.015em] text-[#0B1437]">
          Scan. Collect. <span className="hall-grad">Get rewards.</span>
        </h1>
        <p className="m-0 mt-[calc(var(--u)*0.5625)] text-[length:calc(var(--u)*1.75)] font-semibold text-[#1B2A5C]">สแกน QR ที่บูธ · สะสมคะแนน · รับรางวัล</p>

        <div className="mt-[calc(var(--u)*1.9125)] grid w-full grid-cols-[1fr_auto_1fr] items-center gap-[calc(var(--u)*3)]">
          <ol className="m-0 flex list-none flex-col items-end gap-[calc(var(--u)*0.8438)] p-0">
            {STEPS.map(([en, th], i) => (
              <li key={en} className="hall-glass flex w-[calc(var(--u)*23)] items-center gap-[calc(var(--u)*1)] px-[calc(var(--u)*1.2)] py-[calc(var(--u)*0.7313)] text-left">
                <span className="hall-num a-hd grid h-[calc(var(--u)*3)] w-[calc(var(--u)*3)] shrink-0 place-items-center text-[length:calc(var(--u)*1.5)] font-bold text-white">{i + 1}</span>
                <span className="leading-tight"><span className="block text-[length:calc(var(--u)*1.5)] font-bold text-white">{th}</span><span className="block text-[length:calc(var(--u)*1.02)] font-medium text-white/95">{en}</span></span>
              </li>
            ))}
          </ol>

          {/* The one thing a visitor at the door has to be able to act on. */}
          <div className="hall-qr relative flex flex-col items-center px-[calc(var(--u)*2)] pb-[calc(var(--u)*1.0125)] pt-[calc(var(--u)*1.125)]">
            <div className="a-hd text-[length:calc(var(--u)*1.6)] font-bold leading-tight text-[#0B1437]">สแกนเพื่อเริ่มภารกิจ</div>
            <div className="mb-[calc(var(--u)*1.0125)] text-[length:calc(var(--u)*0.95)] font-semibold tracking-[.04em] text-[#2B5BFF]">Scan to start the mission</div>
            <div className="relative">
              <span aria-hidden className="qr-brackets" style={{ inset: 'calc(var(--u)*-0.9)', ['--l' as string]: 'calc(var(--u)*2.2)', ['--w' as string]: 'calc(var(--u)*0.3)' }} />
              <div className="relative overflow-hidden bg-white"><QR value={APP_ORIGIN} size={qrSize} /><span aria-hidden className="qr-sweep-loop" /></div>
            </div>
            <div className="a-mono mt-[calc(var(--u)*1.0125)] text-[length:calc(var(--u)*1.2)] font-semibold text-[#1746E0]">{APP_ORIGIN.replace(/^https?:\/\//, '')}</div>
          </div>

          <div className="flex flex-col items-start gap-[calc(var(--u)*0.8438)]">
            {([['Agents', 'ผู้เข้าร่วม', ev.totals.visitors], ['Booth scans', 'การสแกนบูธ', ev.totals.stamps], ['Rewards given', 'มอบรางวัลแล้ว', ev.totals.redeemed]] as const).map(([en, th, v]) => (
              <div key={en} className="hall-glass flex w-[calc(var(--u)*23)] items-baseline gap-[calc(var(--u)*1)] px-[calc(var(--u)*1.4)] py-[calc(var(--u)*0.7313)] text-left">
                <span className="a-mono min-w-[calc(var(--u)*8)] text-[length:calc(var(--u)*2.8)] font-bold leading-none text-white [text-shadow:0_0_calc(var(--u)*1.2)_rgba(120,220,255,.9)]">{show(v)}</span>
                <span className="leading-tight"><span className="block text-[length:calc(var(--u)*1.4)] font-bold text-white">{th}</span><span className="block text-[length:calc(var(--u)*1)] font-medium text-white/95">{en}</span></span>
              </div>
            ))}
          </div>
        </div>
      </section>
      )}

      {/* One quiet line over the campus: the busiest booths once there are any, else the day. */}
      {!reveal && (
        <footer className="a-mono relative shrink-0 truncate pb-[calc(var(--u)*0.225)] text-center text-[length:calc(var(--u)*0.95)] font-medium tracking-[.2em] text-[#1B2A5C]">
          {top.length > 0
            ? <>BUSIEST NOW · {top.map((b) => b.shortName || pick(b.nameEn, b.nameTh)).join(' · ')}</>
            : <>ADT INNOFEST 2026 · IDEAS → SOLUTIONS → A BETTER TOMORROW</>}
        </footer>
      )}

      {/* Operator controls: only out of full screen, so the projected screen is the poster and nothing else. */}
      {!fs && (
        <div className="fixed bottom-[calc(var(--u)*0.7875)] right-[calc(var(--u)*1.4)] z-10 flex items-center gap-[calc(var(--u)*0.8)] rounded-[calc(var(--u)*0.4)] bg-white/90 px-[calc(var(--u)*0.8)] py-[calc(var(--u)*0.3375)] shadow-lg">
          <span className="stamp-text text-[length:calc(var(--u)*0.85)] text-ink-soft">{hint ?? t('wall.pressF')}</span>
          <Link to="/admin" className="btn-quiet inline-flex items-center gap-[calc(var(--u)*0.5)] px-[calc(var(--u)*1)] py-[calc(var(--u)*0.2813)] text-[length:calc(var(--u)*0.95)]">{t('wall.adminConsole')}</Link>
          <button className="btn-quiet inline-flex items-center gap-[calc(var(--u)*0.5)] px-[calc(var(--u)*1)] py-[calc(var(--u)*0.2813)] text-[length:calc(var(--u)*0.95)]" onClick={goFull}>{Icon.fullscreen}Full screen</button>
        </div>
      )}
    </main>
    </>
  )
}
