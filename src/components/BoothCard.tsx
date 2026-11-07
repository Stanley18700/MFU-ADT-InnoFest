import { QR } from './QR'
import { useLocale } from '../lib/locale'
import type { BoothDoc } from '../../shared/model'

/**
 * A printable A4 table card for a booth (§5.1), in the InnoFest agency look: a navy header band
 * with the booth number, the static QR that opens the visitor's own scanner in a neon frame, and
 * the two steps in English and Thai. The live QR rotates, so it cannot be printed; this card is
 * what stands on the table beside the screen.
 */
export function BoothCard({ booth, origin, period = 20 }: { booth: BoothDoc; origin: string; period?: number }) {
  const { t } = useLocale()
  const host = origin.replace(/^https?:\/\//, '')
  return (
    <article className="bc-card mx-auto flex min-h-[262mm] max-w-[186mm] flex-col overflow-hidden bg-white text-[#0A1433]">
      <header className="bc-band relative px-[10mm] pb-[9mm] pt-[7mm] text-white">
        <div className="relative flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 rounded-[10px] bg-white px-3 py-2">
            <img src="/brand/mfu28.png" alt="" className="h-[11mm] w-auto" />
            <span className="h-[8mm] w-px bg-[#C9D4EA]" />
            <img src="/brand/adt-mark.png" alt="" className="h-[8mm] w-auto" />
          </div>
          <div className="text-right font-mono text-[9pt] font-semibold tracking-[.16em] text-[#7FE7FF]">
            {t('bc.eyebrow')}<br /><span className="text-white/80">ADT INNOFEST 2026</span>
          </div>
        </div>
        <div className="relative mt-[7mm] flex items-end gap-[6mm]">
          <div className="shrink-0">
            <div className="font-mono text-[10pt] font-bold tracking-[.2em] text-[#FFC93C]">{t('bc.booth')}</div>
            <div className="font-mono text-[46pt] font-bold leading-none tracking-[-.02em] text-white" style={{ textShadow: '0 0 18px rgba(0,200,255,.55)' }}>{booth.shortName || '—'}</div>
          </div>
          <div className="min-w-0 pb-[1mm]">
            <h1 className="m-0 font-display text-[24pt] font-bold leading-[1.1]">{booth.nameEn}</h1>
            {booth.nameTh && <div className="mt-[1mm] text-[13pt] text-white/85">{booth.nameTh}</div>}
            {(booth.hostUnit || booth.location) && <div className="mt-[1.5mm] text-[10pt] text-white/70">{[booth.location, booth.hostUnit].filter(Boolean).join(' · ')}</div>}
          </div>
        </div>
      </header>

      <section className="flex flex-1 flex-col items-center px-[12mm] pt-[9mm]">
        <div className="relative">
          <span aria-hidden className="qr-brackets" style={{ inset: -14, animation: 'none' }} />
          <div className="bc-qr p-[5mm]"><QR value={`${origin}/scan`} size={250} /></div>
        </div>
        <div className="mt-[5mm] font-mono text-[11pt] font-bold tracking-[.18em] text-[#1450E6]">{t('bc.scan')}</div>
        <div className="mt-[2mm] inline-block bg-[#0A1433] px-4 py-1.5 font-mono text-[11pt] font-semibold text-[#FFC93C]" style={{ clipPath: 'polygon(8px 0,100% 0,100% calc(100% - 8px),calc(100% - 8px) 100%,0 100%,0 8px)' }}>
          {t('bc.base', { n: booth.points })}
        </div>

        <ol className="m-0 mt-[8mm] grid w-full list-none gap-[3mm] p-0">
          {[[t('bc.step1', { host }), t('bc.step1Th', { host })], [t('bc.step2', { period }), t('bc.step2Th', { period })]].map(([en, th], i) => (
            <li key={i} className="bc-step flex items-start gap-[4mm] px-[5mm] py-[3.5mm]">
              <span className="grid h-[9mm] w-[9mm] shrink-0 place-items-center bg-[#1D5BFF] font-mono text-[13pt] font-bold text-white" style={{ clipPath: 'polygon(5px 0,100% 0,100% calc(100% - 5px),calc(100% - 5px) 100%,0 100%,0 5px)' }}>{i + 1}</span>
              <span className="min-w-0">
                <span className="block text-[12pt] font-semibold leading-snug">{en}</span>
                <span className="mt-[0.5mm] block text-[11pt] leading-snug text-[#33415F]">{th}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="mb-0 mt-[4mm] text-center text-[9pt] text-[#4A5875]">{t('bc.note')}</p>
      </section>

      <footer className="mt-[6mm] flex items-end justify-between gap-4 border-0 border-t-2 border-solid border-[#1D5BFF] px-[10mm] pb-[6mm] pt-[4mm]">
        <img src="/brand/logo-innofest.webp" alt="ADT InnoFest 2026" className="h-[13mm] w-auto" />
        <div className="text-right">
          <div className="font-mono text-[8pt] tracking-[.12em] text-[#1450E6]">#ADTInnoFest2026 · RECOVER THE FUTURE</div>
          <div className="mt-[1mm] text-[8pt] text-[#4A5875]">{t('bc.staff', { host })}</div>
        </div>
      </footer>
    </article>
  )
}
