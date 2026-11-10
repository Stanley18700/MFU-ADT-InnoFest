import { useState, type FormEvent } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { authError, sendReset } from '../../lib/authActions'
import { useCooldown } from '../../lib/useCooldown'
import { useLocale } from '../../lib/locale'
import { AuthShell, Notice, Field } from './parts'

const COOLDOWN = 45

/** Fires Firebase Auth's "Password reset" template; the link lands on /auth/action. */
export default function ForgotPassword() {
  const loc = useLocation()
  const [email, setEmail] = useState((loc.state as { email?: string } | null)?.email ?? '')
  const [sent, setSent] = useState(false)
  const [again, setAgain] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const { left, start } = useCooldown(COOLDOWN)
  const { t } = useLocale()

  /** One send; shared by the form and the "Send it again" button, which used to only reopen the form. */
  async function send(): Promise<boolean> {
    setBusy(true); setErr(null)
    try {
      await sendReset(email)
      start()
      return true
    } catch (e) {
      const code = (e as { code?: string }).code
      // Never confirm whether an address is registered — that would let anyone enumerate visitors.
      if (code === 'auth/user-not-found') { start(); return true }
      setErr(authError(e))
      return false
    } finally { setBusy(false) }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (await send()) { setSent(true); setAgain(false) }
  }

  async function resend() {
    setAgain(false)
    if (await send()) setAgain(true)
  }

  return (
    <AuthShell
      back="/signin"
      title={t('au.fp.title')}
      lead={t('au.fp.lead')}
      foot={<>{t('au.fp.remembered')} <Link to="/signin" className="link font-semibold text-action">{t('au.in.submit')}</Link></>}
    >
      {sent ? (
        <div className="mt-6 flex flex-col gap-4">
          <Notice tone="green">
            {t('au.fp.sentTo', { email })}
          </Notice>
          {again && <Notice tone="green">{t('au.fp.sentAgain')}</Notice>}
          {err && <Notice tone="red">{err}</Notice>}
          <p className="text-sm text-ink-soft">{t('au.fp.nothing')}</p>
          <button className="btn-ghost" onClick={resend} disabled={busy || left > 0}>
            {busy ? t('au.sending') : left > 0 ? t('au.fp.againIn', { s: left }) : t('au.fp.again')}
          </button>
          <p className="text-xs text-ink-soft">
            {t('au.fp.wrong')}{' '}
            <button className="btn-quiet btn-sm mx-1" onClick={() => { setSent(false); setAgain(false); setErr(null) }}>{t('au.fp.other')}</button>
          </p>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
          <Field label={t('au.email')} type="email" required autoComplete="email" inputMode="email"
            placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          {err && <Notice tone="red">{err}</Notice>}
          <button className="btn-primary py-3.5 text-lg" disabled={busy}>{busy ? t('au.sending') : t('au.fp.submit')}</button>
          <p className="text-xs text-ink-soft">{t('au.fp.google')}</p>
        </form>
      )}
    </AuthShell>
  )
}
