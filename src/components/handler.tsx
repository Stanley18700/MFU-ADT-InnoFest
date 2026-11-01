/*
 * HANDLER // 0 — the voice of the Agency 2036 story.
 *
 * A hooded, faceless figure transmitting from 2036; the story hints (never says) that it is a
 * future ADT student. It does not add any feature: it says what the screens already said, in
 * character. Three pieces:
 *
 *  - <HandlerAvatar>  the figure itself, an original drawing, with a glitching silhouette.
 *  - <Decode>         a line that arrives as machine signal (morse / binary), then decodes into
 *                     the reader's language. Switching EN/TH decodes it again into the new one.
 *  - <Transmission>   one decoded line with the avatar — the Handler's word on any screen.
 *
 * Motion rules: everything settles to plain readable text; under reduced motion it starts there.
 * Screen readers always get the final text (the animated layer is aria-hidden).
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useLocale } from '../lib/locale'

/* ------------------------------------------------------------------ avatar */

export function HandlerAvatar({ size = 44, live = true, className = '' }: { size?: number; live?: boolean; className?: string }) {
  // Three copies of the same drawing: the base, plus a cyan and a magenta ghost that split off
  // during the glitch bursts. Only the base is visible at rest.
  const figure = (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden>
      <defs>
        <linearGradient id="hd-hood" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#2E3CFF" />
          <stop offset="1" stopColor="#0A1433" />
        </linearGradient>
        <radialGradient id="hd-void" cx=".5" cy=".42" r=".6">
          <stop offset="0" stopColor="#0B1A4A" />
          <stop offset="1" stopColor="#02040E" />
        </radialGradient>
      </defs>
      {/* shoulders and cloak */}
      <path d="M4 64c2-11 11-17 28-17s26 6 28 17z" fill="#0A1433" stroke="#0A1433" strokeWidth="2" />
      <path d="M22 47l10 10 10-10" fill="none" stroke="#00D2FF" strokeWidth="1.2" opacity=".55" />
      {/* hood */}
      <path d="M32 5C18.5 5 11 17 11 30.5c0 9.5 4 17 9.5 21.5h23C49 47.5 53 40 53 30.5 53 17 45.5 5 32 5z" fill="url(#hd-hood)" stroke="#0A1433" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M32 7.5C20 7.5 13.5 18 13.5 30.5c0 8.5 3.4 15.2 8 19.3" fill="none" stroke="#00D2FF" strokeWidth="1.4" opacity=".95" />
      {/* the faceless void */}
      <path d="M32 14c-8.6 0-13.6 8-13.6 17.2 0 7.6 3.6 13.6 8.2 16.8h10.8c4.6-3.2 8.2-9.2 8.2-16.8C45.6 22 40.6 14 32 14z" fill="url(#hd-void)" stroke="#2E7BFF" strokeWidth="1" />
      <g className="hd-scan" opacity=".9">
        <rect x="19" y="30" width="26" height="1.6" fill="#00D2FF" />
      </g>
      <path d="M24 39h16M26 42.5h12" stroke="#1D5BFF" strokeWidth=".8" opacity=".45" />
    </svg>
  )
  return (
    <span className={`hd-av ${live ? 'hd-live' : ''} ${className}`} style={{ width: size, height: size }} aria-hidden>
      <span className="hd-av-base">{figure}</span>
      <span className="hd-av-c">{figure}</span>
      <span className="hd-av-m">{figure}</span>
    </span>
  )
}

/* ------------------------------------------------------------------ decoding text */

const reduced = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

/** Grapheme clusters, so a Thai vowel or tone mark is never split from its consonant. */
function graphemes(s: string): string[] {
  try {
    const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter
    if (Seg) return Array.from(new Seg(undefined, { granularity: 'grapheme' }).segment(s), (x) => x.segment)
  } catch { /* fall through */ }
  return Array.from(s)
}

/** The "machine" form of a line: morse-like dots and dashes drawn from each character's code. */
function signalOf(g: string[]): string {
  return g.map((c) => {
    if (c === ' ') return ' '
    const n = c.codePointAt(0) ?? 0
    const len = 2 + (n % 3)
    let out = ''
    for (let i = 0; i < len; i++) out += (n >> i) & 1 ? '−' : '·'
    return out
  }).join(' ').slice(0, Math.max(12, Math.round(g.length * 1.1)))
}

