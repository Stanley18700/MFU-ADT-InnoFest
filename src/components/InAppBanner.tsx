import { useState } from 'react'
import { isInAppWebView } from '../lib/authActions'
import { useLocale } from '../lib/locale'

/**
 * "Open this in your browser" — for Messenger, Facebook, Instagram and other apps' own browsers.
 *
 * Inside those, Google refuses to sign anyone in, and the email-confirmation link opens in a
 * different browser from the one waiting for it — so a visitor who arrives from a Messenger chat
 * gets stuck. LINE has its own switch and index.html uses it; the rest have none, so this offers
 * the way out: Chrome on Android (an intent link), Safari on iPhone (x-safari-https, iOS 17+),
 * and otherwise the link copied with the menu instructions.
 *
 * Shown once per page load, dismissible, never outside an in-app browser.
 */
export function InAppBanner() {
  const { t } = useLocale()
  const [gone, setGone] = useState(false)
  const [copied, setCopied] = useState(false)
  if (gone || typeof navigator === 'undefined' || !isInAppWebView()) return null

  const ua = navigator.userAgent
  const url = location.href
  const android = /Android/i.test(ua)
  const ios = /iPhone|iPad|iPod/i.test(ua)

  function open() {
    if (android) {
      const rest = url.replace(/^https?:\/\//, '')
      location.href = `intent://${rest}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`
      return
    }
    if (ios) {
      location.href = `x-safari-${url}`
      // Older iOS ignores the scheme: fall back to copying the link after a moment.
      window.setTimeout(() => { void copy() }, 900)
      return
    }
    void copy()
  }
  async function copy() {
    try { await navigator.clipboard?.writeText(url); setCopied(true) } catch { setCopied(true) }
  }

  return (
    <div role="region" aria-label={t('iab.title')} className="iab sticky top-0 z-[60] px-3 pt-[max(8px,env(safe-area-inset-top))] pb-2">
      <div className="mx-auto flex max-w-md items-start gap-3 rounded-xl bg-[#0A1433] px-3.5 py-3 text-white shadow-lg">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-bold leading-snug">{t('iab.title')}</div>
          <div className="mt-0.5 text-[12.5px] leading-snug text-[#C9D5F2]">{copied ? t('iab.copied') : t('iab.lead')}</div>
          <button type="button" onClick={open}
            className="mt-2 inline-flex min-h-10 cursor-pointer items-center rounded-lg border-0 bg-[#1D5BFF] px-3.5 text-[14px] font-semibold text-white">
            {t('iab.open')}
          </button>
        </div>
        <button type="button" aria-label={t('iab.close')} onClick={() => setGone(true)}
          className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-white/10 text-lg text-white">×</button>
      </div>
    </div>
  )
}
