/**
 * The agent photo: a selfie (or any photo) inside the InnoFest frame, as a 1080×1350 (4:5)
 * picture that Instagram, Facebook and a phone gallery all take without cropping.
 *
 * Drawn in two layers so the camera preview can show the frame live: `drawFrame` paints only the
 * frame (transparent where the photo shows) and the app lays it over the video as an image; at
 * the shutter, `composePhoto` draws the camera frame and the same frame layer into one picture.
 * Pure canvas — no React, no Firestore.
 */
export const PHOTO_W = 1080
export const PHOTO_H = 1350

export interface FrameData {
  name: string
  agentId: string
  points: number
  rank: string
  /** "11 NOV 2026 · INDOOR STADIUM MFU" */
  place: string
  tag: string
}

const DISPLAY = '"Chakra Petch", "IBM Plex Sans Thai", system-ui, sans-serif'
const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace'

let assets: Promise<{ innofest: HTMLImageElement | null; adt: HTMLImageElement | null; mfu: HTMLImageElement | null }> | null = null
function loadAssets() {
  assets ??= Promise.all([
    loadImage('/brand/logo-innofest.webp').catch(() => null),
    loadImage('/brand/adt-mark.png').catch(() => null),
    loadImage('/brand/mfu28.png').catch(() => null),
    ...['700 56px "Chakra Petch"', '600 32px "IBM Plex Mono"', '600 40px "IBM Plex Sans Thai"'].map((f) => document.fonts?.load(f).catch(() => null)),
  ]).then(([innofest, adt, mfu]) => ({ innofest: innofest as HTMLImageElement | null, adt: adt as HTMLImageElement | null, mfu: mfu as HTMLImageElement | null }))
  return assets
}