const NOISE = '01·−/<>#%█▓░'
const noise = () => NOISE[Math.floor(Math.random() * NOISE.length)]

/** Lines already decoded this session: shown settled when you come back to a screen. */
const seen = new Set<string>()

type Phase = 'signal' | 'decode' | 'done'

/**
 * A line that arrives as signal, then resolves into words. `instant` settles it at once (a tap
 * on the briefing); `onDone` fires once the words are fully readable.
 */
export function Decode({ text, instant = false, onDone, className = '', signalMs = 650, remember = true }: {
  text: string; instant?: boolean; onDone?: () => void; className?: string; signalMs?: number; remember?: boolean
}) {
  const g = useMemo(() => graphemes(text), [text])
  const skip = instant || reduced() || (remember && seen.has(text))
  const [phase, setPhase] = useState<Phase>(skip ? 'done' : 'signal')
  const [shown, setShown] = useState(skip ? g.length : 0)
  const [, tick] = useState(0)
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  // A new text after the first render — a language switch — always decodes again, into the new
  // language: that switch is the moment the story says the signal is being translated.
  const lastText = useRef(text)
  useLayoutEffect(() => {
    if (lastText.current === text) return
    lastText.current = text
    const s = reduced()
    setPhase(s ? 'done' : 'signal')
    setShown(s ? g.length : 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  // `instant` turning on (a tap) settles the line where it is.
  const wasInstant = useRef(instant)
  useEffect(() => {
    if (instant && !wasInstant.current) { setPhase('done'); setShown(g.length) }
    wasInstant.current = instant
  }, [instant, g.length])

  useEffect(() => {
    if (phase === 'signal') {
      const id = setTimeout(() => setPhase('decode'), signalMs)
      const fl = setInterval(() => tick((n) => n + 1), 90)
      return () => { clearTimeout(id); clearInterval(fl) }
    }
    if (phase === 'decode') {
      // About 1.3 s for a long line, never slower than one grapheme per 34 ms.
      const step = Math.max(1, Math.ceil(g.length / 38))
      const id = setInterval(() => {
        setShown((n) => {
          const next = Math.min(g.length, n + step)
          if (next >= g.length) setPhase('done')
          return next
        })
      }, 34)
      return () => clearInterval(id)
    }
    if (remember) seen.add(text)
    doneRef.current?.()
  }, [phase, g.length, signalMs, text, remember])

  const sig = useMemo(() => signalOf(g), [g])
  let visual: React.ReactNode
  if (phase === 'signal') {
    // The signal flickers: a few of its marks re-roll on each tick.
    const s = Array.from(sig).map((c) => (c !== ' ' && Math.random() < 0.12 ? noise() : c)).join('')
    visual = <span className="hd-signal">{s}</span>
  } else if (phase === 'decode') {
    const tail = g.slice(shown, shown + 14).map((c) => (c === ' ' ? ' ' : noise())).join('')
    visual = <>{g.slice(0, shown).join('')}<span className="hd-noise">{tail}</span></>
  } else {
    visual = text
  }

  return (
    <span className={`relative block ${className}`}>
      {/* Reserves the final size so the bubble never jumps while it decodes. */}
      <span className="invisible block" aria-hidden>{text}</span>
      <span className="absolute inset-0 block overflow-hidden" aria-hidden>{visual}</span>
      <span className="sr-only">{text}</span>
    </span>
  )
}

/* ------------------------------------------------------------------ the Handler's word on a screen */

export function Transmission({ text, tone = 'tint', className = '' }: { text: string; tone?: 'tint' | 'ink'; className?: string }) {
  const { t } = useLocale()
  const ink = tone === 'ink'
  return (
    <div role="status" className={`a-cut ${ink ? 'a-solid a-fill-id text-white' : 'a-solid a-fill-tint text-ink'} hd-tx flex items-start gap-3 px-3.5 py-3 ${className}`}>
      <HandlerAvatar size={40} />
      <div className="min-w-0 flex-1">
        <div className={`a-mono flex items-center gap-1.5 text-[10.5px] tracking-[.14em] ${ink ? 'text-[#7FE7FF]' : 'text-[#1450E6]'}`}>
          <span className="hd-dot" aria-hidden />{t('h.name')}
        </div>
        <Decode text={text} className="mt-0.5 text-[13.5px] leading-snug" signalMs={420} />
      </div>
    </div>
  )
}
