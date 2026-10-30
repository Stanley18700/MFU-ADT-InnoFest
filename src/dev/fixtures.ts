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
  { id: 'mfu333', eventId: 'innofest-2026', name: 'MFU333', thresholdPoints: 50, reward: 'MFU333 activity credit', stockTotal: 5000, stockRemaining: 5000, grantsDrawEntry: false, active: true, sortOrder: 1 },
  { id: 'prize', eventId: 'innofest-2026', name: 'Prize', thresholdPoints: 100, reward: 'The InnoFest prize', stockTotal: 300, stockRemaining: 260, grantsDrawEntry: false, active: true, sortOrder: 2 },
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
const fxSurvey = {
  id: '_festival_', boothId: '_festival_', eventId: 'innofest-2026', title: 'Field report', active: true, gateGift: false, responseCount: 0, updatedAt: null, updatedBy: '',
  questions: [
    { id: 'q1', kind: 'scale', title: 'How fun was the agent mission?', required: true, scaleMin: 1, scaleMax: 5, scaleMinLabel: 'Not fun', scaleMaxLabel: 'Loved it' },
    { id: 'q2', kind: 'choice', title: 'How did you hear about ADT InnoFest?', required: true, options: ['Facebook', 'Friends', 'Teacher', 'Poster'] },
    { id: 'q3', kind: 'rating', title: 'Rate the projects overall', required: false, stars: 5 },
    { id: 'q4', kind: 'paragraph', title: 'Anything to tell the organizers?', required: false },
  ],
}
export function fxDoc(path: string): (Record<string, unknown> & { id: string }) | null {
  if (path === 'users/fx-user') return fxUser
  if (path === 'surveys/_festival_') return qs.has('survey') ? fxSurvey : null
  if (path === 'surveyTaken/fx-user__festival_') return qs.get('survey') === 'taken' ? { id: 'x' } : null
  if (path.startsWith('booths/')) return fxBooths.find((b) => `booths/${b.id}` === path) ?? null
  if (path === 'stats/event') return { id: 'event', activeLast15m: 212 }
  if (path.startsWith('stats/booths/items/')) return { id: 'b14', stamps: 214, visitors: 214, points: 214 }
  return null
}

/** Canned answers to the callables the visitor screens use. `?scan=` picks the scan outcome. */
export async function fxCall(name: string, _data: unknown): Promise<unknown> {
  await new Promise((r) => setTimeout(r, 250))
  const b = fxBooths[FX.points]
  switch (name) {
    case 'redemptionCode': return { code: 'K7F2QX9A', counter: Math.floor(Date.now() / 30000), period: 30, payload: 'fx-payload', serverTime: Date.now() }
    case 'scan': {
      const kind = new URLSearchParams(location.search).get('scan') ?? 'ok'
      if (kind === 'already') return { status: 'already', boothId: fxBooths[0].id }
      if (kind === 'invalid' || kind === 'expired' || kind === 'rate_limited') return { status: kind }
      return { status: 'success', boothId: b.id, pointsAwarded: 1, points: FX.points + 1, stampCount: FX.points + 1, unlockedTierIds: FX.points + 1 === 50 ? ['mfu333'] : [], serverTime: Date.now() }
    }
    case 'rateBooth': return { ok: true, already: false }
    case 'boothSession': return { boothId: 'b14', booth: fxBooths[13], secret: 'JBSWY3DPEHPK3PXP', period: 20, serverTime: Date.now() }
    case 'surveyForBooth': return { status: 'ok', title: 'Field report', description: '2036 wants your field report. A few questions, about two minutes.', questions: fxSurvey.questions, gatingGift: false }
    case 'submitSurveyResponse': return { ok: true, rewardIndex: null }
    default: return { ok: true }
  }
}
