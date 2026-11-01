import { useCallback, useEffect, useRef, useState } from 'react'
import { useCooldown } from '../../lib/useCooldown'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { authError, sendVerification } from '../../lib/authActions'
import { auth } from '../../lib/firebase'
import { Spinner } from '../../components/ui'
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

  if (!ready) return <Spinner label="Checking your account…" page />
  if (!user) return <Navigate to="/signin" replace />
  if (emailVerified) return <Navigate to={from ?? '/'} replace />

  async function resend() {
    setBusy(true); setErr(null); setNote(null)
    try {
      await sendVerification(auth.currentUser!, from === '/exhibit' ? '/exhibit' : '/mission')
      setNote('Sent. Give it a minute, then check your spam folder too.')
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
        setWaitNote(`Not confirmed yet. Open the email to ${user!.email} and tap the link in it — check Spam or Promotions too. It can take a minute to arrive.`)
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
      title="Confirm your email"
      lead={<>We sent a link to <b className="text-ink">{user.email}</b>. Tap it and your mission begins.</>}
    >
      <div className="mt-6 flex flex-col gap-4">
        <div className="flex items-center gap-3 rounded-[20px] bg-sky-100 px-4 py-3 text-sm text-ink-soft">
          <span aria-hidden className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-[#1D5BFF]/20 border-t-[#1D5BFF]" />
          Waiting for you to tap the link — this page moves on by itself.
        </div>

        {note && <Notice tone="green">{note}</Notice>}
        {waitNote && <Notice tone="amber">{waitNote}</Notice>}
        {err && <Notice tone="red">{err}</Notice>}

        <button className="btn-primary py-3.5" disabled={busy} onClick={continueNow}>{busy ? 'Checking…' : 'I have tapped it — continue'}</button>
        <button className="btn-ghost" onClick={resend} disabled={busy || left > 0}>
          {busy ? 'Sending…' : left > 0 ? `Send it again in ${left}s` : 'Send the link again'}
        </button>

        <p className="pt-2 text-xs text-ink-soft">
          Typed the address wrong?{' '}
          <button className="btn-quiet btn-sm mx-1" onClick={useAnother}>Start again with another email</button>
        </p>
      </div>
    </AuthShell>
  )
}
