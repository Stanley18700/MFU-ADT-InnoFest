import { useState } from 'react'
import { Link } from 'react-router-dom'
import QRCode from 'qrcode'
import { QR } from '../../components/QR'
import { Icon } from '../../components/ui'
import { IOS } from '../../components/AgentPhoto'
import { useBooths } from '../../lib/data'
import { APP_ORIGIN } from '../../lib/firebase'
import { useLocale } from '../../lib/locale'
import { cardBlob, loadImage, roundRect, wrap } from '../../lib/boothCard'

type Paper = 'A4' | 'A3'

/**
 * The event poster: one bilingual sheet with the join QR, for the entrances, notice boards and
 * faculty walls, printed at A4 or A3. "Save as image" draws the same poster at 1080×1350 for
 * Instagram, Facebook and LINE.
 */
export default function Poster() {
  const { t } = useLocale()
  const booths = useBooths().filter((b) => b.active && !b.isPrizeDesk).length
  const [paper, setPaper] = useState<Paper>('A4')
  const [busy, setBusy] = useState(false)
  const [hold, setHold] = useState<string | null>(null)
  const host = APP_ORIGIN.replace(/^https?:\/\//, '')
  const L = (k: Parameters<typeof t>[0], v?: Record<string, string | number>) => t(k, v)

  async function saveImage() {
    setBusy(true)
    try {
      const c = await drawPoster({
        link: APP_ORIGIN, host,
        eyebrow: L('po.eyebrow'), head: L('po.head'), headTh: L('po.headTh'), pitch: L('po.pitch'), pitchTh: L('po.pitchTh'),
        when: L('po.when'), where: L('po.where'), whereTh: L('po.whereTh'), booths: booths ? L('po.boothsN', { n: booths }) : '',
        scan: L('po.scan'), scanTh: L('po.scanTh'), free: L('po.free'), tag: L('po.tag'),
      })
      const blob = await cardBlob(c)
      const file = new File([blob], 'adt-innofest-2026.png', { type: 'image/png' })
      if (IOS || navigator.canShare?.({ files: [file] })) {
        try { await navigator.share({ files: [file] }); return } catch (e) { if ((e as { name?: string }).name === 'AbortError') return }
        if (IOS) { setHold(c.toDataURL('image/png')); return }
      }
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'adt-innofest-2026.png'
      document.body.appendChild(a); a.click(); a.remove()
    } finally { setBusy(false) }
  }

  return (
    <div className="admin-console min-h-full bg-[#E9EEF8] print:bg-white">
      <style>{`@page { size: ${paper}; margin: 0; } @media print { .po-sheet { width: 100% !important; height: 100vh !important; max-width: none !important; } }`}</style>
      <div className="on-stage mx-auto max-w-[210mm] p-4 print:p-0">
        <div className="card mb-5 flex flex-wrap items-center justify-between gap-3 text-sm print:hidden">
          <div className="min-w-0">
            <div className="a-hd text-[18px] font-bold">{t('po.title')}</div>
            <p className="m-0 mt-0.5 text-ink-soft">{t('po.hint')}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="tab-group flex gap-1" role="radiogroup" aria-label={t('po.size')}>
              {(['A4', 'A3'] as Paper[]).map((p) => <button key={p} role="radio" aria-checked={paper === p} aria-selected={paper === p} onClick={() => setPaper(p)} className="tab">{p}</button>)}
            </div>
            <button className="btn-primary" onClick={() => window.print()}>{Icon.print}{t('po.print')}</button>
            <button className="btn-ghost" disabled={busy} onClick={() => void saveImage()}>{busy ? t('po.saving') : t('po.save')}</button>
            <Link to="/admin" className="btn-quiet">{t('po.back')}</Link>
          </div>
        </div>

        <article className="po-sheet relative mx-auto flex aspect-[210/297] w-full max-w-[210mm] flex-col overflow-hidden px-[9%] pb-[6%] pt-[6%] text-white">
          <div className="relative flex items-center justify-between gap-3">
            <div className="flex items-center gap-[2.2cqw] rounded-[1.6cqw] bg-white px-[2.4cqw] py-[1.4cqw]">
              <img src="/brand/mfu28.png" alt="" className="h-[5.2cqw] w-auto" />
              <span className="h-[3.6cqw] w-px bg-[#C9D4EA]" />
              <img src="/brand/adt-mark.png" alt="" className="h-[3.8cqw] w-auto" />
            </div>
            <div className="text-right font-mono text-[1.9cqw] font-semibold tracking-[.14em] text-[#7FE7FF]">{t('po.eyebrow')}</div>
          </div>

          <img src="/brand/logo-innofest.webp" alt="ADT InnoFest 2026" className="relative mt-[7cqw] w-[66%]" />
          <h1 className="relative m-0 mt-[5cqw] font-display text-[8.2cqw] font-bold leading-[1.02] tracking-[-.01em]" style={{ textShadow: '0 0 30px rgba(0,200,255,.5)' }}>{t('po.head')}</h1>
          <div className="relative mt-[1cqw] font-display text-[5.2cqw] font-bold text-[#7FE7FF]">{t('po.headTh')}</div>
          <p className="relative m-0 mt-[3cqw] max-w-[80%] text-[2.9cqw] leading-snug text-white/90">{t('po.pitch')}<br />{t('po.pitchTh')}</p>

          <div className="relative mt-auto flex items-end justify-between gap-[4cqw]">
            <div className="min-w-0 pb-[1cqw]">
              <div className="font-mono text-[3.4cqw] font-bold text-[#FFC93C]">{t('po.when')}</div>
              <div className="mt-[1cqw] text-[2.6cqw] font-semibold">{t('po.where')}</div>
              <div className="text-[2.5cqw] text-white/85">{t('po.whereTh')}</div>
              {booths > 0 && <div className="mt-[2cqw] inline-block border border-solid border-[#7FE7FF]/60 px-[2cqw] py-[0.8cqw] font-mono text-[2.3cqw] font-semibold text-[#7FE7FF]">{t('po.boothsN', { n: booths })}</div>}
              <div className="mt-[3cqw] text-[2cqw] text-white/80">{t('po.free')}</div>
            </div>
            <div className="flex shrink-0 flex-col items-center">
              <div className="relative">
                <span aria-hidden className="qr-brackets" style={{ inset: '-2.2cqw', animation: 'none', ['--l' as string]: '6cqw', ['--w' as string]: '0.8cqw' }} />
                <div className="bc-qr bg-white p-[2.2cqw]"><QR value={APP_ORIGIN} size={360} className="!h-[30cqw] !w-[30cqw] !rounded-none" /></div>
              </div>
              <div className="mt-[3cqw] text-center font-display text-[2.8cqw] font-bold">{t('po.scan')}</div>
              <div className="text-center text-[2.5cqw] text-white/85">{t('po.scanTh')}</div>
              <div className="mt-[0.6cqw] font-mono text-[2cqw] text-[#7FE7FF]">{host}</div>
            </div>
          </div>
          <div className="relative mt-[4cqw] text-center font-mono text-[1.9cqw] font-semibold tracking-[.12em] text-white/85">{t('po.tag')}</div>
        </article>
      </div>
      {hold && (
        <div className="fixed inset-0 z-[75] flex flex-col items-center justify-center gap-4 bg-[#060B26]/95 p-4 text-center" onClick={() => setHold(null)}>
          <p className="m-0 max-w-xs text-[15px] font-semibold text-white">{t('p.holdTitle')}</p>
          <img src={hold} alt="" onClick={(e) => e.stopPropagation()} className="max-h-[70vh] w-auto max-w-full" style={{ WebkitTouchCallout: 'default' }} />
          <button type="button" className="h-11 cursor-pointer rounded-lg border border-solid border-white/40 bg-white/10 px-6 text-[15px] font-semibold text-white">{t('p.done')}</button>
        </div>
      )}
    </div>
  )
}

type PosterText = {
  link: string; host: string; eyebrow: string; head: string; headTh: string; pitch: string; pitchTh: string
  when: string; where: string; whereTh: string; booths: string; scan: string; scanTh: string; free: string; tag: string
}

const DISPLAY = '"Chakra Petch", "IBM Plex Sans Thai", system-ui, sans-serif'
const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace'

/** The same poster at 1080×1350 (4:5), for social media. */
async function drawPoster(d: PosterText): Promise<HTMLCanvasElement> {
  const [logo, adt, mfu] = await Promise.all(['/brand/logo-innofest.webp', '/brand/adt-mark.png', '/brand/mfu28.png'].map((s) => loadImage(s).catch(() => null)))
  await Promise.all(['700 64px "Chakra Petch"', '600 32px "IBM Plex Mono"', '700 56px "IBM Plex Sans Thai"'].map((f) => document.fonts?.load(f).catch(() => null)))
  const W = 1080, H = 1350
  const c = document.createElement('canvas'); c.width = W; c.height = H
  const ctx = c.getContext('2d')!
  const bg = ctx.createLinearGradient(0, 0, W, H)
  bg.addColorStop(0, '#060B26'); bg.addColorStop(0.55, '#0B1A5C'); bg.addColorStop(1, '#1D3BD8')
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H)
  ctx.strokeStyle = 'rgba(127,231,255,0.07)'; ctx.lineWidth = 2
  for (let x = 0; x <= W; x += 60) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
  for (let y = 0; y <= H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke() }
  const glow = ctx.createRadialGradient(W * 0.85, H * 0.1, 40, W * 0.85, H * 0.1, 700)
  glow.addColorStop(0, 'rgba(0,210,255,0.3)'); glow.addColorStop(1, 'rgba(0,210,255,0)')
  ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H)
  const B = 22, holo = ctx.createLinearGradient(0, 0, W, H)
  holo.addColorStop(0, '#7FE7FF'); holo.addColorStop(0.35, '#1D5BFF'); holo.addColorStop(0.7, '#9B7BFF'); holo.addColorStop(1, '#FFC93C')
  ctx.fillStyle = holo; ctx.fillRect(0, 0, W, B); ctx.fillRect(0, H - B, W, B); ctx.fillRect(0, 0, B, H); ctx.fillRect(W - B, 0, B, H)

  const L = 84, R = W - 84
  // Logos badge and eyebrow.
  const by = 66, bh = 90, mW = mfu ? bh - 22 : 0, aH = 50, aW = adt ? (adt.width / adt.height) * aH : 0
  roundRect(ctx, L, by, 26 + mW + (mfu && adt ? 30 : 0) + aW + 26, bh, 18); ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill()
  let lx = L + 26
  if (mfu) { ctx.drawImage(mfu, lx, by + 11, mW, mW); lx += mW }
  if (mfu && adt) { ctx.fillStyle = '#C9D4EA'; ctx.fillRect(lx + 14, by + 20, 2, bh - 40); lx += 30 }
  if (adt) ctx.drawImage(adt, lx, by + (bh - aH) / 2, aW, aH)
  ctx.textAlign = 'right'; ctx.fillStyle = '#7FE7FF'; ctx.font = `600 22px ${MONO}`
  ctx.fillText(d.eyebrow.split(' · ')[0] ?? d.eyebrow, R, by + 40)
  ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillText(d.eyebrow.split(' · ')[1] ?? '', R, by + 72)

  ctx.textAlign = 'left'
  let y = 220
  if (logo) { const lw = 620, lh = (logo.height / logo.width) * lw; ctx.drawImage(logo, L - 8, y, lw, lh); y += lh }
  y += 92
  ctx.fillStyle = '#FFFFFF'; ctx.font = `700 84px ${DISPLAY}`; ctx.shadowColor = 'rgba(0,200,255,0.6)'; ctx.shadowBlur = 30
  ctx.fillText(d.head, L, y); ctx.shadowBlur = 0
  y += 66; ctx.fillStyle = '#7FE7FF'; ctx.font = `700 54px ${DISPLAY}`; ctx.fillText(d.headTh, L, y)
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = `500 32px ${DISPLAY}`
  for (const line of [...wrap(ctx, d.pitch, R - L, 2), ...wrap(ctx, d.pitchTh, R - L, 2)]) { y += 46; ctx.fillText(line, L, y) }

  // Bottom: facts on the left, the QR on the right.
  const q = 300, qx = R - q, qy = H - 120 - q - 96
  roundRect(ctx, qx - 20, qy - 20, q + 40, q + 40, 20); ctx.fillStyle = '#FFFFFF'; ctx.fill()
  const qr = document.createElement('canvas')
  await QRCode.toCanvas(qr, d.link, { width: q, margin: 0, errorCorrectionLevel: 'M', color: { dark: '#060B26', light: '#FFFFFF' } })
  ctx.drawImage(qr, qx, qy, q, q)
  ctx.strokeStyle = '#00C8FF'; ctx.lineWidth = 7; const k = 46, o = 34
  for (const [cx, cy, sx, sy] of [[qx - o, qy - o, 1, 1], [qx + q + o, qy - o, -1, 1], [qx - o, qy + q + o, 1, -1], [qx + q + o, qy + q + o, -1, -1]]) {
    ctx.beginPath(); ctx.moveTo(cx, cy + sy * k); ctx.lineTo(cx, cy); ctx.lineTo(cx + sx * k, cy); ctx.stroke()
  }
  ctx.textAlign = 'center'; ctx.fillStyle = '#FFFFFF'; ctx.font = `700 30px ${DISPLAY}`
  ctx.fillText(d.scan, qx + q / 2, qy + q + 66)
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = `500 26px ${DISPLAY}`; ctx.fillText(d.scanTh, qx + q / 2, qy + q + 102)
  ctx.textAlign = 'left'
  let fy = qy + 40
  ctx.fillStyle = '#FFC93C'; ctx.font = `700 34px ${MONO}`
  for (const line of wrap(ctx, d.when, qx - L - 60, 2)) { ctx.fillText(line, L, fy); fy += 46 }
  ctx.fillStyle = '#FFFFFF'; ctx.font = `600 28px ${DISPLAY}`
  for (const line of wrap(ctx, d.where, qx - L - 60, 2)) { fy += 12; ctx.fillText(line, L, fy); fy += 26 }
  ctx.fillStyle = 'rgba(255,255,255,0.85)'; ctx.font = `500 26px ${DISPLAY}`
  for (const line of wrap(ctx, d.whereTh, qx - L - 60, 2)) { fy += 12; ctx.fillText(line, L, fy); fy += 24 }
  if (d.booths) {
    fy += 40; ctx.font = `600 26px ${MONO}`; const w = ctx.measureText(d.booths).width + 36
    ctx.strokeStyle = 'rgba(127,231,255,0.7)'; ctx.lineWidth = 2; ctx.strokeRect(L, fy - 34, w, 50)
    ctx.fillStyle = '#7FE7FF'; ctx.fillText(d.booths, L + 18, fy)
  }
  ctx.textAlign = 'center'; ctx.fillStyle = '#7FE7FF'; ctx.font = `600 26px ${MONO}`; ctx.fillText(d.host, W / 2, H - B - 82)
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = `600 24px ${MONO}`; ctx.fillText(d.tag, W / 2, H - B - 34)
  return c
}
