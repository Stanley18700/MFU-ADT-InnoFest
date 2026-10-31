/**
 * Seed ADT InnoFest 2026: the event, its booths (with secrets) once the list is in
 * booths.data.ts, the two rewards (MFU333 at 50, the prize at 100) and reference data.
 *
 *   npm run seed                 -> against the real project (needs `gcloud auth application-default login`
 *                                   or GOOGLE_APPLICATION_CREDENTIALS)
 *   npm run seed:emulator        -> against the local emulator
 *   node lib/seed.js --admin UID -> also make an existing auth user admin
 *
 * Idempotent: existing booths/tiers keep their secrets and stock.
 */
import { initializeApp } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore'
import { randomBytes } from 'node:crypto'
import {
  BOOTH_BASE_POINTS, DEFAULT_PASSPORT_PREFIX, DEFAULT_PRIZE_SESSIONS, EVENT_DAYS, EVENT_ID, ZONE_POINTS,
} from './shared/model'
import { SEED_BOOTHS } from './booths.data'

const args = process.argv.slice(2)
if (args.includes('--emulator')) {
  process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080'
  process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099'
}
const projectId = process.env.GCLOUD_PROJECT ?? process.env.FIREBASE_PROJECT ?? readFirebaserc()
initializeApp({ projectId })
const db = getFirestore()

function readFirebaserc(): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const rc = require('node:fs').readFileSync(require('node:path').resolve(__dirname, '..', '..', '.firebaserc'), 'utf8')
    return JSON.parse(rc).projects.default
  } catch {
    return 'adt-innofest'
  }
}

/**
 * Two rewards, both collected at the agency (prize) desk and confirmed there by staff, exactly
 * as the InterFest gift was. One visitor can get both.
 *
 *  - MFU333 activity credit at 50 points. Not a physical item, so its "stock" is set far above
 *    any possible attendance; the Rewards tab does not show a count for it.
 *  - The prize at 100 points. PLACEHOLDER stock until the organisers say what it is and how
 *    many there are — set the real number in Admin → Prizes & stock.
 */
const TIERS = [
  {
    id: 'mfu333', name: 'MFU333', thresholdPoints: 50, sortOrder: 1, stockTotal: 100000,
    reward: 'MFU333 activity credit — MFU students, at the agency desk with your student ID',
    outOfStockNoteEn: '',
  },
  {
    id: 'prize', name: 'Prize', thresholdPoints: 100, sortOrder: 2, stockTotal: 300,
    reward: 'The ADT InnoFest prize, collected at the agency desk',
    outOfStockNoteEn: 'The prizes have all been collected — thank you for completing the mission.',
  },
] as const

