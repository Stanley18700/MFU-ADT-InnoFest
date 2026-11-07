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
 *
 * Outside an in-app browser it doubles as a browser tip, for the few cases where the mission
 * really does go better elsewhere (see `browserTip`): an Android browser other than Chrome or
 * Samsung Internet, an iPhone too old for the camera, or any browser with no camera access.
 * That one is remembered once dismissed.
 */
type Tip = 'android' | 'oldIos' | 'noCamera'
export function browserTip(ua: string, hasCamera: boolean): Tip | null {
  const android = /Android/i.test(ua)
  const ios = /iPhone|iPad|iPod/i.test(ua)
  if (android) {
    const chrome = /Chrome\/\d/.test(ua) && !/EdgA|OPR\/|Opera|SamsungBrowser|MiuiBrowser|HeyTapBrowser|UCBrowser|YaBrowser|Vivaldi|DuckDuckGo|Firefox|; wv\)/i.test(ua)
    const samsung = /SamsungBrowser\/(\d+)/.exec(ua)
    if (!chrome && !(samsung && Number(samsung[1]) >= 14)) return 'android'
  }
  if (ios) {
    const v = /OS (\d+)_/.exec(ua)
    if (v && Number(v[1]) < 15) return 'oldIos'
  }
  if ((android || ios) && !hasCamera) return 'noCamera'
  return null
}

const TIP_KEY = 'mfu-browser-tip'
function tipDismissed() { try { return localStorage.getItem(TIP_KEY) === '1' } catch { return false } }

export function InAppBanner() {
  const { t } = useLocale()
  const [gone, setGone] = useState(false)
  const [copied, setCopied] = useState(false)
  if (gone || typeof navigator === 'undefined') return null
  if (!isInAppWebView()) {
    const tip = tipDismissed() ? null : browserTip(navigator.userAgent, !!navigator.mediaDevices?.getUserMedia)
    return tip ? <BrowserTip tip={tip} onClose={() => { try { localStorage.setItem(TIP_KEY, '1') } catch { /* shows again */ } setGone(true) }} /> : null
  }

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

/** The browser tip: Chrome on Android (one tap), Safari on iPhone, an update for an old iPhone. */
function BrowserTip({ tip, onClose }: { tip: Tip; onClose: () => void }) {
  const { t } = useLocale()
  const [copied, setCopied] = useState(false)
  const android = /Android/i.test(navigator.userAgent)
  const url = location.href
  function openChrome() {
    const rest = url.replace(/^https?:\/\//, '')
    location.href = `intent://${rest}#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`
  }
  async function copy() { try { await navigator.clipboard?.writeText(url) } catch { /* shown anyway */ } setCopied(true) }
  const lead = tip === 'android' ? t('bt.android') : tip === 'oldIos' ? t('bt.oldIos') : t('bt.noCamera')
  return (
    <div role="region" aria-label={t('bt.title')} className="iab sticky top-0 z-[60] px-3 pt-[max(8px,env(safe-area-inset-top))] pb-2">
      <div className="mx-auto flex max-w-md items-start gap-3 rounded-xl bg-[#0A1433] px-3.5 py-3 text-white shadow-lg">
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-bold leading-snug">{t('bt.title')}</div>
          <div className="mt-0.5 text-[12.5px] leading-snug text-[#C9D5F2]">{copied ? t('bt.copied') : lead}</div>
          {tip !== 'oldIos' && (
            <button type="button" onClick={android ? openChrome : () => void copy()}
              className="mt-2 inline-flex min-h-10 cursor-pointer items-center rounded-lg border-0 bg-[#1D5BFF] px-3.5 text-[14px] font-semibold text-white">
              {android ? t('bt.openChrome') : t('bt.copy')}
            </button>
          )}
        </div>
        <button type="button" aria-label={t('iab.close')} onClick={onClose}
          className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-full border-0 bg-white/10 text-lg text-white">×</button>
      </div>
    </div>
  )
}
