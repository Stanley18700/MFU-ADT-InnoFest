import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { authError, signInWithGoogle, signUpWithEmail } from '../../lib/authActions'
import { Spinner } from '../../components/ui'
import { useLocale } from '../../lib/locale'
import { AuthShell, Notice, Divider, Field, GoogleButton } from './parts'

const MIN_PASSWORD = 8

export default function SignUp() {
  const { ready, user, redirectError, clearRedirectError } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const { from, email: invitedEmail } = (loc.state as { from?: string; email?: string } | null) ?? {}
  const [name, setName] = useState('')
  // An organizer arriving from an invitation must use the invited address; it is pre-filled.
  const [email, setEmail] = useState(invitedEmail ?? '')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState<'google' | 'email' | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const { t } = useLocale()

  if (!ready) return <Spinner label={t('au.opening')} page />
  if (user) return <Navigate to={from ?? '/'} replace />

  async function google() {
    setErr(null); clearRedirectError(); setBusy('google')
    try {
      // A Google address is already proven, so this account skips /verify-email entirely.
      const cred = await signInWithGoogle()
      if (cred) nav(from ?? '/join', { replace: true, state: { from } })
    } catch (e) { setErr(authError(e)); setBusy(null) }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    if (password.length < MIN_PASSWORD) { setErr(t('au.pw.short', { n: MIN_PASSWORD })); return }
    if (password !== confirm) { setErr(t('au.pw.mismatch')); return }
    setBusy('email')
    try {
      await signUpWithEmail(name, email, password, from === '/exhibit' ? '/exhibit' : '/mission')
      nav('/verify-email', { replace: true, state: { from } })
    } catch (e) { setErr(authError(e)); setBusy(null) }
  }

  return (
    <AuthShell
      title={t('au.up.title')}
      lead={t('au.up.lead')}
      foot={<>{t('au.up.have')} <Link to="/signin" state={{ from }} className="link font-semibold text-action">{t('au.in.submit')}</Link></>}
    >
      {/* Same reason as SignIn: a redirect failure lands on a fresh page load, with no caller
          holding it, so it belongs beside the button rather than in the form's `err`. */}
      {redirectError && <div className="mt-6"><Notice tone="red">{redirectError}</Notice></div>}

      <div className="mt-6">
        <GoogleButton onClick={google} busy={busy === 'google'} label={t('au.google.signup')} />
      </div>

      <Divider>{t('au.orEmail')}</Divider>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label={t('au.up.name')} required maxLength={80} autoComplete="name"
          placeholder={t('au.up.namePh')} value={name} onChange={(e) => setName(e.target.value)} />
        <Field label={t('au.email')} type="email" required autoComplete="email" inputMode="email"
          placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)}
          hint={t('au.up.emailHint')} />
        <Field label={t('au.password')} type="password" required minLength={MIN_PASSWORD} autoComplete="new-password"
          placeholder={t('au.up.pwPh', { n: MIN_PASSWORD })} value={password} onChange={(e) => setPassword(e.target.value)} />
        <Field label={t('au.up.confirm')} type="password" required autoComplete="new-password"
          placeholder={t('au.up.confirmPh')} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {err && <Notice tone="red">{err}</Notice>}
        <button className="btn-primary py-3.5 text-lg" disabled={busy !== null}>
          {busy === 'email' ? t('au.up.busy') : t('au.up.submit')}
        </button>
        <p className="text-xs text-ink-soft">
          {t('au.up.agree')}{' '}
          <a className="link" href="/privacy.html" target="_blank" rel="noreferrer">{t('au.up.privacy')}</a>
        </p>
      </form>
    </AuthShell>
  )
}