async function main() {
  console.log(`Seeding project ${projectId}${process.env.FIRESTORE_EMULATOR_HOST ? ' (emulator)' : ''}`)

  await db.doc(`events/${EVENT_ID}`).set({
    nameTh: 'ADT InnoFest 2026', nameEn: 'ADT InnoFest 2026',
    startsAt: Timestamp.fromDate(new Date('2026-11-11T08:00:00+07:00')),
    endsAt: Timestamp.fromDate(new Date('2026-11-11T17:00:00+07:00')),
    stampMarkTop: 'ADT INNOFEST', stampMarkBottom: '2026 · MFU',
    qrPeriodSeconds: 20, active: true, boothCount: SEED_BOOTHS.length, createdAt: FieldValue.serverTimestamp(),
    // The event is data, not a constant, so an admin can archive it and create the next one
    // from /admin/event without a redeploy. The prize windows are data for the same reason:
    // on the day, the desk opening times move.
    days: [...EVENT_DAYS], passportPrefix: DEFAULT_PASSPORT_PREFIX, zonePoints: { ...ZONE_POINTS }, status: 'live',
    prizeSessions: DEFAULT_PRIZE_SESSIONS.map((s) => ({ ...s })),
  }, { merge: true })

  for (const [i, b] of SEED_BOOTHS.entries()) {
    const ref = db.doc(`booths/${b.id}`)
    const exists = (await ref.get()).exists
    await ref.set({
      eventId: EVENT_ID, nameEn: b.nameEn, nameTh: b.nameTh, shortName: b.shortName, hostUnit: b.hostUnit,
      location: b.location, category: b.category,
      descriptionEn: b.descriptionEn, descriptionTh: '',
      accentColor: b.accentColor, points: BOOTH_BASE_POINTS, zone: b.zone,
      badgeUrl: null, badgeThumbUrl: null, photoUrl: null, photoThumbUrl: null,
      activeDays: [...EVENT_DAYS], isPrizeDesk: b.isPrizeDesk, active: true, sortOrder: i + 1,
      ...(exists ? {} : { organizerUid: null, createdAt: FieldValue.serverTimestamp() }),
    }, { merge: true })
    const sRef = db.doc(`boothSecrets/${b.id}`)
    if (!(await sRef.get()).exists) {
      await sRef.set({ secret: randomBytes(32).toString('base64'), rotatedAt: FieldValue.serverTimestamp(), rotatedBy: 'seed' })
    }
    await db.doc(`stats/booths/items/${b.id}`).set({ boothId: b.id, stamps: FieldValue.increment(0), byVisitorType: {}, byDay: {}, byHour: {} }, { merge: true })
  }

  for (const tier of TIERS) {
    const ref = db.doc(`prizeTiers/${tier.id}`)
    const exists = (await ref.get()).exists
    await ref.set({
      eventId: EVENT_ID, name: tier.name, thresholdPoints: tier.thresholdPoints, reward: tier.reward,
      grantsDrawEntry: false, active: true, sortOrder: tier.sortOrder,
      outOfStockNoteEn: tier.outOfStockNoteEn, outOfStockNoteTh: '',
      // Stock is only written the first time: a re-seed must never refill what the desk has spent.
      ...(exists ? {} : { stockTotal: tier.stockTotal, stockRemaining: tier.stockTotal, sessionRemaining: {} }),
    }, { merge: true })
    if (!exists) {
      await db.collection('stockAdjustments').add({
        tierId: tier.id, delta: tier.stockTotal, actorUid: 'seed', kind: 'load-in',
        reason: `load-in (seed): ${tier.stockTotal}`, createdAt: FieldValue.serverTimestamp(),
      })
    }
  }

  await db.doc('refData/institutions').set({ list: [
    'MFU', 'Chiang Rai Rajabhat University', 'Rajamangala University of Technology Lanna (Chiang Rai)', 'Chiang Mai University',
    'Chulalongkorn University', 'Mahidol University', 'Thammasat University', 'Kasetsart University', 'Khon Kaen University',
    'Prince of Songkla University', 'Naresuan University', 'University of Phayao', 'Yunnan University', 'Kunming University of Science and Technology',
    'National University of Laos', 'University of Yangon', 'Royal University of Phnom Penh', 'Vietnam National University', 'Tribhuvan University', 'Other',
  ] })
  await db.doc('refData/mfuSchools').set({ list: [
    'School of Agro-Industry', 'School of Applied Digital Technology', 'School of Cosmetic Science', 'School of Dentistry', 'School of Health Science',
    'School of Integrative Medicine', 'School of Law', 'School of Liberal Arts', 'School of Management', 'School of Medicine', 'School of Nursing',
    'School of Science', 'School of Sinology', 'School of Social Innovation', 'Staff / Office', 'Other',
  ] })
  // §4.1 — a starting point, to be reviewed by the Office of International Affairs. Alphabetical, not by population.
  await db.doc('refData/ethnicGroups').set({
    MM: ['Bamar', 'Chin', 'Chinese-Myanmar', 'Danu', 'Indian-Myanmar', 'Kachin', 'Karen (Kayin)', 'Kayah', 'Mon', 'Pa-O', 'Palaung (Ta\'ang)', 'Rakhine', 'Rohingya', 'Shan', 'Wa'],
    TH: ['Akha', 'Central Thai', 'Hmong', 'Isan', 'Karen', 'Lahu', 'Lisu', 'Mien (Yao)', 'Northern Thai (Lanna)', 'Southern Thai', 'Tai Lue', 'Tai Yai (Shan)', 'Thai Malay', 'Thai-Chinese'],
    CN: ['Dai', 'Han', 'Hui', 'Miao', 'Tibetan', 'Uyghur', 'Yi', 'Zhuang'],
    LA: ['Hmong', 'Khmu', 'Lao Loum', 'Lao Soung', 'Lao Theung'],
    NP: ['Bahun', 'Chhetri', 'Gurung', 'Magar', 'Newar', 'Rai', 'Sherpa', 'Tamang', 'Tharu'],
    IN: ['Assamese', 'Bengali', 'Gujarati', 'Hindi-speaking', 'Kannada', 'Malayali', 'Marathi', 'Punjabi', 'Tamil', 'Telugu'],
    BT: ['Lhotshampa', 'Ngalop', 'Sharchop'],
    KH: ['Cham', 'Chinese-Cambodian', 'Khmer', 'Vietnamese-Cambodian'],
    VN: ['Hmong', 'Khmer Krom', 'Kinh', 'Muong', 'Nung', 'Tay', 'Thai'],
  })

  const adminIdx = args.indexOf('--admin')
  if (adminIdx >= 0 && args[adminIdx + 1]) {
    const uid = args[adminIdx + 1]
    await getAuth().setCustomUserClaims(uid, { role: 'admin' })
    await db.doc(`users/${uid}`).set({
      role: 'admin', displayName: 'Admin', contact: `admin-${uid}`, visitorType: 'staff', institution: 'MFU', countryCode: 'TH', isInternational: false,
      stampCount: 0, points: 0, stampedBoothIds: [], daysAttended: [], createdAt: FieldValue.serverTimestamp(),
    }, { merge: true })
    console.log(`Made ${uid} an admin`)
  }
  console.log(`Seeded ${SEED_BOOTHS.length} booths, ${TIERS.length} rewards, reference data.`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
