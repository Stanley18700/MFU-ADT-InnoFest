/*
 * Sample data for `npm run preview:fixtures` — the visitor screens rendered with no Firebase at
 * all, for design review and screenshots. Never imported by a real build: vite.config.ts swaps
 * the data and auth modules for these only in `--mode fixtures`.
 *
 * The scenario comes from the URL, read once: `?fx=anon|unverified|new|visitor`, `&pts=57`.
 */
const qs = new URLSearchParams(location.search)
export const FX = {
  as: (qs.get('fx') ?? 'visitor') as 'anon' | 'unverified' | 'new' | 'visitor' | 'organizer' | 'admin',
  points: Number(qs.get('pts') ?? 57),
  redeemed: qs.get('redeemed') ?? '',
}

const CATS = ['ai', 'robotics', 'iot', 'media', 'games', 'arvr'] as const
const TITLES = [
  'AR Campus Navigator', 'Thai Sign Language Translator', 'Smart Farming System', 'Robot Arm Barista',
  'Mekong Flood Watch', 'Indie Game Jam: Lanna Quest', 'VR Campus Tour', 'AI Chat Helper', 'Motion Capture Studio',
  'GenAI Poster Lab', 'Short Film Hub', 'Smart Parking MFU', 'Tea Leaf Grader', 'Drone Crop Survey',
  'Accessible Bus Finder', 'Pixel Museum', 'Voice-to-Braille', 'Air Quality Mesh', 'Esports Coach AI', 'Hologram Guide',
]
const TEAMS = ['Kittipong S. · Nattaya P. · Wuttichai R.', 'Ploy C. · Arthit M.', 'Siriporn K. · Thanawat J.', 'Pimchanok K. · Natthapong L. · Ying W.']
export const fxBooths = Array.from({ length: 100 }, (_, i) => {
  const zone = 'ABCD'[Math.floor(i / 25)]
  const code = `${zone}-${String((i % 25) + 1).padStart(2, '0')}`
  return {
    id: `b${i + 1}`, eventId: 'innofest-2026', nameEn: TITLES[i % TITLES.length] + (i >= TITLES.length ? ` ${Math.floor(i / TITLES.length) + 1}` : ''),
    nameTh: '', shortName: code, hostUnit: TEAMS[i % TEAMS.length], location: `Zone ${zone} · Booth ${(i % 25) + 1}`,
    descriptionEn: 'An app that helps visitors find their way around the MFU campus with augmented reality and live arrows.',
    category: CATS[i % CATS.length], accentColor: '#1D5BFF', points: 1, zone: 'middle', activeDays: ['2026-11-11'],
    isPrizeDesk: false, active: true, sortOrder: i, createdAt: null,
  }
})
const stamped = fxBooths.slice(0, FX.points).map((b) => b.id)
export const fxUser = {
  id: 'fx-user', role: 'visitor', displayName: 'Pimchanok K.', visitorType: 'student', studentId: '6731503077',
  passportNo: 'ADT-IF-0001', stampCount: stamped.length, points: stamped.length, stampedBoothIds: stamped, daysAttended: ['2026-11-11'],
  createdAt: null,
}
export const fxEvent = {
  id: 'innofest-2026', nameEn: 'ADT InnoFest 2026', nameTh: 'ADT InnoFest 2026', status: 'live', active: true, boothCount: 100,
  startsAt: { toMillis: () => Date.parse('2026-11-11T08:00:00+07:00') }, endsAt: { toMillis: () => Date.parse('2026-11-11T17:00:00+07:00') },
  qrPeriodSeconds: 20, days: ['2026-11-11'], passportPrefix: 'ADT-IF', zonePoints: { entrance: 1, middle: 1, far: 1 },
  prizeSessions: [{ id: 'day', label: 'All day', startMinute: 8 * 60, endMinute: 17 * 60 }],
}
export const fxTiers = [
  { id: 'mfu333', eventId: 'innofest-2026', name: 'MFU333 activity credit', thresholdPoints: 50, reward: 'MFU333 activity credit', stockTotal: 5000, stockRemaining: 5000, grantsDrawEntry: false, active: true, sortOrder: 1 },
  { id: 'prize', eventId: 'innofest-2026', name: 'InnoFest prize', thresholdPoints: 100, reward: 'The InnoFest prize', stockTotal: 300, stockRemaining: 260, grantsDrawEntry: false, active: true, sortOrder: 2 },
]
export const fxUnlocks = fxTiers.filter((t) => FX.points >= t.thresholdPoints).map((t) => ({
  id: `fx-${t.id}`, visitorId: 'fx-user', tierId: t.id, unlockedAt: { toMillis: () => Date.now() - 3600_000 }, pointsAtUnlock: t.thresholdPoints, stampCountAtUnlock: t.thresholdPoints,
  ...(FX.redeemed.split(',').includes(t.id) ? { redeemedAt: { toMillis: () => Date.parse('2026-11-11T12:18:00+07:00') } } : {}),
}))
export const fxScans = stamped.map((id, i) => ({ id: `s${i}`, visitorId: 'fx-user', boothId: id, eventId: 'innofest-2026', scannedAt: { toMillis: () => Date.now() - (stamped.length - i) * 300_000 }, day: '2026-11-11', pointsAwarded: 1, counter: i }))
export const fxStatsShards = [{ id: '0', visitors: 1240, stamps: 41870, points: 41870, redeemed: 310, visitorsWithStamps: 1180, tierReached: 640 }]

/** Collection or document path → rows. */
export function fxRows(path: string): Array<Record<string, unknown> & { id: string }> {
  switch (path) {
    case 'events': return [fxEvent]
    case 'booths': return fxBooths
    case 'prizeTiers': return fxTiers
    case 'tierUnlocks': return fxUnlocks
    case 'scans': return fxScans
    case 'stats/event/shards': return fxStatsShards as never
    default: return []
  }
}
export function fxDoc(path: string): (Record<string, unknown> & { id: string }) | null {
  if (path === 'users/fx-user') return fxUser
  if (path.startsWith('booths/')) return fxBooths.find((b) => `booths/${b.id}` === path) ?? null
  if (path === 'stats/event') return { id: 'event', activeLast15m: 212 }
  return null
}
