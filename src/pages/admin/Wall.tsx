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
  return Math.round(Math.max(180, Math.min(window.innerWidth * 0.19, window.innerHeight * 0.36)))
}

const STEPS: Array<[string, string]> = [
  ['Sign up — Google is fastest', 'ลงทะเบียน'],
  ['Scan the QR at each booth', 'สแกน QR ที่บูธ'],
  ['Collect points, get rewards', 'สะสมคะแนน รับรางวัล'],
]

/**
 * The uplink beams: hair-thin columns of one cyan, each standing on a building of the campus
 * picture and fading out high above it. Positions are in % of the PICTURE (left, foot above its
 * bottom edge, height), so a beam stays on its rooftop at any screen shape. Last is the delay.
 */
const RAYS: Array<[number, number, number, number]> = [
  [12, 27, 78, 0],      // the small hall on the left
  [22, 30, 118, 1.6],   // the long building
  [30.5, 32, 66, 0.7],  // the tiered roof beside it
  [39.5, 38, 104, 2.3], // left wing of the main court
  [49.3, 50, 92, 0.3],  // the hall at the head of the court
  [59, 38, 110, 1.9],   // right wing of the main court
  [62.2, 46, 60, 1.1],  // the block behind it
  [76, 20, 84, 2.7],    // the lake
  [86.5, 39, 98, 0.9],  // the pavilion on the right
]

/**
 * The hall screen's ground: a pale sky, the agency grid, the campus and Doi Tung in the agency
 * blue across the lower half, and thin uplink rays rising out of the buildings.
 */
function HallGround() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-20 overflow-hidden bg-[linear-gradient(180deg,#F8FBFF_0%,#EEF4FF_45%,#DCE8FF_100%)]">
      <div className="a-grid" />
      <div className="absolute inset-0 bg-[radial-gradient(60%_45%_at_50%_62%,rgba(0,200,255,.22),transparent_70%)]" />
      {/* One box the shape of the picture: the beams are placed inside it, on the buildings. */}
      <div className="absolute bottom-0 left-1/2 aspect-[1200/394] w-[104vw] -translate-x-1/2">
        <img src="/brand/campus-holo.webp" alt="" className="hall-campus absolute inset-0 h-full w-full" />
        {RAYS.map(([x, foot, h, d]) => (
          <span key={x} className="hall-ray" style={{ left: `${x}%`, bottom: `${foot}%`, height: `${h}%`, animationDelay: `${d}s` }} />
        ))}
      </div>
      <div className="absolute inset-x-0 bottom-0 h-[12vh] bg-gradient-to-t from-white/70 to-transparent" />
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
       * An entrance screen, not a dashboard: what this is, how to start, and the QR — over the
       * campus at the foot of Doi Tung with the uplink rays rising out of it. Bilingual on the
       * screen itself, because the hall is mostly Thai visitors and the screen has no toggle
       * anybody can reach.
       */
      <section className="relative grid min-h-0 flex-1 grid-cols-[1.15fr_0.85fr] items-center gap-[4vw] pb-[1vh]">
        <div className="flex min-h-0 flex-col justify-center">
          <div><span className="wall-badge a-hd inline-block px-[1.3vw] py-[0.7vh] text-[1.25vw] font-bold">RECOVER THE FUTURE · กู้คืนอนาคต</span></div>
          <h1 className="a-hd m-0 mt-[2.4vh] text-[5.2vw] font-bold leading-[0.98] tracking-[-0.01em] text-[#0A1433]">
            Scan. Collect.<br /><span className="wall-grad">Get rewards.</span>
          </h1>
          <p className="m-0 mt-[1.8vh] text-[1.9vw] font-semibold leading-snug text-[#0A1433] [text-shadow:0_0_0.6vw_#fff,0_0_0.3vw_#fff]">สแกน QR ที่บูธ สะสมคะแนน รับรางวัล</p>

          <ol className="m-0 mt-[3.2vh] flex list-none flex-wrap gap-[1vw] p-0">
            {STEPS.map(([en, th], i) => (
              <li key={en} className="wall-chip flex items-center gap-[0.9vw] px-[1.1vw] py-[1.1vh]">
                <span className="fig wall-step-n grid h-[2.6vw] w-[2.6vw] shrink-0 place-items-center text-[1.3vw] !text-white">{i + 1}</span>
                <span className="leading-tight"><span className="block text-[1.15vw] font-semibold text-[#0A1433]">{th}</span><span className="block text-[0.85vw] text-[#33415F]">{en}</span></span>
              </li>
            ))}
          </ol>
        </div>

        <div className="flex min-h-0 flex-col items-center justify-center">
          {/* The one thing a visitor at the door has to be able to act on. */}
          <div className="wall-qrcard flex flex-col items-center px-[2.4vw] pb-[2.2vh] pt-[2.4vh]">
            <div className="a-hd text-center text-[1.7vw] font-bold leading-tight text-[#0A1433]">สแกนเพื่อเริ่มภารกิจ</div>
            <div className="mb-[2.2vh] text-center text-[1.05vw] font-semibold text-[#1D5BFF]">Scan to start the mission</div>
            <div className="relative">
              <span aria-hidden className="qr-brackets" style={{ inset: '-1.1vw', ['--l' as string]: '2.6vw', ['--w' as string]: '0.35vw' }} />
              <div className="relative overflow-hidden bg-white"><QR value={APP_ORIGIN} size={qrSize} /><span aria-hidden className="qr-sweep-loop" /></div>
            </div>
            <div className="fig mt-[2.4vh] text-[1.35vw] text-[#1450E6]">{APP_ORIGIN.replace(/^https?:\/\//, '')}</div>
          </div>
        </div>
      </section>
      )}

      {/* The live strip along the foot: three counters, then the busiest booths once there are any. */}
      {!reveal && (
        <footer className="relative flex shrink-0 items-stretch gap-[1vw]">
          {([['Agents', 'ผู้เข้าร่วม', ev.totals.visitors], ['Booth scans', 'การสแกนบูธ', ev.totals.stamps], ['Rewards given', 'มอบรางวัลแล้ว', ev.totals.redeemed]] as const).map(([en, th, v]) => (
            <div key={en} className="wall-stat px-[1.4vw] py-[1vh]">
              <div className="fig text-[2.6vw] leading-none text-[#1D5BFF]">{show(v)}</div>
              <div className="mt-[0.5vh] text-[0.85vw] font-semibold text-[#0A1433]">{th} <span className="font-normal text-[#33415F]">· {en}</span></div>
            </div>
          ))}
          {top.length > 0 && (
            <div className="wall-stat min-w-0 flex-1 px-[1.4vw] py-[1vh]">
              <div className="a-mono text-[0.8vw] font-semibold tracking-[.16em] text-[#1450E6]">BUSIEST BOOTHS · บูธยอดนิยมตอนนี้</div>
              <ol className="m-0 mt-[0.8vh] flex list-none gap-[0.8vw] overflow-hidden p-0">
                {top.map((b, i) => (
                  <li key={b.id} className="flex min-w-0 flex-1 items-center gap-[0.5vw] text-[0.95vw]">
                    <span className={`fig shrink-0 px-[0.45vw] py-[0.2vh] text-[0.85vw] ${i === 0 ? 'bg-[#FFC93C] text-[#0A1433]' : 'bg-[#0A1433] text-white'}`}>{b.shortName || i + 1}</span>
                    <span className="min-w-0 truncate text-[#0A1433]">{pick(b.nameEn, b.nameTh)}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
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
