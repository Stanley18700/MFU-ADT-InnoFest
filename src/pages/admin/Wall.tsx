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

/** Big enough to scan from the middle of a hall, small enough to leave the board room. */
function qrPx() {
  if (typeof window === 'undefined') return 260
  return Math.round(Math.max(180, Math.min(window.innerWidth * 0.19, window.innerHeight * 0.38)))
}

const STEPS: Array<[string, string]> = [
  ['Sign up — Google is fastest', 'ลงทะเบียน'],
  ['Scan the QR at each booth', 'สแกน QR ที่บูธ'],
  ['Collect points, get rewards', 'สะสมคะแนน รับรางวัล'],
]

/**
 * The uplink streams: dashed threads of pale cyan light climbing out of the campus, as on the
 * closing-screen mock-up. Each is placed in % of the campus PICTURE (left, foot above its bottom
 * edge, height), so it stays on its rooftop at any screen shape; then a speed and a delay so no
 * two climb in step.
 */
const RAYS: Array<[number, number, number, number, number]> = [
  [4.5, 30, 20, 7, 0.4], [9, 22, 28, 9, 2.1], [12, 27, 23, 6, 1.2], [17.5, 36, 14, 8, 3],
  [22, 30, 20, 10, 0.8], [26.5, 24, 26, 6.5, 2.6], [30.5, 32, 18, 8.5, 1.7], [36, 42, 10, 7, 0.2],
  [39.5, 38, 12, 9.5, 2.2], [44.5, 46, 10, 7.5, 1], [49.3, 50, 10, 9, 0], [54, 44, 82, 6.5, 2.8],
  [59, 38, 90, 10, 1.4], [62.2, 46, 82, 7.5, 0.6], [67.5, 34, 76, 6, 2.4], [72, 28, 38, 8.5, 1.9],
  [76, 20, 46, 7, 0.9], [81, 33, 33, 9.5, 3.2], [86.5, 39, 27, 8, 0.3], [91, 30, 36, 6.5, 1.5],
  [95.5, 26, 102, 8.5, 2.5],
]

/**
 * The hall screen's ground, free of the app's design system on purpose (10 Nov): a pale sky with
 * a soft halo, the faintest grid, the campus and Doi Tung washed in light across the foot, and
 * the uplink streams rising out of it.
 */
