import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { Transmission } from '../../components/handler'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { api, errorMessage } from '../../lib/api'
import { useEthnicGroups, useRefList } from '../../lib/data'
import { COUNTRIES, PINNED_COUNTRIES, countryName } from '../../lib/countries'
import { DataErrors, Notice, Spinner } from '../../components/ui'
import { AGround, AHeader, Eyebrow, PrimaryBtn } from '../../components/agency'
import { Select } from '../../components/Select'
import { isMfuStudent, isStudentIdValid, type VisitorType } from '../../../shared/model'
import { useLocale } from '../../lib/locale'
import type { StringKey } from '../../lib/strings'

/** Sentinel for the select: not a country code, and no ISO code is 8 characters. */
const OTHER_COUNTRY = '__other__'
/** The same trick for the ethnic-group list, which is a starting point rather than a closed set. */
const OTHER_ETHNIC = '__other__'

const TYPES: Array<{ v: VisitorType; label: StringKey }> = [
  { v: 'student', label: 'v.join.type.student' }, { v: 'staff', label: 'v.join.type.staff' },
  { v: 'alumni', label: 'v.join.type.alumni' }, { v: 'guest', label: 'v.join.type.guest' },
]

function guessCountry(): string {
  const loc = navigator.language || ''
  const m = loc.match(/-([A-Z]{2})$/i)
  return m ? m[1].toUpperCase() : 'TH'
}

