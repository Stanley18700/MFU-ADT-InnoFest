/**
 * Everything the sign-in / sign-up / account screens do to Firebase Auth, in one place.
 *
 * Three of these send mail, and none of it goes through the Resend path in
 * functions/src/mailer.ts — Firebase Auth sends them itself from the templates under
 * Authentication → Templates (see SETUP.md):
 *   · sendVerification        → "Email address verification"
 *   · sendReset               → "Password reset"
 *   · changeEmail             → "Email address change"
 */
import {
  EmailAuthProvider,
  createUserWithEmailAndPassword,
  fetchSignInMethodsForEmail,
  linkWithCredential,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  updatePassword,
  updateProfile,
  verifyBeforeUpdateEmail,
  type ActionCodeSettings,
  type User,
  type UserCredential,
} from 'firebase/auth'
import { APP_ORIGIN, auth, googleProvider } from './firebase'

/** Where Firebase sends the visitor after they finish an emailed action. */
function continueTo(path: string): ActionCodeSettings {
  return { url: `${APP_ORIGIN}${path}`, handleCodeInApp: false }
}

/**
 * LINE, Facebook, Instagram, Messenger, WeChat and TikTok open links in their own webview, and
 * `signInWithPopup` is worse than useless in one: the child window opens, Google signs in, and
 * then it cannot reach the opener across the webview boundary — so the promise never settles
 * and the button spins until the visitor gives up. There is no error to catch, which is why
 * this has to be decided before the popup is attempted rather than in the catch below.
 *
 * Matched on `Line/<version>` rather than a bare "Line": the bare word turns up in unrelated
 * agent strings, and a false positive would push a working desktop browser onto the slower
 * redirect path for no reason.
 */
const IN_APP_WEBVIEW = /FBAN|FBAV|FB_IAB|Instagram|Messenger|MicroMessenger|TikTok|\bLine\/\d/i

export function isInAppWebView(ua: string = navigator.userAgent): boolean {
  return IN_APP_WEBVIEW.test(ua)
}

/**
 * Codes that mean "a popup cannot work here", so a redirect is worth trying instead.
 *
 * `auth/popup-closed-by-user` is deliberately NOT in this list. Closing the window is a
 * decision, and answering it by throwing the whole page into a redirect takes the choice back
 * off the visitor — they get sent to Google again having just said no.
 */
const POPUP_UNAVAILABLE = new Set([
  'auth/popup-blocked',
  'auth/operation-not-supported-in-this-environment',
  'auth/web-storage-unsupported',
])

/**
 * Popup first, because it keeps the half-filled page alive — except in the webviews above,
 * which go straight to a redirect. AuthProvider collects the result with getRedirectResult on
 * the way back, and surfaces the error if there is one.
 *
 * Returns null when a redirect has been started: the page is already navigating away, so the
 * caller must not treat null as failure.
 */
export async function signInWithGoogle(): Promise<UserCredential | null> {
  if (isInAppWebView()) {
    await signInWithRedirect(auth, googleProvider)
    return null
  }
  try {
    return await signInWithPopup(auth, googleProvider)
  } catch (e) {
    const code = (e as { code?: string }).code ?? ''
    if (POPUP_UNAVAILABLE.has(code)) {
      await signInWithRedirect(auth, googleProvider)
      return null
    }
    throw e
  }
}

export async function signInWithEmail(email: string, password: string): Promise<UserCredential> {
  return signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password)
}

/** Creates the account, puts the name on it, and sends the verification mail. */
export async function signUpWithEmail(name: string, email: string, password: string, next = '/mission'): Promise<UserCredential> {
  const cred = await createUserWithEmailAndPassword(auth, email.trim().toLowerCase(), password)
  if (name.trim()) await updateProfile(cred.user, { displayName: name.trim() })
  await sendEmailVerification(cred.user, continueTo(next))
  return cred
}

export async function sendVerification(user: User, next = '/mission'): Promise<void> {
  await sendEmailVerification(user, continueTo(next))
}

export async function sendReset(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim().toLowerCase(), continueTo('/signin'))
}

/**
 * Never `updateEmail` — that would move the account to an address nobody has proved they own.
 * `verifyBeforeUpdateEmail` mails the NEW address and only swaps it when that link is clicked,
 * which is the "Email address change" template.
 */