function HallGround() {
  return (
    <div aria-hidden className="hall-ground pointer-events-none fixed inset-0 -z-20 overflow-hidden">
      <div className="hall-grid absolute inset-0" />
      <div className="hall-halo absolute inset-0" />
      {/* The festival mark, big, at the very back: the campus and Doi Tung stand in front of it. */}
      <img src="/brand/logo-innofest.webp" alt="" className="hall-mark absolute left-[58.5%] top-[12vh] w-[40vw] -translate-x-1/2" />
      {/* One box the shape of the picture: the streams are placed inside it, on the buildings. */}
      <div className="absolute bottom-0 left-1/2 aspect-[1200/394] w-[112vw] -translate-x-1/2">
        <img src="/brand/campus-holo.webp" alt="" className="hall-campus absolute inset-0 h-full w-full" />
        {RAYS.map(([x, foot, h, speed, d]) => (
          <span key={x} className="hall-ray" style={{ left: `${x}%`, bottom: `${foot}%`, height: `${h}%`, animationDuration: `${speed}s, ${speed * 0.9}s`, animationDelay: `-${d}s, -${d * 1.3}s` }} />
        ))}
      </div>
      <div className="hall-mist absolute inset-x-0 bottom-0 h-[14vh]" />
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
    <main className="on-stage relative flex h-dvh flex-col overflow-hidden px-[3.2vw] pb-[2.4vh] pt-[2.6vh] text-ink">
      <header className="relative flex shrink-0 items-start justify-between gap-[2vw]">
        <div className="flex items-center gap-[1vw] rounded-[0.5vw] bg-white/85 px-[1.1vw] py-[0.7vh] shadow-[0_0.3vw_1.4vw_rgba(29,91,255,.12)] backdrop-blur">
          <img src="/brand/mfu28.png" alt="" className="h-[2.9vw] w-auto" />
          <span className="h-[2vw] w-px bg-[#C9D4EA]" />
          <img src="/brand/adt-mark.png" alt="" className="h-[2vw] w-auto" />
          <span className="h-[2vw] w-px bg-[#C9D4EA]" />
          <img src="/brand/logo-innofest.webp" alt={pick(event.nameEn, event.nameTh)} className="h-[3.2vw] w-auto" />
        </div>
        <div className="absolute left-1/2 top-[0.4vh] -translate-x-1/2 text-center">
          <div className="a-mono flex items-center justify-center gap-[0.6vw] text-[1.05vw] font-semibold tracking-[.2em] text-[#1450E6]"><span className="mc-pulse" aria-hidden style={{ ['--tone' as string]: '#3BE38B' }} />AGENCY HQ · LIVE</div>
          <div className="mt-[0.3vh] text-[0.85vw] text-[#33415F]">กองบัญชาการ · ถ่ายทอดสด</div>
        </div>
        <div className="text-right">
          <div className="a-mono text-[3vw] font-semibold leading-none tracking-tight text-[#0A1433]">{clock}</div>
          <div className="a-mono mt-[0.6vh] text-[0.8vw] tracking-[.14em] text-[#33415F]">{dateLine}</div>
        </div>
      </header>
      <DataErrors className="mt-[1.5vh] text-[1.1vw]" />
      {reveal ? (
        <section className="flex flex-1 flex-col items-center justify-center text-center">
          <div className="stamp-text text-[1.4vw] text-action">
            {t(suspense ? 'wall.drawing' : reveal.names.length === 1 ? 'wall.winner' : 'wall.winners')}
          </div>
          {suspense ? (
            <Crest className="mt-[5vh] h-[16vw] w-[16vw] animate-pulse text-action" />
          ) : reveal.names.length === 0 ? (
            <p className="mt-[6vh] text-[3vw] text-ink-soft">{t('wall.nobodyEligible')}</p>
          ) : (
            <>
              <ol className="mt-[4vh] flex flex-col gap-[3vh]">
                {reveal.names.map((n, i) => (
                  /* Staggered, so a row of five names arrives one at a time rather than as a block. */
                  <li key={n.uid} className="winner-in" style={{ animationDelay: `${i * 120}ms` }}>
                    <div className="fig text-[6vw] leading-none">{n.displayName}</div>
                    <div className="mt-[1vh] font-mono text-[1.8vw] tracking-[0.2em] text-action">{n.passportNo}</div>
                  </li>
                ))}
              </ol>
              <div className="stamp-text mt-[6vh] text-[1.2vw] text-ink-soft">{t('wall.drawnFrom', { n: fmt(reveal.poolSize) })}</div>
            </>
          )}
        </section>
      ) : (
      /*
       * An entrance screen, not a dashboard. Everything sits along the top — the line, the steps
       * and the numbers on the left, the QR on the right — so the lower half of the screen belongs
       * to the campus and the light rising out of it, which is what people stop to look at.
       * Bilingual on the screen itself, because the hall is mostly Thai visitors.
       */
      <section className="relative grid min-h-0 flex-1 grid-cols-[1fr_auto] items-stretch gap-[4vw] pt-[2.4vh]">
        {/* The words at the top; the glass blocks low, floating over the campus. */}
        <div className="flex min-h-0 min-w-0 flex-col justify-between pb-[2.2vh]">
          <div>
            <span className="hall-badge a-mono inline-block px-[1.3vw] py-[0.6vh] text-[1.1vw] font-semibold tracking-[.18em]">RECOVER THE FUTURE · กู้คืนอนาคต</span>
            <h1 className="a-hd m-0 mt-[1.8vh] text-[5.6vw] font-bold leading-[0.98] tracking-[-0.015em] text-[#0B1437]">
              <span className="[text-shadow:0_0.2vw_1.6vw_rgba(255,255,255,.9)]">Scan. Collect.</span><br /><span className="hall-grad">Get rewards.</span>
            </h1>
            <p className="m-0 mt-[1.6vh] text-[2vw] font-semibold text-[#1B2A5C] [text-shadow:0_0_1vw_#fff]">สแกน QR ที่บูธ · สะสมคะแนน · รับรางวัล</p>
          </div>

          <div>
            <ol className="m-0 flex list-none gap-[1vw] p-0">
              {STEPS.map(([en, th], i) => (
                <li key={en} className="hall-glass flex items-center gap-[0.9vw] px-[1.1vw] py-[1.3vh] text-left">
                  <span className="hall-num a-hd grid h-[2.8vw] w-[2.8vw] shrink-0 place-items-center text-[1.4vw] font-bold text-white">{i + 1}</span>
                  <span className="leading-tight"><span className="block text-[1.25vw] font-semibold text-white">{th}</span><span className="block text-[0.85vw] text-white/80">{en}</span></span>
                </li>
              ))}
            </ol>
            <div className="mt-[1.4vh] flex gap-[1vw]">
              {([['Agents', 'ผู้เข้าร่วม', ev.totals.visitors], ['Booth scans', 'การสแกนบูธ', ev.totals.stamps], ['Rewards given', 'มอบรางวัลแล้ว', ev.totals.redeemed]] as const).map(([en, th, v]) => (
                <div key={en} className="hall-glass px-[1.4vw] py-[1.2vh] text-left">
                  <div className="a-mono text-[2.5vw] font-semibold leading-none text-white [text-shadow:0_0_1.2vw_rgba(120,220,255,.8)]">{show(v)}</div>
                  <div className="mt-[0.6vh] text-[0.95vw] font-semibold text-white">{th} <span className="font-normal text-white/75">· {en}</span></div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* The one thing a visitor at the door has to be able to act on. */}
        <div className="hall-qr relative flex flex-col items-center self-start px-[2.3vw] pb-[2.2vh] pt-[2.4vh]">
          <div className="a-hd text-[1.9vw] font-bold leading-tight text-[#0B1437]">สแกนเพื่อเริ่มภารกิจ</div>
          <div className="mb-[2.2vh] text-[1.1vw] font-semibold tracking-[.04em] text-[#2B5BFF]">Scan to start the mission</div>
          <div className="relative">
            <span aria-hidden className="qr-brackets" style={{ inset: '-1vw', ['--l' as string]: '2.4vw', ['--w' as string]: '0.32vw' }} />
            <div className="relative overflow-hidden bg-white"><QR value={APP_ORIGIN} size={qrSize} /><span aria-hidden className="qr-sweep-loop" /></div>
          </div>
          <div className="a-mono mt-[2.2vh] text-[1.35vw] font-semibold text-[#1746E0]">{APP_ORIGIN.replace(/^https?:\/\//, '')}</div>
        </div>
      </section>
      )}

      {/* One quiet line over the campus: the busiest booths once there are any, else the day. */}
      {!reveal && (
        <footer className="a-mono relative shrink-0 truncate pb-[0.4vh] text-center text-[0.95vw] font-medium tracking-[.2em] text-[#1B2A5C]">
          {top.length > 0
            ? <>BUSIEST NOW · {top.map((b) => b.shortName || pick(b.nameEn, b.nameTh)).join(' · ')}</>
            : <>ADT INNOFEST 2026 · IDEAS → SOLUTIONS → A BETTER TOMORROW</>}
        </footer>
      )}

      {/* Operator controls: only out of full screen, so the projected screen is the poster and nothing else. */}
      {!fs && (
        <div className="fixed bottom-[1.4vh] right-[1.4vw] z-10 flex items-center gap-[0.8vw] rounded-[0.4vw] bg-white/90 px-[0.8vw] py-[0.6vh] shadow-lg">
          <span className="stamp-text text-[0.85vw] text-ink-soft">{hint ?? t('wall.pressF')}</span>
          <Link to="/admin" className="btn-quiet inline-flex items-center gap-[0.5vw] px-[1vw] py-[0.5vh] text-[0.95vw]">{t('wall.adminConsole')}</Link>
          <button className="btn-quiet inline-flex items-center gap-[0.5vw] px-[1vw] py-[0.5vh] text-[0.95vw]" onClick={goFull}>{Icon.fullscreen}Full screen</button>
        </div>
      )}
    </main>
    </>
  )
}
