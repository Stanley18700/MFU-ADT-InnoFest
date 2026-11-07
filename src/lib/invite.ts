/**
 * A booth's invite link (`/b/{boothId}`). The booth id is kept on this device until the visitor
 * finishes signing up, then sent with `join` so the booth is credited with an "invited" sign-up.
 * Kept for 30 days: people open the link days before the event and sign up later.
 */
const KEY = 'mfu-ref'
const TTL = 30 * 24 * 3600_000

export function rememberInvite(boothId: string) {
  try { localStorage.setItem(KEY, JSON.stringify({ id: boothId, at: Date.now() })) } catch { /* not credited; harmless */ }
}
export function pendingInvite(): string | undefined {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { id?: string; at?: number } | null
    return v?.id && v.at && Date.now() - v.at < TTL ? v.id : undefined
  } catch { return undefined }
}
export function clearInvite() { try { localStorage.removeItem(KEY) } catch { /* fine */ } }

/** The link an exhibitor shares. */
export function inviteUrl(origin: string, boothId: string) { return `${origin.replace(/\/$/, '')}/b/${encodeURIComponent(boothId)}` }