export async function changeEmail(user: User, newEmail: string): Promise<void> {
  await verifyBeforeUpdateEmail(user, newEmail.trim().toLowerCase(), continueTo('/account'))
}

export async function changePassword(user: User, currentPassword: string, newPassword: string): Promise<void> {
  await reauthenticate(user, currentPassword)
  await updatePassword(user, newPassword)
}

/**
 * Firebase refuses an email or password change on a session older than a few minutes.
 * Password accounts re-enter their password; Google accounts re-do the popup.
 */
export async function reauthenticate(user: User, currentPassword?: string): Promise<void> {
  const byPassword = user.providerData.some((p) => p.providerId === 'password')
  if (byPassword) {
    if (!currentPassword) throw new Error('Enter your current password to confirm this change.')
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email ?? '', currentPassword))
    return
  }
  await reauthenticateWithPopup(user, googleProvider)
}

/** Lets a Google-only account add a password so it can also sign in without Google. */
export async function addPassword(user: User, password: string): Promise<void> {
  await reauthenticate(user)
  await linkWithCredential(user, EmailAuthProvider.credential(user.email ?? '', password))
}

export async function signInMethods(email: string): Promise<string[]> {
  return fetchSignInMethodsForEmail(auth, email.trim().toLowerCase()).catch(() => [])
}

export function hasPassword(user: User | null): boolean {
  return !!user?.providerData.some((p) => p.providerId === 'password')
}

export function hasGoogle(user: User | null): boolean {
  return !!user?.providerData.some((p) => p.providerId === 'google.com')
}

const MESSAGES: Record<string, string> = {
  'auth/invalid-email': 'That does not look like an email address.',
  'auth/missing-password': 'Enter your password.',
  'auth/weak-password': 'Pick a password of at least 8 characters.',
  'auth/email-already-in-use': 'That email already has an account. Sign in instead, or reset the password.',
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/wrong-password': 'Wrong password.',
  'auth/user-not-found': 'No account for that email yet.',
  'auth/user-disabled': 'This account has been disabled. Ask at the Information Desk.',
  'auth/too-many-requests': 'Too many attempts. Wait a minute and try again, or use “Continue with Google”.',
  'auth/network-request-failed': 'No internet connection. Check your signal or Wi-Fi and try again.',
  'auth/popup-closed-by-user': 'The Google window closed before sign-in finished.',
  'auth/cancelled-popup-request': 'The Google window closed before sign-in finished.',
  'auth/popup-blocked': 'Your browser blocked the Google window. Allow pop-ups, or try again.',
  'auth/account-exists-with-different-credential':
    'That email is already registered with a password. Sign in with the password, then link Google from your account page.',
  'auth/requires-recent-login': 'For your security, confirm who you are again before making this change.',
  'auth/credential-already-in-use': 'That sign-in method is already attached to another account.',
  'auth/provider-already-linked': 'That sign-in method is already on this account.',
  'auth/expired-action-code': 'This link has expired. Ask for a new one.',
  'auth/invalid-action-code': 'This link is not valid — it may already have been used.',
  'auth/unauthorized-continue-uri': 'This site is not on the Firebase authorised-domains list yet (see SETUP.md).',
  'auth/operation-not-allowed': 'That sign-in method is switched off in the Firebase console (see SETUP.md).',
  // The redirect half of Google sign-in. These only ever surface after the trip to Google and
  // back, which is why they were invisible while getRedirectResult swallowed its error.
  'auth/unauthorized-domain':
    'This address is not on the Firebase authorised-domains list, so Google sign-in cannot finish here (see SETUP.md).',
  // Thrown when the sessionStorage written before the redirect is gone on the way back — the
  // signature of an in-app browser or of Safari clearing storage across the navigation. There
  // is nothing the visitor can fix inside that webview, so the message says how to leave it.
  'auth/missing-initial-state':
    'This app’s built-in browser cleared the sign-in midway. Open the site in Safari or Chrome — use the ⋯ menu and “Open in browser” — then sign in again.',
  'auth/web-storage-unsupported':
    'This browser is blocking the storage sign-in needs. Open the site in Safari or Chrome, or turn off private browsing, then try again.',
  'auth/redirect-cancelled-by-user': 'Sign-in was cancelled before it finished.',
  'auth/redirect-operation-pending': 'Sign-in is already in progress — give it a moment.',
  'auth/timeout': 'Google took too long to answer. Check the connection and try again.',
}

