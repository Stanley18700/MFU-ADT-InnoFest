import QRCode from 'qrcode'

/**
 * The exhibitor's share card: a 1080×1350 (4:5) poster for Instagram, Facebook and LINE.
 *
 *   invite — before the event (or by choice on the day): who, where, when, "scan to join"
 *   stats  — on the event day: visitors so far, plus the rank (top 20 only) and the star rating
 *            (4.0 or better, from 5 ratings) when they flatter rather than embarrass
 *
 * A QR in the corner opens the booth's invite link. Drawn on the phone, never uploaded.
 */
export const CARD_W = 1080
export const CARD_H = 1350

export interface BoothCardData {
  mode: 'invite' | 'stats'
  shortName: string
  name: string
  hostUnit?: string
  where: string
  link: string
  visitors?: number
  rank?: number | null
  boothCount?: number
  rating?: number | null
  labels: {
    eyebrowInvite: string; eyebrowStats: string; findUs: string; date: string
    agents: string; rank: string; rating: string; scan: string; tag: string
  }
}

const DISPLAY = '"Chakra Petch", "IBM Plex Sans Thai", system-ui, sans-serif'
const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace'

let assets: Promise<{ innofest: HTMLImageElement | null; adt: HTMLImageElement | null; mfu: HTMLImageElement | null }> | null = null
function loadAssets() {
  assets ??= Promise.all([
    loadImage('/brand/logo-innofest.webp').catch(() => null),
    loadImage('/brand/adt-mark.png').catch(() => null),
    loadImage('/brand/mfu28.png').catch(() => null),
    ...['700 64px "Chakra Petch"', '600 32px "IBM Plex Mono"', '700 56px "IBM Plex Sans Thai"'].map((f) => document.fonts?.load(f).catch(() => null)),
  ]).then(([innofest, adt, mfu]) => ({ innofest: innofest as HTMLImageElement | null, adt: adt as HTMLImageElement | null, mfu: mfu as HTMLImageElement | null }))
  return assets
}

