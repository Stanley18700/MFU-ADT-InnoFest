/**
 * The keepsake (the festival's "boarding pass", drawn as an Agency 2036 mission certificate) on a canvas. Pure drawing — no React, no Firestore — so it
 * can be rendered and looked at outside the app (scripts/check-boarding-pass.mjs does exactly
 * that in headless Chromium).
 */
const fmt = (n: number) => new Intl.NumberFormat('en-US').format(n)

export interface PassData { name: string; passportNo: string; stamps: number; points: number; eventName: string; dates: string }

/**
 * 1080×1350 (4:5) — the size a phone gallery and Instagram both take without cropping.
 *
 * The Agency 2036 keepsake: a mission certificate on the agency's white grid, a foil card with
 * a neon edge and cut corners, the InnoFest logo, the agent's name and figures, and a stub with
 * the thank-you and a barcode drawn from the agent ID.
 */
export async function drawPass(d: PassData): Promise<string> {
  const W = 1080, H = 1350
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('no canvas')
  // The app's own faces, if they are loaded (they are, inside the app); system ones otherwise.
  await Promise.all(['700 60px "Chakra Petch"', '600 40px "IBM Plex Mono"', '500 26px "IBM Plex Sans Thai"']
    .map((f) => document.fonts?.load(f).catch(() => null)))
  const DISPLAY = '"Chakra Petch", system-ui, sans-serif'
  const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace'
  const SANS = '"IBM Plex Sans Thai", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
  const INK = '#0A1433', MUTED = '#4A5875', BLUE = '#1450E6'

  // White ground with the agency's blue grid, fading out towards the bottom.
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H)
  for (let x = 0; x <= W; x += 48) { ctx.fillStyle = 'rgba(29,91,255,0.07)'; ctx.fillRect(x, 0, 2, H) }
  for (let y = 0; y <= H; y += 48) { ctx.fillStyle = 'rgba(29,91,255,0.07)'; ctx.fillRect(0, y, W, 2) }
  const fade = ctx.createLinearGradient(0, 0, 0, H)
  fade.addColorStop(0, 'rgba(255,255,255,0)'); fade.addColorStop(0.75, 'rgba(255,255,255,0.9)'); fade.addColorStop(1, '#FFFFFF')
  ctx.fillStyle = fade; ctx.fillRect(0, 0, W, H)

  /*
   * Layout first, paint second: the card's height depends on how many lines the agent's name
   * takes and whether the logo loaded, and the card is painted before anything sits on it.
   */
  const cx = 80, cy = 110, cw = W - 160, inner = cw - 96, left = cx + 48
  const logo = await loadImage('/brand/logo-innofest.webp').catch(() => null)
  const logoW = 560
  const logoH = logo ? (logo.height / logo.width) * logoW : 0
  const nameFont = `700 64px ${DISPLAY}`
  ctx.font = nameFont
  const nameLines = countLines(ctx, d.name || 'Field agent', inner, 2)
  let y = cy + 150
  const logoY = y
  y += logo ? logoH + 24 : 0
  const titleY = logo ? 0 : y + 30
  if (!logo) { ctx.font = `700 48px ${DISPLAY}`; y = titleY + countLines(ctx, d.eventName.toUpperCase(), inner, 2) * 56 + 10 }
  const certY = y + 30
  const nameY = certY + 70
  const figuresY = nameY + nameLines * 70 + 26
  const tearY = figuresY + 150
  const stubY = tearY + 54
  const ch = tearY - cy + 250
  if (cy + ch > H - 40) throw new Error('pass overflow')

  // The card: neon edge, foil body, two cut corners, a soft blue glow.
  const cut = 48
  const shape = (inset: number) => {
    const c = cut - inset * 0.4
    ctx.beginPath()
    ctx.moveTo(cx + inset + c, cy + inset); ctx.lineTo(cx + cw - inset, cy + inset); ctx.lineTo(cx + cw - inset, cy + ch - inset - c)
    ctx.lineTo(cx + cw - inset - c, cy + ch - inset); ctx.lineTo(cx + inset, cy + ch - inset); ctx.lineTo(cx + inset, cy + inset + c); ctx.closePath()
  }
  ctx.save()
  ctx.shadowColor = 'rgba(29,91,255,0.35)'; ctx.shadowBlur = 50; ctx.shadowOffsetY = 18
  const edge = ctx.createLinearGradient(cx, cy, cx + cw, cy + ch)
  edge.addColorStop(0, '#2E3CFF'); edge.addColorStop(0.55, '#00C8FF'); edge.addColorStop(1, '#7A5CFF')
  shape(0); ctx.fillStyle = edge; ctx.fill()
  ctx.restore()
  const foil = ctx.createLinearGradient(cx, cy, cx + cw, cy + ch)
  ;['#CFF3FF', '#C9D6FF', '#E7CCFF', '#C6FBEA', '#CCDDFF', '#F3D3FF'].forEach((c, i) => foil.addColorStop(i / 5, c))
  shape(5); ctx.fillStyle = foil; ctx.fill()
  // The foil's fine diagonal texture.
  ctx.save(); shape(5); ctx.clip()
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 4
  for (let i = -H; i < W; i += 18) { ctx.beginPath(); ctx.moveTo(i, cy); ctx.lineTo(i + ch, cy + ch); ctx.stroke() }
  ctx.restore()

  // Header line.
  ctx.textBaseline = 'middle'
  ctx.fillStyle = BLUE; ctx.font = `600 26px ${MONO}`; ctx.letterSpacing = '5px'
  fitText(ctx, 'MISSION COMPLETE · AGENCY OF TOMORROW', left, cy + 80, inner)
  ctx.letterSpacing = '0px'

  // InnoFest logo, or the event name in type when the image did not load.
  if (logo) ctx.drawImage(logo, cx + (cw - logoW) / 2, logoY, logoW, logoH)
  else { ctx.fillStyle = INK; ctx.font = `700 48px ${DISPLAY}`; wrapText(ctx, d.eventName.toUpperCase(), left, titleY, inner, 56, 2) }

  // "This certifies that agent" / name.
  ctx.textAlign = 'center'
  ctx.fillStyle = '#33415F'; ctx.font = `500 30px ${SANS}`
  ctx.fillText('This certifies that agent', W / 2, certY)
  ctx.fillStyle = INK; ctx.font = nameFont
  wrapCentered(ctx, d.name || 'Field agent', W / 2, nameY, inner, 70, 2)

  // Three figures, each in a white chip.
  const colW = (inner - 32) / 3
  ;[['FILES', fmt(d.stamps)], ['POINTS', fmt(d.points)], ['AGENT ID', d.passportNo || '—']].forEach(([k, v], i) => {
    const x = left + i * (colW + 16)
    ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.fillRect(x, figuresY, colW, 116)
    ctx.fillStyle = INK; ctx.font = i === 2 ? `600 32px ${MONO}` : `700 56px ${DISPLAY}`
    fitText(ctx, v, x + colW / 2, figuresY + 48, colW - 20)
    ctx.fillStyle = MUTED; ctx.font = `600 20px ${MONO}`; ctx.letterSpacing = '4px'
    ctx.fillText(k, x + colW / 2, figuresY + 92); ctx.letterSpacing = '0px'
  })

  // Tear line and stub.
  ctx.setLineDash([14, 12]); ctx.strokeStyle = 'rgba(10,20,51,0.25)'; ctx.lineWidth = 3
  ctx.beginPath(); ctx.moveTo(cx + 40, tearY); ctx.lineTo(cx + cw - 40, tearY); ctx.stroke()
  ctx.setLineDash([])
  ctx.fillStyle = INK; ctx.font = `700 32px ${DISPLAY}`
  fitText(ctx, 'Thank you for your field report · ขอบคุณสำหรับความคิดเห็น', W / 2, stubY, inner)
  ctx.fillStyle = MUTED; ctx.font = `500 24px ${MONO}`
  fitText(ctx, `${d.passportNo || 'ADT-IF'} · ${d.dates} · Indoor Stadium, MFU`, W / 2, stubY + 48, inner)
  ctx.textAlign = 'left'
  barcode(ctx, d.passportNo || d.name || 'ADT', left + 60, stubY + 86, inner - 120, 48)

  return canvas.toDataURL('image/png')
}