/** The same messages for a visitor reading the app in Thai. A code missing here falls back to English. */
const MESSAGES_TH: Record<string, string> = {
  'auth/invalid-email': 'รูปแบบอีเมลไม่ถูกต้อง',
  'auth/missing-password': 'กรุณากรอกรหัสผ่าน',
  'auth/weak-password': 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร',
  'auth/email-already-in-use': 'อีเมลนี้มีบัญชีอยู่แล้ว กรุณาเข้าสู่ระบบ หรือตั้งรหัสผ่านใหม่',
  'auth/invalid-credential': 'อีเมลหรือรหัสผ่านไม่ถูกต้อง',
  'auth/wrong-password': 'รหัสผ่านไม่ถูกต้อง',
  'auth/user-not-found': 'ยังไม่มีบัญชีที่ใช้อีเมลนี้ กรุณาสมัครใหม่',
  'auth/user-disabled': 'บัญชีนี้ถูกระงับ กรุณาติดต่อกองอำนวยการ',
  'auth/too-many-requests': 'ลองหลายครั้งเกินไป รอสักครู่แล้วลองใหม่ หรือใช้ “เข้าสู่ระบบด้วย Google”',
  'auth/network-request-failed': 'ไม่มีสัญญาณอินเทอร์เน็ต ตรวจสอบสัญญาณหรือ Wi-Fi แล้วลองใหม่',
  'auth/popup-closed-by-user': 'หน้าต่าง Google ถูกปิดก่อนเข้าสู่ระบบเสร็จ กรุณาลองอีกครั้ง',
  'auth/cancelled-popup-request': 'หน้าต่าง Google ถูกปิดก่อนเข้าสู่ระบบเสร็จ กรุณาลองอีกครั้ง',
  'auth/popup-blocked': 'เบราว์เซอร์บล็อกหน้าต่าง Google กรุณาอนุญาตป๊อปอัป แล้วลองอีกครั้ง',
  'auth/account-exists-with-different-credential': 'อีเมลนี้สมัครด้วยรหัสผ่านไว้แล้ว กรุณาเข้าสู่ระบบด้วยอีเมลและรหัสผ่าน',
  'auth/requires-recent-login': 'เพื่อความปลอดภัย กรุณาเข้าสู่ระบบอีกครั้งก่อนเปลี่ยนข้อมูลนี้',
  'auth/expired-action-code': 'ลิงก์นี้หมดอายุแล้ว กรุณาขอลิงก์ใหม่',
  'auth/invalid-action-code': 'ลิงก์นี้ใช้ไม่ได้ อาจถูกใช้ไปแล้ว กรุณาขอลิงก์ใหม่',
  'auth/missing-initial-state': 'เบราว์เซอร์ในแอปนี้ทำให้เข้าสู่ระบบไม่สำเร็จ กรุณาเปิดเว็บใน Chrome หรือ Safari (เมนู ⋯ แล้วเลือก “เปิดในเบราว์เซอร์”) แล้วเข้าสู่ระบบอีกครั้ง',
  'auth/web-storage-unsupported': 'เบราว์เซอร์นี้เข้าสู่ระบบไม่ได้ กรุณาเปิดเว็บใน Chrome หรือ Safari หรือปิดโหมดส่วนตัว แล้วลองอีกครั้ง',
  'auth/redirect-cancelled-by-user': 'ยกเลิกการเข้าสู่ระบบก่อนเสร็จ กรุณาลองอีกครั้ง',
  'auth/redirect-operation-pending': 'กำลังเข้าสู่ระบบอยู่ กรุณารอสักครู่',
  'auth/timeout': 'Google ตอบช้าเกินไป ตรวจสอบสัญญาณแล้วลองอีกครั้ง',
}

const thai = () => typeof document !== 'undefined' && document.documentElement.lang === 'th'

export function authError(e: unknown): string {
  const err = e as { code?: string; message?: string }
  if (err?.code && thai() && MESSAGES_TH[err.code]) return MESSAGES_TH[err.code]
  if (err?.code && MESSAGES[err.code]) return MESSAGES[err.code]
  if (thai()) return 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง'
  if (err?.message) return err.message.replace(/^Firebase:\s*/, '').replace(/\s*\(auth\/[^)]+\)\.?$/, '')
  return 'Something went wrong. Try again.'
}
