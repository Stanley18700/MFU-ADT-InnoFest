/*
 * Game feel for the Agency 2036 screens: the small motions that make a tap feel answered and a
 * wait feel like progress. Everything here settles to the plain value at once under reduced
 * motion, and none of it changes what a screen does.
 */
import { useEffect, useRef, useState } from 'react'

export const reducedMotion = () => {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { return false }
}

/** A short buzz on phones that support it (Android); silently nothing elsewhere. */
export function haptic(pattern: number | number[] = 12) {
  try { if (!reducedMotion()) navigator.vibrate?.(pattern) } catch { /* not supported */ }
}

/** The last value each counter showed this session, so a return visit counts up from there. */
const lastShown = new Map<string, number>()

/**
 * A number that counts up to `target` like a score. `key` names the counter (the cover's points,
 * say): it starts from wherever that counter last stood, so 037 → 038 after a scan, not 000 → 038
 * on every visit. `from` overrides the start.
 */
export function useCountUp(target: number, { key, from, ms = 700 }: { key?: string; from?: number; ms?: number } = {}) {
  const start = from ?? (key ? lastShown.get(key) ?? 0 : 0)
  const [value, setValue] = useState(() => (reducedMotion() ? target : start))
  const raf = useRef(0)
  useEffect(() => {
    if (reducedMotion() || start === target) { setValue(target); if (key) lastShown.set(key, target); return }
    const t0 = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / ms)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(Math.round(start + (target - start) * eased))
      if (p < 1) raf.current = requestAnimationFrame(tick)
      else if (key) lastShown.set(key, target)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target])
  return value
}

/** Segments lighting up one after another — the agency's "working on it". */
export function SegLoader({ segments = 5, className = '', tone = 'blue' }: { segments?: number; className?: string; tone?: 'blue' | 'white' }) {
  return (
    <span aria-hidden className={`g-segs ${tone === 'white' ? 'g-segs-white' : ''} ${className}`}>
      {Array.from({ length: segments }, (_, i) => <i key={i} style={{ animationDelay: `${i * 0.11}s` }} />)}
    </span>
  )
}

/**
 * A boot-screen progress bar: climbs quickly, then slows as it nears the end, and is never
 * "done" until the screen it stands in for goes away. Honest about not knowing the real
 * progress — it only ever promises that something is happening.
 */
export function BootBar({ label }: { label: string }) {
  const [pct, setPct] = useState(reducedMotion() ? 60 : 4)
  useEffect(() => {
    if (reducedMotion()) return
    const id = setInterval(() => setPct((p) => (p >= 94 ? p : p + Math.max(1, Math.round((96 - p) / 9)))), 120)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="w-full">
      <div className="flex items-center justify-between gap-3">
        <span className="a-label flex items-center gap-2"><SegLoader segments={3} />{label}</span>
        <span className="a-mono text-xs font-semibold text-[#1450E6]">{String(pct).padStart(2, '0')}%</span>
      </div>
      <div aria-hidden className="g-boot mt-2"><span style={{ width: `${pct}%` }} /></div>
    </div>
  )
}

/** Over the camera while a code is checked: the lens dims, a readout scrambles, segments run. */
export function DecryptOverlay({ label }: { label: string }) {
  const [noise, setNoise] = useState('')
  useEffect(() => {
    const chars = '0123456789ABCDEF'
    const roll = () => setNoise(Array.from({ length: 3 }, () => Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * 16)]).join('')).join(' '))
    roll()
    if (reducedMotion()) return
    const id = setInterval(roll, 70)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="g-decrypt" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-3">
        <SegLoader segments={6} tone="white" />
        <span className="a-label !text-white">{label}</span>
        <span aria-hidden className="a-mono text-xs tracking-[.2em] text-[#7FE7FF]">{noise}</span>
      </div>
    </div>
  )
}

/**
 * Text that arrives scrambled and locks in left to right, like a code being decrypted. Same
 * length all the way through, so in a monospace face nothing around it moves.
 */
export function Scramble({ text, ms = 520, className = '' }: { text: string; ms?: number; className?: string }) {
  const [shown, setShown] = useState(text)
  useEffect(() => {
    if (reducedMotion()) { setShown(text); return }
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const done = Math.min(1, (now - start) / ms)
      const locked = Math.floor(done * text.length)
      setShown(text.split('').map((c, i) => (i < locked || c === ' ' ? c : chars[Math.floor(Math.random() * chars.length)])).join(''))
      if (done < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [text, ms])
  return <span className={className} aria-label={text}>{shown}</span>
}
