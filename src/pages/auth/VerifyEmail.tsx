import { useCallback, useEffect, useRef, useState } from 'react'
import { useCooldown } from '../../lib/useCooldown'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { authError, sendVerification } from '../../lib/authActions'
import { auth } from '../../lib/firebase'
import { Spinner } from '../../components/ui'
import { useLocale } from '../../lib/locale'
import { AuthShell, Notice } from './parts'

const COOLDOWN = 45

/**
 * The waiting room for an unverified email/password account. Firebase Auth's
 * "Email address verification" template sends the link; this page polls until it is clicked,
 * so verifying in the mail app's own browser still unblocks the tab left open here.
 */
export default function VerifyEmail() {
  const { ready, user, emailVerified, reloadUser, signOut } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const from = (loc.state as { from?: string } | null)?.from
  // A mail has just gone out (sign-up sent it), so the countdown is running on arrival.
  const { left, start } = useCooldown(COOLDOWN, true)
  const [note, setNote] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [waitNote, setWaitNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const checking = useRef(false)
  const { t } = useLocale()

  const check = useCallback(async () => {
    if (checking.current) return
    checking.current = true
    try { await reloadUser() } catch { /* offline — the next tick retries */ } finally { checking.current = false }
  }, [reloadUser])

  useEffect(() => {
    if (!user || emailVerified) return
    const id = setInterval(check, 5000)
    return () => clearInterval(id)
  }, [user, emailVerified, check])

  if (!ready) return <Spinner label={t('au.checkingAccount')} page />
  if (!user) return <Navigate to="/signin" replace />
  if (emailVerified) return <Navigate to={from ?? '/'} replace />

  async function resend() {
    setBusy(true); setErr(null); setNote(null)
    try {
      await sendVerification(auth.currentUser!, from === '/exhibit' ? '/exhibit' : '/mission')
      setNote(t('au.ve.sent'))
      start()
    } catch (e) { setErr(authError(e)) } finally { setBusy(false) }
  }

  /*
   * The button used to re-check silently: with the mail not yet confirmed it did nothing visible,
   * which on a phone reads as broken. Now it says what it found.
   */
  async function continueNow() {
    setBusy(true); setErr(null); setNote(null); setWaitNote(null)
    try {
      await reloadUser()
      if (!auth.currentUser?.emailVerified) {
        setWaitNote(t('au.ve.notYet', { email: user!.email ?? '' }))
      }
    } catch (e) { setErr(authError(e)) } finally { setBusy(false) }
  }

  async function useAnother() {
    await signOut()
    nav('/signup', { replace: true })
  }

  return (
    <AuthShell
      back={null}
      title={t('au.ve.title')}
      lead={<>{t('au.ve.lead1')} <b className="text-ink">{user.email}</b> {t('au.ve.lead2')}</>}
    >
      <div className="mt-6 flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-[20px] bg-sky-100 px-4 py-3 text-sm text-ink-soft">
          <span aria-hidden className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[#1D5BFF]/20 border-t-[#1D5BFF]" />
          {t('au.ve.waiting')}
        </div>

        {note && <Notice tone="green">{note}</Notice>}
        {waitNote && <Notice tone="amber">{waitNote}</Notice>}
        {err && <Notice tone="red">{err}</Notice>}

        <button className="btn-primary py-3.5" disabled={busy} onClick={continueNow}>{busy ? t('au.ve.checking') : t('au.ve.continue')}</button>
        <button className="btn-ghost" onClick={resend} disabled={busy || left > 0}>
          {busy ? t('au.sending') : left > 0 ? t('au.ve.againIn', { s: left }) : t('au.ve.again')}
        </button>

        <p className="pt-2 text-xs text-ink-soft">
          {t('au.ve.wrong')}{' '}
          <button className="btn-quiet btn-sm mx-1" onClick={useAnother}>{t('au.ve.restart')}</button>
        </p>
        <p className="text-xs text-ink-soft">{t('au.ve.tip')}</p>
      </div>
    </AuthShell>
  )
}