export default function Join() {
  const { t } = useLocale()
  const { ready, user, role, refreshClaims, signOut } = useAuth()
  const nav = useNavigate()
  const loc = useLocation()
  const from = (loc.state as { from?: string } | null)?.from
  const institutions = useRefList('institutions')
  const schools = useRefList('mfuSchools')
  const ethnic = useEthnicGroups()

  const [f, setF] = useState({
    // Google hands us a name; the visitor can still overwrite it before it goes on the cover.
    displayName: user?.displayName ?? '', visitorType: 'student' as VisitorType, studentId: '', institution: 'MFU', institutionOther: '',
    school: '', countryCode: guessCountry(), ethnicGroup: '', ethnicConsent: false, consent: false,
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // The country search panel: shut until somebody says their country is not one of the nine.
  const [findCountry, setFindCountry] = useState(false)
  const [countryQuery, setCountryQuery] = useState('')
  // Open once somebody says their community is not on the list, and stays open while they type.
  const [ethnicOther, setEthnicOther] = useState(false)
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }))

  useEffect(() => { if (f.institution !== 'MFU' && f.school) set('school', '') }, [f.institution]) // eslint-disable-line react-hooks/exhaustive-deps
  // MFU333 credit is for MFU students only, recorded against their student ID.
  const mfuStudent = isMfuStudent(f)

  /*
   * Nine countries and a way out, rather than a wheel of 256.
   *
   * Those nine answer this for nearly everyone at an MFU festival, so they *are* the question;
   * the other 247 live behind "Other country", which opens a search over the full A-Z list.
   * Two earlier arrangements failed on a phone: 256 in one run, and then the nine lifted to the
   * top and *removed* from the alphabetical part — where a visitor scrolling to T for Thailand
   * did not find it, because it had been moved.
   */
  const common = useMemo(
    () => PINNED_COUNTRIES.map((code) => ({ code, name: countryName(code) })),
    [],
  )
  const isCommon = (PINNED_COUNTRIES as readonly string[]).includes(f.countryCode)
  /** COUNTRIES is already A-Z, so a filter of it stays A-Z. An empty query lists all of them. */
  const countryMatches = useMemo(() => {
    const q = countryQuery.trim().toLowerCase()
    return q ? COUNTRIES.filter((x) => x.name.toLowerCase().includes(q)) : COUNTRIES
  }, [countryQuery])

  /** Country decides which ethnic-group list is offered, so changing it invalidates both. */
  function chooseCountry(code: string) {
    set('countryCode', code); set('ethnicGroup', ''); set('ethnicConsent', false); setEthnicOther(false)
  }
  const ethnicOptions: string[] = ethnic[f.countryCode] ?? []
  /* Anything not on the country's list — typed in, or carried over from a previous country — keeps
     the list on "something else" so the field never reads an answer back as though it were blank. */
  const inEthnicList = f.ethnicGroup === 'Prefer not to say' || ethnicOptions.includes(f.ethnicGroup)
  const ethnicValue = ethnicOther || (f.ethnicGroup && !inEthnicList) ? OTHER_ETHNIC : f.ethnicGroup

  if (!ready) return <Spinner page />
  if (role === 'visitor') return <Navigate to={from ?? '/mission'} replace />
  if (role === 'organizer' || role === 'admin') return <Navigate to="/" replace />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr(null)
    if (!f.consent) { setErr(t('v.join.consentRequired')); return }
    // `Select` is a disclosure, not a form control, so the browser no longer checks this one.
    if (f.institution === 'MFU' && !f.school) { setErr(t('v.join.schoolRequired')); return }
    if (mfuStudent && !isStudentIdValid(f.studentId)) { setErr(t('m.idBad')); return }
    setBusy(true)
    try {
      await api.join({
        displayName: f.displayName, visitorType: f.visitorType, studentId: f.studentId || undefined,
        institution: f.institution, institutionOther: f.institution === 'Other' ? f.institutionOther : undefined,
        school: f.institution === 'MFU' ? f.school : f.institutionOther || undefined,
        countryCode: f.countryCode,
        ethnicGroup: f.ethnicGroup || undefined, ethnicConsent: f.ethnicConsent,
        consent: true,
      })
      // §4.1 — give the passport a way home. Non-fatal: registration must not fail because
      // the credential could not be linked, and `join` has already succeeded by this point.
      await refreshClaims()
      nav(from ?? '/mission', { replace: true })
    } catch (e) {
      setErr(errorMessage(e))
    } finally { setBusy(false) }
  }

  return (
    <AGround className="mx-auto max-w-md" grid="h-[260px]">
    {/* The longest thing a visitor reads in the whole app, and the first: the switch belongs
        beside its heading, not three screens away in a menu that does not exist yet. */}
    <AHeader lead="marks" />
    <main className="px-4 pb-16 page-in">
      <Eyebrow>{t('a.join.eyebrow')}</Eyebrow>
      <h1 className="a-hd mb-0 mt-2 text-[28px] font-bold leading-[1.15]">{t('v.join.title')}</h1>
      <p className="mb-0 mt-1.5 text-sm text-[#33415F]">{t('v.join.lead')}</p>
      <Transmission className="mt-4" text={t('h.join')} />

      {/* The account email is the contact; it is already confirmed, so it is shown, not asked for. */}
      <div className="a-cut a-solid a-fill-tint mt-4 flex items-center justify-between gap-3 px-3.5 py-3">
        <div className="min-w-0">
          <div className="a-label text-[var(--a-muted)]">{t('v.join.signedIn')}</div>
          <div className="truncate text-sm font-medium">{user?.email}</div>
        </div>
        <button type="button" className="btn-quiet btn-sm shrink-0" onClick={() => void signOut()}>{t('v.join.notYou')}</button>
      </div>

      <DataErrors agent className="mt-4" />

      <form onSubmit={submit} className="mt-6 flex flex-col gap-5">
        <label className="block">
          <span className="a-lbl">{t('v.join.name')}</span>
          <input className="a-field" required maxLength={80} autoComplete="name" value={f.displayName} onChange={(e) => set('displayName', e.target.value)} placeholder={t('v.join.namePlaceholder')} />
        </label>

        <fieldset>
          <legend className="a-lbl">{t('v.join.iAm')}</legend>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {TYPES.map((ty) => (
              <label key={ty.v} className={`a-cut flex min-h-[52px] cursor-pointer items-center gap-2.5 px-3 text-[15px] font-medium has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-[#00B4EE] ${f.visitorType === ty.v ? 'a-edge-neon a-fill-ok' : 'a-edge-strong'}`}>
                <input type="radio" name="vt" className="sr-only" checked={f.visitorType === ty.v} onChange={() => set('visitorType', ty.v)} />
                <span aria-hidden className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-2 ${f.visitorType === ty.v ? 'border-[#1D5BFF]' : 'border-[#8C97AD]'}`}>{f.visitorType === ty.v && <span className="h-2 w-2 rounded-full bg-[#1D5BFF]" />}</span>
                {t(ty.label)}
              </label>
            ))}
          </div>
        </fieldset>

        {f.visitorType !== 'guest' && (
          mfuStudent ? (
            /* An MFU student's ID is what MFU333 credit is recorded against, so it is required and
               checked here: 10 digits. Everyone else keeps it optional. */
            <label className="block">
              <span className="a-lbl">{t('m.idLabel')}</span>
              <input className="a-field a-mono tracking-[.12em]" required maxLength={10} inputMode="numeric" pattern="[0-9]{10}" autoComplete="off"
                value={f.studentId} onChange={(e) => set('studentId', e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="6731500000" />
              <span className="mt-1 block text-xs text-[var(--a-muted)]">{t('m.idHint')}</span>
            </label>
          ) : (
            <label className="block">
              <span className="a-lbl">{t('v.join.id')} <span className="font-normal text-[var(--a-muted)]">{t('v.join.optional')}</span></span>
              <input className="a-field" maxLength={40} inputMode="numeric" value={f.studentId} onChange={(e) => set('studentId', e.target.value)} />
            </label>
          )
        )}

        {/*
          * `Select`, not an `<input list>`. A datalist draws its suggestions in the OS, so on a
          * phone it is a grey system sheet under a rounded teal form and on a desktop it is a
          * plain list that no style here reaches — the very thing Select exists to replace. The
          * list is closed anyway: every institution ends at "Other", which opens the free-text
          * field below.
          */}
        <div>
          <label htmlFor="join-institution" className="a-lbl">{t('v.join.institution')}</label>
          <Select
            id="join-institution" ariaLabel={t('v.join.institution')} className="mt-1"
            value={f.institution} onChange={(v) => set('institution', v)}
            placeholder={t('v.join.choose')}
            options={institutions.map((i) => ({ value: i, label: i }))}
          />
        </div>

        {f.institution === 'Other' && (
          <label className="block">
            <span className="a-lbl">{t('v.join.institutionName')}</span>
            <input className="a-field" required maxLength={120} value={f.institutionOther} onChange={(e) => set('institutionOther', e.target.value)} />
          </label>
        )}

        {f.institution === 'MFU' && (
          <div>
            <label htmlFor="join-school" className="a-lbl">{t('v.join.school')}</label>
            <Select
              id="join-school" ariaLabel={t('v.join.school')} className="mt-1"
              value={f.school} onChange={(v) => set('school', v)}
              placeholder={t('v.join.choose')}
              options={schools.map((x) => ({ value: x, label: x }))}
            />
          </div>
        )}

        <div>
          <label htmlFor="join-country" className="a-lbl">{t('v.join.country')}</label>
          {/*
            * Nine options and a way out, rather than 256. Whatever has been chosen from the
            * search stays in the list as its own option, so the field always shows the answer
            * rather than reading "Other country" back at somebody who already answered.
            */}
          <Select
            id="join-country" ariaLabel={t('v.join.country')} className="mt-1"
            value={f.countryCode}
            onChange={(v) => {
              if (v === OTHER_COUNTRY) { setFindCountry(true); setCountryQuery(''); return }
              setFindCountry(false)
              chooseCountry(v)
            }}
            options={[
              ...common.map((x) => ({ value: x.code, label: x.name })),
              ...(!isCommon && f.countryCode ? [{ value: f.countryCode, label: countryName(f.countryCode) }] : []),
              { value: OTHER_COUNTRY, label: t('v.join.otherCountry') },
            ]}
          />

          {findCountry && (
            <div className="a-cut a-edge-line mt-2 p-2">
              <input
                autoFocus type="search" className="a-field" value={countryQuery}
                onChange={(e) => setCountryQuery(e.target.value)}
                placeholder={t('v.join.searchCountry')} aria-label={t('v.join.searchCountry')}
                // Enter in a one-line field submits the form; here it should pick the only match.
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return
                  e.preventDefault()
                  if (countryMatches.length === 1) { chooseCountry(countryMatches[0].code); setFindCountry(false) }
                }}
              />
              {/* Capped and scrollable: the whole A-Z list is here when nothing is typed. */}
              <ul className="mt-2 max-h-56 overflow-y-auto">
                {countryMatches.map((x) => (
                  <li key={x.code}>
                    <button
                      type="button"
                      className={`w-full rounded-lg px-3 py-2 text-left text-sm transition hover:bg-ink/6 ${f.countryCode === x.code ? 'font-semibold text-action' : ''}`}
                      onClick={() => { chooseCountry(x.code); setFindCountry(false) }}
                    >
                      {x.name}
                    </button>
                  </li>
                ))}
                {countryMatches.length === 0 && (
                  <li className="px-3 py-3 text-sm text-ink-soft">{t('v.join.noCountry')}</li>
                )}
              </ul>
            </div>
          )}
        </div>

        <div className="a-cut a-edge-line px-3.5 py-3">
          <label className="block">
            <span className="a-lbl">{t('v.join.ethnic')} <span className="font-normal text-[var(--a-muted)]">{t('v.join.optional')}</span></span>
            <p className="mt-1 text-xs text-ink-soft">{t('v.join.ethnicNote')}</p>
          </label>
          {/*
            * A list with a way out, like the country field above it — not a `<datalist>`, whose
            * suggestions the browser draws as a system menu over the form. The list is a starting
            * point to be reviewed, so "something else" has to stay open: choosing it reveals the
            * text field, and anything typed there is stored exactly as written.
            *
            * The stored value stays English whichever way the toggle is set: it is data the
            * organisers report on, not a label. Only "Prefer not to say" is translated.
            */}
          <Select
            id="join-ethnic" ariaLabel={t('v.join.ethnic')} className="mt-2"
            value={ethnicValue}
            onChange={(v) => {
              if (v === OTHER_ETHNIC) { setEthnicOther(true); set('ethnicGroup', ''); return }
              setEthnicOther(false)
              set('ethnicGroup', v)
            }}
            placeholder={t('v.join.ethnicPlaceholder')}
            options={[
              { value: 'Prefer not to say', label: t('v.join.preferNot') },
              ...ethnicOptions.map((g) => ({ value: g, label: g })),
              { value: OTHER_ETHNIC, label: t('v.join.ethnicOther') },
            ]}
          />
          {ethnicOther && (
            <label className="mt-2 block">
              <span className="sr-only">{t('v.join.ethnicOtherLabel')}</span>
              <input
                autoFocus className="a-field" maxLength={80} value={f.ethnicGroup}
                onChange={(e) => set('ethnicGroup', e.target.value)}
                placeholder={t('v.join.ethnicOtherLabel')} aria-label={t('v.join.ethnicOtherLabel')}
              />
            </label>
          )}
          {f.ethnicGroup && f.ethnicGroup !== 'Prefer not to say' && (
            <label className="mt-3 flex items-start gap-2 text-sm">
               <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[#1D5BFF]" checked={f.ethnicConsent} onChange={(e) => set('ethnicConsent', e.target.checked)} />
              <span>{t('v.join.ethnicConsent')} <span className="text-ink-soft">{t('v.join.ethnicConsentNote')}</span></span>
            </label>
          )}
        </div>

        <label className="flex items-start gap-2 text-sm">
           <input type="checkbox" className="mt-1 h-5 w-5 shrink-0 accent-[#1D5BFF]" checked={f.consent} onChange={(e) => set('consent', e.target.checked)} required />
          <span>
            {t('v.join.consent')}{' '}
            <a className="a-link" href="/privacy.html" target="_blank" rel="noreferrer">{t('v.join.privacy')}</a>
          </span>
        </label>

        {err && <Notice tone="red">{err}</Notice>}
        <PrimaryBtn type="submit" disabled={busy} loading={busy}>{busy ? t('v.join.creating') : t('v.join.create')}</PrimaryBtn>
      </form>
      {/* The one screen a booth host who is not on anyone list reliably lands on: the guard sends
          every roleless account here. Without this they would have to be told the URL. */}
      <p className="mt-6 text-center text-xs text-ink-soft">
        {t('v.join.staffPrompt')}{' '}
        <Link to="/booth-access" className="a-link">{t('v.join.staffLink')}</Link>
      </p>
    </main>
    </AGround>
  )
}
