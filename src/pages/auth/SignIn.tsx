import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { authError, signInWithEmail, signInWithGoogle } from '../../lib/authActions'
import { Spinner } from '../../components/ui'
import { useLocale } from '../../lib/locale'
import { AuthShell, Notice, Divider, Field, GoogleButton } from './parts'

export default function SignIn() {
  const { ready, user, redirectError, clearRedirectError } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const { from, email: knownEmail } = (loc.state as { from?: string; email?: string } | null) ?? {}
  const [email, setEmail] = useState(knownEmail ?? '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState<'google' | 'email' | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const { t } = useLocale()

  if (!ready) return <Spinner label={t('au.opening')} page />
  // Landing and the guards know where each role belongs; just get out of the way.
  if (user) return <Navigate to={from ?? '/'} replace />

  async function google() {
    setErr(null); clearRedirectError(); setBusy('google')
    try {
      const cred = await signInWithGoogle()
      if (cred) nav(from ?? '/', { replace: true })
    } catch (e) { setErr(authError(e)); setBusy(null) }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr(null); setBusy('email')
    try {
      await signInWithEmail(email, password)
      nav(from ?? '/', { replace: true })
    } catch (e) { setErr(authError(e)); setBusy(null) }
  }

  return (
    <AuthShell
      title={t('au.in.title')}
      lead={t('au.in.lead')}
      foot={<>{t('au.in.new')} <Link to="/signup" state={{ from, email }} className="link font-semibold text-action">{t('au.in.create')}</Link></>}
    >
      {/* A redirect failure comes back on a fresh page load with no caller waiting for it, so it
          is shown here, above the button that started the trip, rather than in the form's `err`. */}
      {redirectError && <div className="mt-6"><Notice tone="red">{redirectError}</Notice></div>}

      <div className="mt-6">
        <GoogleButton onClick={google} busy={busy === 'google'} label={t('au.google.continue')} />
      </div>

      <Divider>{t('au.or')}</Divider>

      <form onSubmit={submit} className="flex flex-col gap-4">
        <Field label={t('au.email')} type="email" required autoComplete="email" inputMode="email"
          placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <div>
          <Field label={t('au.password')} type="password" required autoComplete="current-password"
            placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="mt-2 text-right">
            <Link to="/forgot-password" state={{ email }} className="link text-xs text-ink-soft hover:text-ink">{t('au.forgot')}</Link>
          </div>
        </div>
        {err && <Notice tone="red">{err}</Notice>}
        <button className="btn-primary py-3.5 text-lg" disabled={busy !== null}>
          {busy === 'email' ? t('au.in.busy') : t('au.in.submit')}
        </button>
      </form>
    </AuthShell>
  )
}
