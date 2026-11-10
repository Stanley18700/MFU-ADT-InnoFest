/**
 * Booth ratings — the one question asked after every stamp.
 *
 * See the header above `BoothRatingDoc` in shared/model.ts for the two rules this file keeps:
 * the rating never touches the passport, and it carries no identity. The three documents
 * written here say it in code:
 *
 *   boothRatings/{autoId}               the score and comment, with no visitor id anywhere
 *   boothRated/{visitorId}_{boothId}    "this person has rated this booth", with no score
 *   stats/ratings/items/{boothId}       the running count, total and distribution, overall and per criterion
 *
 * All three are written in one transaction, so a booth's average can never drift from the rows
 * behind it, and a visitor who double-taps is counted once.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { db, FieldValue, requireAuth, str, getActiveEvent, rateLimit } from './lib'
import { BoothRatedDoc, BoothRatingDoc, RATING_COMMENT_MAX, RATING_CRITERIA, RatingCriterion, dayOf, ratingOpen } from './shared/model'

/**
 * Leave a rating for a booth already in your passport: `{ boothId, scores: { design, problem,
 * creativity, future, impact }, comment? }`, every score a whole 1–5.
 *
 * Returns `{ ok: true }` on the first rating and `{ ok: true, already: true }` on any later
 * one. A second attempt is not an error: the phone that lost its reply to a dropped connection
 * retries, and the visitor should see it succeed rather than a red box telling them off.
 */
export const rateBooth = onCall(async (req) => {
  const uid = requireAuth(req)
  const ev = await getActiveEvent()
  const boothId = str(req.data?.boothId, 'boothId', { max: 60 })
  // Winners are announced at 14:00; votes stop at the cutoff, by this server's clock.
  if (!ratingOpen(Date.now(), ev.ratingClosesAt)) {
    throw new HttpsError('failed-precondition', 'Rating has closed')
  }

  // Not `num()`: that accepts 3.5 and 0, and a score has to be one of five whole values.
  const raw = req.data?.scores
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new HttpsError('invalid-argument', 'scores is required')
  }
  const unknown = Object.keys(raw).filter((k) => !(RATING_CRITERIA as readonly string[]).includes(k))
  if (unknown.length) throw new HttpsError('invalid-argument', `unknown score: ${unknown[0]}`)
  const scores = {} as Record<RatingCriterion, number>
  for (const k of RATING_CRITERIA) {
    const v = (raw as Record<string, unknown>)[k]
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > 5) {
      throw new HttpsError('invalid-argument', `${k} must be a whole number from 1 to 5`)
    }
    scores[k] = v
  }
  const mean = RATING_CRITERIA.reduce((n, k) => n + scores[k], 0) / RATING_CRITERIA.length
  const stars = Math.round(mean)

  const comment = str(req.data?.comment, 'comment', { required: false, max: RATING_COMMENT_MAX }).trim()

  // A rating is cheap to write and cheaper to spam. Same shape as the scan limiter.
  if (!(await rateLimit(`rate_${uid}`, 40, 300))) {
    throw new HttpsError('resource-exhausted', 'Too many ratings — wait a moment.')
  }

  /*
   * Only someone who actually visited may rate, exactly as with the old surveys: the booth's
   * scan row is the proof, and it is written by `scan` before any of this is reachable. It
   * also means a rating for a booth that does not exist cannot be recorded, without a second
   * read of `booths`.
   */
  if (!(await db.doc(`scans/${uid}_${boothId}`).get()).exists) {
    throw new HttpsError('failed-precondition', 'Collect this booth’s stamp first')
  }

  const markerRef = db.doc(`boothRated/${uid}_${boothId}`)
  const ratingRef = db.collection('boothRatings').doc()
  const statsRef = db.doc(`stats/ratings/items/${boothId}`)

  const marker: BoothRatedDoc = { boothId, ratedAt: FieldValue.serverTimestamp() }
  const rating: BoothRatingDoc = {
    boothId,
    eventId: ev.id,
    scores,
    stars,
    ratedAt: FieldValue.serverTimestamp(),
    day: dayOf(new Date()),
    ...(comment ? { comment } : {}),
  }

  try {
    await db.runTransaction(async (tx) => {
      // `create` rather than `set`: two taps a few milliseconds apart both pass the read above,
      // and this is what makes the second one lose.
      tx.create(markerRef, marker)
      tx.create(ratingRef, rating)
      // Nested rather than a dotted key: `set(..., { merge: true })` would read 'dist.4' as a
      // field name containing a dot, and quietly build a second, useless field.
      tx.set(statsRef, {
        boothId,
        count: FieldValue.increment(1),
        sum: FieldValue.increment(mean),
        dist: { [String(stars)]: FieldValue.increment(1) },
        crit: Object.fromEntries(RATING_CRITERIA.map((k) => [k, {
          sum: FieldValue.increment(scores[k]),
          dist: { [String(scores[k])]: FieldValue.increment(1) },
        }])),
        comments: FieldValue.increment(comment ? 1 : 0),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true })
    })
  } catch (e) {
    const code = (e as { code?: number | string })?.code
    // ALREADY_EXISTS — the marker was there, so this visitor has rated this booth before.
    if (code === 6 || code === 'already-exists') return { ok: true as const, already: true }
    throw e
  }

  return { ok: true as const, already: false }
})
