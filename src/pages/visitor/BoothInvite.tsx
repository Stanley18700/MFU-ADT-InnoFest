import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAuth } from '../../lib/auth'
import { api, type PublicBooth } from '../../lib/api'
import { rememberInvite } from '../../lib/invite'
import { useLocale } from '../../lib/locale'
import { AGround, AHeader, AIcon, Eyebrow, GhostBtn, PrimaryBtn } from '../../components/agency'
import { Transmission } from '../../components/handler'
import { Spinner } from '../../components/ui'

/**
 * /b/{boothId} — a booth's invite link, the one its exhibitors share on social media.
 *
 * Who, where and when, from the public `publicBooth` call (the person opening it has not signed
 * in). The booth is remembered on this device, so if they sign up the booth is credited with an
 * "invited" sign-up and becomes their first target. A sign-up is never a visit: only scanning the
 * booth on the day counts there.
 */
export default function BoothInvite() {
  const { boothId = '' } = useParams()
  const { t, pick } = useLocale()
  const { role } = useAuth()
  const [booth, setBooth] = useState<PublicBooth | null | undefined>(undefined)

  useEffect(() => {
    let live = true
    api.publicBooth({ boothId })
      .then((r) => { if (!live) return; setBooth(r.found ? r.booth : null); if (r.found) rememberInvite(r.booth.id) })
      .catch(() => { if (live) setBooth(null) })
    return () => { live = false }
  }, [boothId])

  const agent = role === 'visitor'
  return (
    <AGround className="mx-auto max-w-md" grid="h-[260px]">
      <AHeader lead="marks" />
      <main className="page-in flex flex-col gap-3 px-4 pb-16">
        {booth === undefined && <Spinner label={t('bi.loading')} />}
        {booth === null && (
          <>
            <Eyebrow>{t('bi.eyebrow')}</Eyebrow>
            <h1 className="a-hd m-0 text-[26px] font-bold leading-tight">{t('bi.missing')}</h1>
            <PrimaryBtn to="/">{t('bi.toApp')}</PrimaryBtn>
          </>
        )}
        {booth && (
          <>
            <Eyebrow pulse>{t('bi.eyebrow')}</Eyebrow>
            <section className="a-cut a-edge-neon a-fill-foil a-glow-soft px-4 pb-4 pt-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="a-mono text-[13px] font-bold tracking-[.16em] text-[#1450E6]">{t('bi.booth')} {booth.shortName}</span>
                <span className="a-mono text-[11px] tracking-[.12em] text-[var(--a-muted)]">{t('bi.encrypted')}</span>
              </div>
              <h1 className="a-hd mb-0 mt-2 text-[clamp(22px,7vw,28px)] font-bold leading-[1.15] text-ink">{pick(booth.nameEn, booth.nameTh)}</h1>
              {booth.hostUnit && <div className="mt-1 text-sm text-[#33415F]">{booth.hostUnit}</div>}
              {pick(booth.descriptionEn, booth.descriptionTh) && (
                <p className="mb-0 mt-2 text-[14px] leading-snug text-[#33415F]">{pick(booth.descriptionEn, booth.descriptionTh)}</p>
              )}
              <div className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
                <div className="a-cut a-cut-s a-solid a-fill-tint px-3 py-2">
                  <div className="a-label text-[var(--a-muted)]">{t('bi.where')}</div>
                  <div className="font-semibold text-ink">{booth.location || booth.shortName}</div>
                </div>
                <div className="a-cut a-cut-s a-solid a-fill-tint px-3 py-2">
                  <div className="a-label text-[var(--a-muted)]">{t('bi.when')}</div>
                  <div className="font-semibold text-ink">{t('bi.date')}</div>
                </div>
              </div>
            </section>
            <Transmission text={t('bi.handler', { booth: booth.shortName })} />
            <div className="mt-1 flex flex-col gap-3">
              {agent ? (
                <PrimaryBtn to="/mission" icon={AIcon.scan}>{t('bi.toMission')}</PrimaryBtn>
              ) : (
                <>
                  <PrimaryBtn to="/signup">{t('bi.join')}</PrimaryBtn>
                  <GhostBtn to="/signin">{t('v.landing.have')}</GhostBtn>
                </>
              )}
              <p className="m-0 text-center text-[12.5px] text-[var(--a-muted)]">{t('bi.free')}</p>
            </div>
          </>
        )}
      </main>
    </AGround>
  )
}
