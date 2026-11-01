import { useCallback, useState, type FormEvent } from 'react'
import { DecryptOverlay, SegLoader } from '../../components/game'
import { Transmission } from '../../components/handler'
import { Link } from 'react-router-dom'
import { Scanner } from '../../components/Scanner'
import { api, errorMessage } from '../../lib/api'
import { normaliseManualCode } from '../../../shared/token'
import type { ScanResult } from '../../../shared/model'
import { ScanResultView } from './ScanResult'
import { Notice } from '../../components/ui'
import { AIcon, ALang, ErrorPanel } from '../../components/agency'
import { useOnline } from '../../lib/useOnline'
import { setServerTime } from '../../lib/serverClock'
import { useLocale } from '../../lib/locale'

export default function Scan() {
  const { t } = useLocale()
  const [result, setResult] = useState<ScanResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const online = useOnline()
  const [manual, setManual] = useState('')

  const submit = useCallback(async (payload: string) => {
    if (busy) return
    setBusy(true); setErr(null)
    try {
      const r = await api.scan({ payload })
      // A stamp is the first thing most visitors do, so this is usually where the passport
      // learns what the server thinks the time is.
      if (r.status === 'success') setServerTime(r.serverTime)
      setResult(r)
      if (r.status === 'success' && 'vibrate' in navigator) navigator.vibrate?.(18) // §2.4
    } catch (e) {
      setErr(errorMessage(e))
    } finally { setBusy(false) }
  }, [busy])

  const onManual = (e: FormEvent) => {
    e.preventDefault()
    const code = normaliseManualCode(manual)
    if (code.length === 6) void submit(code)
  }

  return (
    <main className="relative mx-auto flex min-h-full max-w-md flex-col bg-white text-ink">
      {result ? (
        <ScanResultView result={result} onRetry={() => { setResult(null); setManual('') }} />
      ) : (
        <>
          {/* The one place the dark ground earns its keep: a lens reads against it. */}
          <div className="relative bg-chrome text-white">
            <header className="relative z-10 flex h-16 items-center justify-between gap-3 px-4">
              <div className="flex min-w-0 items-center gap-2">
                <Link to="/mission" aria-label={t('v.back.passport')} className="-ml-3 flex h-11 w-11 items-center justify-center text-white focus-visible:outline-[3px] focus-visible:outline-[#00B4EE]">{AIcon.close}</Link>
                <h1 className="a-hd m-0 truncate text-[clamp(18px,6vw,22px)] font-bold">{t('v.scan.title')}</h1>
              </div>
              <ALang />
            </header>
            <Scanner onResult={(t) => void submit(t)} paused={busy} className="aspect-square max-h-[56dvh] w-full" />
            {busy && <DecryptOverlay label={t('g.decrypting')} />}
          </div>
          <div className="relative -mt-4 flex flex-1 flex-col gap-3 bg-white px-4 pb-8 pt-5" style={{ clipPath: 'polygon(18px 0,100% 0,100% 100%,0 100%,0 18px)' }}>
            {busy && <div className="flex items-center gap-2"><SegLoader segments={4} /><span className="a-label">{t('v.scan.checking')}</span></div>}
            {/*
              * Ahead of the error, because it explains it. A stamp is recorded by the server, so
              * scanning offline cannot work — and without this the visitor reads a network
              * failure as a broken QR code and tries the booth's sign again and again.
              */}
            {!online && <Notice tone="amber">{t('v.scan.offline')}</Notice>}
            {err ? <ErrorPanel>{err}</ErrorPanel> : !busy && <Transmission text={t('h.scan')} />}
            <form onSubmit={onManual}>
              <label className="a-hd block text-lg font-bold" htmlFor="manual">{t('v.scan.manualLabel')}</label>
              <div className="mt-3 flex gap-2.5">
                <input id="manual" className="a-field a-mono flex-1 text-center text-xl tracking-[0.35em] uppercase" maxLength={7} autoCapitalize="characters" autoCorrect="off" spellCheck={false}
                  value={manual} onChange={(e) => setManual(normaliseManualCode(e.target.value))} placeholder="ABC234" />
                <div className={normaliseManualCode(manual).length === 6 && !busy ? 'a-glow' : ''}>
                  <button className="a-btn a-btn-primary a-cut !h-12 !w-auto px-5 !text-base" disabled={normaliseManualCode(manual).length !== 6 || busy}>{t('v.scan.stamp')}</button>
                </div>
              </div>
            </form>
          </div>
        </>
      )}
    </main>
  )
}