/** The frame alone, transparent in the middle: for the live preview and for the final picture. */
export async function drawFrame(d: FrameData): Promise<HTMLCanvasElement> {
  const { innofest, adt, mfu } = await loadAssets()
  const W = PHOTO_W, H = PHOTO_H
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const ctx = c.getContext('2d')!

  // Top shade so the logos read over a bright ceiling; bottom shade for the agent's details.
  const top = ctx.createLinearGradient(0, 0, 0, 260)
  top.addColorStop(0, 'rgba(6,11,38,0.70)'); top.addColorStop(1, 'rgba(6,11,38,0)')
  ctx.fillStyle = top; ctx.fillRect(0, 0, W, 260)
  const bot = ctx.createLinearGradient(0, H - 520, 0, H)
  bot.addColorStop(0, 'rgba(6,11,38,0)'); bot.addColorStop(0.45, 'rgba(6,11,38,0.72)'); bot.addColorStop(1, 'rgba(6,11,38,0.94)')
  ctx.fillStyle = bot; ctx.fillRect(0, H - 520, W, 520)

  // Holographic border: cyan → blue → violet → gold, with a thin white inner line.
  const B = 26
  const holo = ctx.createLinearGradient(0, 0, W, H)
  holo.addColorStop(0, '#7FE7FF'); holo.addColorStop(0.35, '#1D5BFF'); holo.addColorStop(0.7, '#9B7BFF'); holo.addColorStop(1, '#FFC93C')
  ctx.fillStyle = holo
  ctx.fillRect(0, 0, W, B); ctx.fillRect(0, H - B, W, B); ctx.fillRect(0, 0, B, H); ctx.fillRect(W - B, 0, B, H)
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3
  ctx.strokeRect(B + 1.5, B + 1.5, W - 2 * B - 3, H - 2 * B - 3)

  // Corner brackets, the app's "tap here" mark, in cyan.
  ctx.strokeStyle = '#7FE7FF'; ctx.lineWidth = 8; ctx.lineCap = 'square'
  ctx.shadowColor = 'rgba(0,210,255,0.9)'; ctx.shadowBlur = 14
  const m = B + 34, L = 70
  for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]] as const) {
    ctx.beginPath(); ctx.moveTo(x, y + sy * L); ctx.lineTo(x, y); ctx.lineTo(x + sx * L, y); ctx.stroke()
  }
  ctx.shadowBlur = 0

  // MFU + ADT on a white badge (both marks are coloured for a light ground).
  const bx = B + 54, by = B + 50, bh = 104
  const mfuW = mfu ? bh - 24 : 0
  const adtH = 58, adtW = adt ? (adt.width / adt.height) * adtH : 0
  const bw = 28 + mfuW + (mfu && adt ? 34 : 0) + adtW + 28
  roundRect(ctx, bx, by, bw, bh, 22)
  ctx.fillStyle = 'rgba(255,255,255,0.94)'; ctx.fill()
  let lx = bx + 28
  if (mfu) { ctx.drawImage(mfu, lx, by + 12, mfuW, mfuW); lx += mfuW }
  if (mfu && adt) { ctx.fillStyle = '#C9D4EA'; ctx.fillRect(lx + 16, by + 24, 2, bh - 48); lx += 34 }
  if (adt) ctx.drawImage(adt, lx, by + (bh - adtH) / 2, adtW, adtH)

  // Top right: the agency stamp.
  ctx.textAlign = 'right'; ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = '#FFFFFF'; ctx.font = `600 30px ${MONO}`
  ctx.fillText('AGENCY OF TOMORROW', W - B - 58, by + 44)
  ctx.fillStyle = '#7FE7FF'; ctx.font = `600 26px ${MONO}`
  ctx.fillText('FIELD ID · 2036', W - B - 58, by + 84)

  // Bottom: the InnoFest logo on the left, the agent on the right.
  const logoW = 400, logoH = innofest ? (innofest.height / innofest.width) * logoW : 0
  const baseY = H - B - 70
  if (innofest) {
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 18
    ctx.drawImage(innofest, B + 40, baseY - logoH + 10, logoW, logoH)
    ctx.shadowBlur = 0
  }
  const rx = W - B - 58, maxW = W - B - 58 - (B + 40 + logoW + 30)
  ctx.textAlign = 'right'
  ctx.fillStyle = '#7FE7FF'; ctx.font = `600 26px ${MONO}`
  ctx.fillText('AGENT', rx, baseY - 200)
  ctx.fillStyle = '#FFFFFF'; ctx.font = `700 56px ${DISPLAY}`
  fit(ctx, d.name || 'Field agent', rx, baseY - 142, maxW, 56, DISPLAY)
  ctx.fillStyle = '#7FE7FF'; ctx.font = `600 34px ${MONO}`
  ctx.fillText(d.agentId, rx, baseY - 92)
  ctx.fillStyle = '#FFC93C'; ctx.font = `700 30px ${MONO}`
  ctx.fillText(`${String(d.points).padStart(3, '0')} FILES · ${d.rank.toUpperCase()}`, rx, baseY - 44)
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = `600 24px ${MONO}`
  ctx.fillText(d.place, rx, baseY)
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = `600 26px ${MONO}`
  ctx.textAlign = 'center'
  ctx.fillText(d.tag, W / 2, H - B - 22)
  return c
}

/**
 * The finished picture: `source` (a video frame or a photo) cover-cropped to 4:5 under the frame.
 * `mirror` flips it the way the front camera's preview showed it.
 */
export function composePhoto(source: CanvasImageSource & { videoWidth?: number; naturalWidth?: number }, sw: number, sh: number, frame: HTMLCanvasElement, mirror: boolean): HTMLCanvasElement {
  const W = PHOTO_W, H = PHOTO_H
  const c = document.createElement('canvas')
  c.width = W; c.height = H
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#0A1433'; ctx.fillRect(0, 0, W, H)
  const s = Math.max(W / sw, H / sh)
  const dw = sw * s, dh = sh * s
  ctx.save()
  if (mirror) { ctx.translate(W, 0); ctx.scale(-1, 1) }
  ctx.drawImage(source, (W - dw) / 2, (H - dh) / 2, dw, dh)
  ctx.restore()
  ctx.drawImage(frame, 0, 0)
  return c
}

export function toJpeg(c: HTMLCanvasElement): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not make the picture'))), 'image/jpeg', 0.92))
}

function fit(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, size: number, family: string) {
  let s = size
  while (s > 30 && ctx.measureText(text).width > maxW) { s -= 2; ctx.font = `700 ${s}px ${family}` }
  let t = text
  while (ctx.measureText(t).width > maxW && t.length > 3) t = t.slice(0, -2) + '…'
  ctx.fillText(t, x, y)
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath()
  ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r)
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h)
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r)
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath()
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src })
}
