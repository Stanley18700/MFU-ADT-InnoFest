import { useMemo, useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { useBooths, useEvent } from '../../lib/data'
import { api, errorMessage, friendlyError } from '../../lib/api'
import { authError, isInAppWebView, signInWithGoogle } from '../../lib/authActions'
import { Notice, Spinner } from '../../components/ui'
import { AGround, AHeader, AIcon, Eyebrow, GhostBtn, PrimaryBtn } from '../../components/agency'
import { useLocale } from '../../lib/locale'

/**
 * /exhibit — the exhibitor link.
 *
 * One address for every senior-project team: sign in, pick your project, type your name. The
 * server checks the name against that project's official team list (which the page never sees)
 * and, if it is there, makes this account the booth's organizer at once. Every team member can do
 * it, each on their own phone, so the whole team has the QR screen and the statistics.
 *
 * Already registered? The page becomes the way back: two buttons, QR screen and stats.
 */
export default function Exhibit() {
  const { t, pick } = useLocale()
  const { ready, user, emailVerified, role, boothId: myBooth, refreshClaims, redirectError, signOut } = useAuth()
  const event = useEvent()
  const allBooths = useBooths()
  const nav = useNavigate()
  const [q, setQ] = useState('')
  const [boothId, setBoothId] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const booths = useMemo(
    () => allBooths
      .filter((b) => b.eventId === event.id && b.active && (b.teamSize ?? 0) > 0)
      .sort((a, b) => (a.shortName || '').localeCompare(b.shortName || '', undefined, { numeric: true })),
    [allBooths, event.id],
  )
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return booths.slice(0, 6)
    return booths.filter((b) => [b.shortName, b.nameEn, b.nameTh].some((x) => (x ?? '').toLowerCase().includes(s))).slice(0, 8)
  }, [q, booths])
  const chosen = booths.find((b) => b.id === boothId)

  const shell = (children: React.ReactNode) => (
    <AGround className="mx-auto max-w-md" grid="h-[240px]">
      <AHeader lead="marks" />
      <main className="page-in px-4 pb-16">{children}</main>
    </AGround>
  )
  const head = (title: string, lead?: string) => (
    <>
      <Eyebrow pulse>{t('ex.eyebrow')}</Eyebrow>
      <h1 className="a-hd mb-0 mt-2 text-[28px] font-bold leading-[1.15]">{title}</h1>
      {lead && <p className="mb-0 mt-1.5 text-[15px] text-[#33415F]">{lead}</p>}
    </>
  )

  if (!ready) return shell(<Spinner />)

  // Already registered: this page is now the shortcut back to the booth.
  if (role === 'organizer' && myBooth) {
    const b = allBooths.find((x) => x.id === myBooth)
    return shell(<>
      {head(t('ex.doneTitle'), t('ex.doneLead', { booth: b ? `${b.shortName ? b.shortName + ' · ' : ''}${pick(b.nameEn, b.nameTh)}` : myBooth }))}
      <div className="mt-6 flex flex-col gap-3">
        <PrimaryBtn to="/booth" icon={AIcon.scan}>{t('ex.openQr')}</PrimaryBtn>
        <GhostBtn to="/booth/stats">{t('ex.openStats')}</GhostBtn>
      </div>
    </>)
  }
  if (role === 'admin') {
    return shell(<>
      {head(t('ex.adminTitle'), t('ex.adminLead'))}
      <div className="mt-6"><PrimaryBtn to="/admin/exhibitors">{t('ex.toAdmin')}</PrimaryBtn></div>
    </>)
  }

  const steps = [t('ex.step1'), t('ex.step2'), t('ex.step3')]
  const stepList = (at: number) => (
    <ol className="mt-5 flex list-none gap-2 p-0">
      {steps.map((s, i) => (
        <li key={i} className={`a-cut a-cut-s a-solid flex-1 px-2.5 py-2 text-[12.5px] leading-tight ${i === at ? 'a-fill-neon' : i < at ? 'a-fill-tint text-ink' : 'a-fill-muted'}`}>
          <span className="a-mono block text-[10.5px] opacity-80">0{i + 1}</span>{s}
        </li>
      ))}
    </ol>
  )

  // Step 1: sign in. Google is one tap for an MFU account; email is the fallback.
  if (!user) {
    async function google() {
      setBusy(true); setErr(null)
      try { await signInWithGoogle() } catch (e) { setErr(authError(e)) } finally { setBusy(false) }
    }
    return shell(<>
      {head(t('ex.title'), t('ex.lead'))}
      {stepList(0)}
      {(err || redirectError) && <div className="mt-4"><Notice tone="red">{err || redirectError}</Notice></div>}
      {/* Google will not sign anyone in from inside an app's own browser (Facebook, Instagram…).
          Say so, and leave email as the way in, rather than a button that cannot work here. */}
      {isInAppWebView() && <div className="mt-4"><Notice tone="amber">{t('ex.webview')}</Notice></div>}
      <div className="mt-6 flex flex-col gap-3">
        {!isInAppWebView() && (
          <button type="button" onClick={google} disabled={busy} className="a-btn a-btn-primary a-cut">
            <span className="grid h-7 w-7 place-items-center rounded-full bg-white">{AIcon.google}</span>{t('ex.google')}
          </button>
        )}
        <GhostBtn to="/signin" state={{ from: '/exhibit' }}>{t('ex.email')}</GhostBtn>
        <Link to="/signup" state={{ from: '/exhibit' }} className="a-link mt-1 text-center text-sm">{t('ex.newEmail')}</Link>
      </div>
    </>)
  }
  if (!emailVerified) return <Navigate to="/verify-email" state={{ from: '/exhibit' }} replace />

  // Steps 2–3: pick the project, type the name.
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!boothId || !name.trim()) return
    setBusy(true); setErr(null)
    try {
      await api.claimBoothSeat({ boothId, name: name.trim() })
      try { await refreshClaims() } catch { /* the periodic refresh will get it */ }
      nav('/booth', { replace: true })
    } catch (e) {
      // The name check's own answers, in the reader's language; anything else as the server said it.
      const code = ((e as { code?: string })?.code ?? '').replace(/^functions\//, '')
      setErr(code === 'not-found' ? t('ex.err.notFound')
        : code === 'already-exists' ? t('ex.err.taken')
        : code === 'resource-exhausted' ? t('ex.err.tooMany')
        : ['unavailable', 'deadline-exceeded', 'internal', 'unauthenticated'].includes(code) ? friendlyError(e)
        : errorMessage(e))
    } finally { setBusy(false) }
  }

  return shell(<>
    {head(t('ex.title'))}
    {stepList(chosen ? 2 : 1)}
    <div className="a-cut a-solid a-fill-tint mt-4 flex items-center justify-between gap-3 px-3.5 py-2.5">
      <div className="min-w-0">
        <div className="a-label text-[var(--a-muted)]">{t('ex.signedInAs')}</div>
        <div className="truncate text-sm font-semibold text-ink">{user.email}</div>
      </div>
      <button type="button" className="a-link shrink-0 cursor-pointer border-0 bg-transparent text-sm" onClick={() => void signOut()}>{t('ex.notYou')}</button>
    </div>
    {role === 'visitor' && <p className="mb-0 mt-2 text-xs text-[var(--a-muted)]">{t('ex.visitorNote')}</p>}

    {booths.length === 0 ? (
      <div className="mt-5"><Notice tone="amber">{t('ex.noProjects')}</Notice></div>
    ) : (
      <form onSubmit={submit} className="mt-5 flex flex-col gap-5">
        <div>
          <label htmlFor="ex-q" className="a-hd block text-lg font-bold">{t('ex.project')}</label>
          {chosen ? (
            <div className="a-cut a-edge-neon a-fill-foil mt-2 flex items-center gap-3 px-3.5 py-3">
              <span className="a-mono shrink-0 text-sm font-semibold text-[#1450E6]">{chosen.shortName}</span>
              <span className="min-w-0 flex-1 truncate font-semibold text-ink">{pick(chosen.nameEn, chosen.nameTh)}</span>
              <button type="button" className="a-link shrink-0 cursor-pointer border-0 bg-transparent text-sm" onClick={() => { setBoothId(''); setErr(null) }}>{t('ex.change')}</button>
            </div>
          ) : (
            <>
              <input id="ex-q" className="a-field mt-2 w-full" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('ex.projectPick')} autoComplete="off" />
              <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0">
                {matches.map((b) => (
                  <li key={b.id}>
                    <button type="button" onClick={() => { setBoothId(b.id); setErr(null) }}
                      className="a-cut a-edge-line flex min-h-12 w-full cursor-pointer items-center gap-3 border-0 bg-transparent px-3.5 py-2 text-left">
                      <span className="a-mono w-12 shrink-0 text-sm font-semibold text-[#1450E6]">{b.shortName}</span>
                      <span className="min-w-0 flex-1 truncate text-[15px] text-ink">{pick(b.nameEn, b.nameTh)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        {chosen && (
          <div>
            <label htmlFor="ex-name" className="a-hd block text-lg font-bold">{t('ex.name')}</label>
            <input id="ex-name" className="a-field mt-2 w-full" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={120} autoFocus />
            <p className="mb-0 mt-1.5 text-xs text-[var(--a-muted)]">{t('ex.nameHint')}</p>
          </div>
        )}
        {err && <Notice tone="red">{err}</Notice>}
        {chosen && <PrimaryBtn type="submit" disabled={busy || !name.trim()}>{busy ? t('ex.checking') : t('ex.submit')}</PrimaryBtn>}
        <p className="m-0 text-center text-xs text-[var(--a-muted)]">{t('ex.help')}</p>
      </form>
    )}
  </>)
}