export async function drawBoothCard(d: BoothCardData): Promise<HTMLCanvasElement> {
  const { innofest, adt, mfu } = await loadAssets()
  const W = CARD_W, H = CARD_H
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const ctx = c.getContext('2d')!

  // Ground: deep navy into agency blue, a faint grid, a cyan glow behind the headline.
  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#060B26'); bg.addColorStop(0.55, '#0B1A5C'); bg.addColorStop(1, '#1D3BD8')
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = 'rgba(127,231,255,0.07)'; ctx.lineWidth = 2
  for (let x = 0; x <= W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
  for (let y = 0; y <= H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }
  const glow = ctx.createRadialGradient(W * 0.3, H * 0.42, 40, W * 0.3, H * 0.42, 620)
  glow.addColorStop(0, 'rgba(0,210,255,0.28)'); glow.addColorStop(1, 'rgba(0,210,255,0)')
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H)

  // Holographic border, as on the agent photo.
  const B = 22
  const holo = ctx.createLinearGradient(0, 0, W, H)
  holo.addColorStop(0, '#7FE7FF'); holo.addColorStop(0.35, '#1D5BFF'); holo.addColorStop(0.7, '#9B7BFF'); holo.addColorStop(1, '#FFC93C')
  ctx.fillStyle = holo
  ctx.fillRect(0, 0, W, B); ctx.fillRect(0, H - B, W, B); ctx.fillRect(0, 0, B, H); ctx.fillRect(W - B, 0, B, H)

  const L = 84, R = W - 84
  // Top: MFU + ADT on a white badge; the eyebrow on the right.
  const by = 70, bh = 96
  const mfuW = mfu ? bh - 22 : 0
  const adtH = 54, adtW = adt ? (adt.width / adt.height) * adtH : 0
  const bw = 26 + mfuW + (mfu && adt ? 30 : 0) + adtW + 26
  roundRect(ctx, L, by, bw, bh, 20); ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill()
  let lx = L + 26
  if (mfu) { ctx.drawImage(mfu, lx, by + 11, mfuW, mfuW); lx += mfuW }
  if (mfu && adt) { ctx.fillStyle = '#C9D4EA'; ctx.fillRect(lx + 14, by + 22, 2, bh - 44); lx += 30 }
  if (adt) ctx.drawImage(adt, lx, by + (bh - adtH) / 2, adtW, adtH)
  ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#7FE7FF'; ctx.font = `600 28px ${MONO}`
  ctx.fillText(d.mode === 'stats' ? d.labels.eyebrowStats : d.labels.eyebrowInvite, R, by + 42)
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = `600 24px ${MONO}`
  ctx.fillText('ADT INNOFEST 2026', R, by + 80)

  // Booth number and project name.
  ctx.textAlign = 'left'
  let y = 300
  ctx.fillStyle = '#FFC93C'; ctx.font = `700 44px ${MONO}`
  ctx.fillText(`BOOTH ${d.shortName}`, L, y)
  y += 30
  ctx.font = `700 76px ${DISPLAY}`; ctx.fillStyle = '#FFFFFF'
  const lines = wrap(ctx, d.name, R - L, d.mode === 'stats' ? 2 : 3)
  for (const line of lines) { y += 88; ctx.fillText(line, L, y) }
  if (d.hostUnit) { y += 56; ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.font = `500 32px ${DISPLAY}`; ctx.fillText(clip(ctx, d.hostUnit, R - L), L, y) }

  // The middle: the numbers, or the invitation.
  y += 90
  if (d.mode === 'stats' && typeof d.visitors === 'number') {
    ctx.fillStyle = '#7FE7FF'; ctx.shadowColor = 'rgba(0,210,255,0.8)'; ctx.shadowBlur = 30
    ctx.font = `700 170px ${MONO}`; ctx.fillText(String(d.visitors), L - 6, y + 128)
    ctx.shadowBlur = 0
    y += 182
    ctx.fillStyle = '#FFFFFF'; ctx.font = `700 38px ${DISPLAY}`; ctx.fillText(d.labels.agents, L, y)
    const chips: string[] = []
    if (d.rank && d.rank <= 20) chips.push(d.labels.rank.replace('{rank}', String(d.rank)).replace('{count}', String(d.boothCount ?? '')))
    if (d.rating && d.rating >= 4) chips.push(d.labels.rating.replace('{rating}', d.rating.toFixed(1)))
    let cx = L; y += 40
    ctx.font = `700 30px ${MONO}`
    for (const chip of chips) {
      const w = ctx.measureText(chip).width + 44
      roundRect(ctx, cx, y, w, 64, 14); ctx.fillStyle = 'rgba(255,201,60,0.16)'; ctx.fill()
      ctx.strokeStyle = '#FFC93C'; ctx.lineWidth = 3; ctx.stroke()
      ctx.fillStyle = '#FFC93C'; ctx.fillText(chip, cx + 22, y + 43)
      cx += w + 18
    }
  } else {
    ctx.fillStyle = '#FFFFFF'; ctx.font = `700 48px ${DISPLAY}`; ctx.fillText(d.labels.findUs, L, y + 20)
    ctx.fillStyle = '#7FE7FF'; ctx.font = `600 32px ${MONO}`
    ctx.fillText(d.labels.date, L, y + 80)
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = `600 32px ${MONO}`
    ctx.fillText(clip(ctx, d.where, R - L), L, y + 130)
  }

  // Bottom: the InnoFest logo, and the QR to the booth's invite link.
  const q = 224, qx = R - q, qy = H - 110 - q - 64
  roundRect(ctx, qx - 18, qy - 18, q + 36, q + 36, 20); ctx.fillStyle = '#FFFFFF'; ctx.fill()
  const qr = document.createElement('canvas')
  await QRCode.toCanvas(qr, d.link, { width: q, margin: 0, errorCorrectionLevel: 'M', color: { dark: '#060B26', light: '#FFFFFF' } })
  ctx.drawImage(qr, qx, qy, q, q)
  ctx.textAlign = 'center'; ctx.fillStyle = '#FFFFFF'; ctx.font = `700 26px ${MONO}`
  ctx.fillText(d.labels.scan, qx + q / 2, qy + q + 56)
  if (innofest) {
    const lw = 400, lh = (innofest.height / innofest.width) * lw
    ctx.drawImage(innofest, L - 10, qy + q + 40 - lh, lw, lh)
  }
  ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = `600 24px ${MONO}`
  ctx.fillText(d.labels.tag, W / 2, H - B - 24)
  return c
}

export function cardBlob(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not make the picture'))), 'image/png'))
}

export function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): string[] {
  // Thai has no spaces between words: split on real word boundaries where the browser knows them,
  // and only break inside a "word" when one alone is wider than the line.
  const Seg = (Intl as unknown as { Segmenter?: new (l: string, o: { granularity: string }) => { segment(s: string): Iterable<{ segment: string }> } }).Segmenter
  const words = Seg ? [...new Seg('th', { granularity: 'word' }).segment(text)].map((x) => x.segment) : text.split(/(\s+)/)
  const out: string[] = []
  let cur = ''
  for (const w of words) {
    const tryLine = cur + w
    if (ctx.measureText(tryLine).width <= maxW || !cur.trim()) { cur = tryLine; continue }
    out.push(cur.trim()); cur = w.trimStart()
  }
  if (cur.trim()) out.push(cur.trim())
  const lines: string[] = []
  for (let line of out) {
    while (ctx.measureText(line).width > maxW) {
      let i = line.length
      while (i > 1 && ctx.measureText(line.slice(0, i)).width > maxW) i--
      lines.push(line.slice(0, i)); line = line.slice(i)
    }
    lines.push(line)
  }
  if (lines.length > maxLines) { const kept = lines.slice(0, maxLines); kept[maxLines - 1] = clip(ctx, kept[maxLines - 1] + '…', maxW); return kept }
  return lines
}
export function clip(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  let t = text
  while (ctx.measureText(t).width > maxW && t.length > 3) t = t.slice(0, -2) + '…'
  return t
}
export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath()
}
export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src })
}