/** `wrapText`, centred on `cx`. */
function wrapCentered(ctx: CanvasRenderingContext2D, text: string, cx: number, y: number, maxW: number, lineH: number, maxLines = 2) {
  const words = text.split(/\s+/)
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxW && line) { lines.push(line); line = w; if (lines.length >= maxLines - 1) break } else line = test
  }
  if (line) {
    while (ctx.measureText(line).width > maxW && line.length > 1) line = line.slice(0, -2) + '…'
    lines.push(line)
  }
  lines.forEach((l, i) => ctx.fillText(l, cx, y + i * lineH))
}

/** Draws one line, shrinking the font until it fits `maxW`. */
function fitText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number) {
  const m = /(\d+)px/.exec(ctx.font)
  let size = m ? Number(m[1]) : 24
  while (ctx.measureText(text).width > maxW && size > 12) {
    size -= 1
    ctx.font = ctx.font.replace(/\d+px/, `${size}px`)
  }
  ctx.fillText(text, x, y)
}

/** How many lines `wrapText` will use, with the current font. */
function countLines(ctx: CanvasRenderingContext2D, text: string, maxW: number, maxLines: number): number {
  const words = text.split(/\s+/)
  let line = '', lines = 1
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxW && line) { lines++; line = w; if (lines >= maxLines) break } else line = test
  }
  return Math.min(lines, maxLines)
}

/** Deterministic bars from the text — decoration that looks like a barcode, not a real symbology. */
function barcode(ctx: CanvasRenderingContext2D, seed: string, x: number, y: number, w: number, h: number) {
  let hsh = 2166136261
  const bars: number[] = []
  for (let i = 0; i < 80; i++) {
    hsh ^= seed.charCodeAt(i % seed.length); hsh = Math.imul(hsh, 16777619) >>> 0
    bars.push(1 + (hsh % 4))
  }
  const total = bars.reduce((a, b) => a + b, 0) + bars.length
  const unit = w / total
  let px = x
  ctx.fillStyle = '#0A1433'
  for (const b of bars) { ctx.fillRect(px, y, b * unit, h); px += (b + 1) * unit }
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lineH: number, maxLines = 3): number {
  const words = text.split(/\s+/)
  let line = '', lines = 0
  for (const w of words) {
    const test = line ? `${line} ${w}` : w
    if (ctx.measureText(test).width > maxW && line) {
      ctx.fillText(line, x, y); y += lineH; lines++
      if (lines >= maxLines - 1) { line = w; break }
      line = w
    } else line = test
  }
  if (line) {
    while (ctx.measureText(line).width > maxW && line.length > 1) line = line.slice(0, -2) + '…'
    ctx.fillText(line, x, y)
  }
  return y + lineH
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error(`image ${src}`))
    img.src = src
  })
}
