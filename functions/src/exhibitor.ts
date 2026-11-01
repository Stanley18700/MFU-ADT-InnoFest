/**
 * Exhibitors register themselves — against the organizers' official list.
 *
 * At InterFest every booth host had to be invited by email or approved by hand, and on the day
 * that was the bottleneck. Here an admin loads the official project list once (project names and
 * each team's member names), and from then on a student opens /exhibit, signs in, picks their
 * project and types their own name. If that name is on that project's team list, the account
 * becomes that booth's organizer on the spot: QR screen and stats, no admin in the loop.
 *
 * What keeps it honest:
 *  - the team lists are private (`boothRosters`, admin-read only), so the page cannot be used to
 *    look a name up — you have to already know it;
 *  - each name on a list can be registered by one account; a second account typing the same
 *    name is refused and pointed at the desk, where an admin can reset that seat;
 *  - tries are rate-limited per account, every registration is in the audit log, and an admin can
 *    still switch a booth off or rotate its secret as before.
 */
import { onCall, HttpsError } from 'firebase-functions/v2/https'
import { db, auth, FieldValue, requireAuth, requireRole, str, audit, getActiveEvent, rateLimit } from './lib'
import { BoothDoc, BoothRosterDoc, RosterMember, UserDoc, normPersonName, rosterKeys } from './shared/model'
import { createBoothDoc } from './admin'

/** An exhibitor claims their place on a booth's team. */
export const claimBoothSeat = onCall(async (req) => {
  const uid = requireAuth(req)
  if (req.auth!.token.email_verified !== true && !req.auth!.token.phone_number) {
    throw new HttpsError('failed-precondition', 'Confirm your email address first — check your inbox for the link')
  }
  const role = req.auth!.token.role as string | undefined
  const claimBooth = req.auth!.token.boothId as string | undefined
  if (role === 'admin') throw new HttpsError('failed-precondition', 'This is an admin account — admins can already open every booth screen.')

  const boothId = str(req.data?.boothId, 'boothId', { max: 40 })
  const typed = str(req.data?.name, 'name', { max: 120 })
  if (role === 'organizer' && claimBooth && claimBooth !== boothId) {
    throw new HttpsError('failed-precondition', 'This account is already registered for another booth. Ask the organizers to move it.')
  }
  if (!(await rateLimit(`seat_${uid}`, 8, 600))) {
    throw new HttpsError('resource-exhausted', 'Too many tries. Wait ten minutes, or ask the organizers at the agency desk.')
  }

  const key = normPersonName(typed)
  if (key.length < 2) throw new HttpsError('invalid-argument', 'Type your full name as it appears on the official list.')

  const ev = await getActiveEvent()
  const boothRef = db.doc(`booths/${boothId}`)
  const rosterRef = db.doc(`boothRosters/${boothId}`)

  const result = await db.runTransaction(async (tx) => {
    const [boothSnap, rosterSnap] = await Promise.all([tx.get(boothRef), tx.get(rosterRef)])
    if (!boothSnap.exists) throw new HttpsError('not-found', 'That project is not on the list.')
    const booth = boothSnap.data() as BoothDoc
    if (booth.eventId !== ev.id || !booth.active) throw new HttpsError('failed-precondition', 'That booth is not open for registration.')
    if (!rosterSnap.exists) throw new HttpsError('failed-precondition', 'This project has no team list yet. Ask the organizers at the agency desk.')
    const roster = rosterSnap.data() as BoothRosterDoc
    const i = roster.members.findIndex((m) => m.keys.includes(key))
    if (i < 0) {
      throw new HttpsError('not-found', 'That name is not on this project’s team list. Type it exactly as on the official list, in English or Thai.')
    }
    const m = roster.members[i]
    if (m.uid && m.uid !== uid) {
      throw new HttpsError('already-exists', 'That team member is already registered on another account. Ask the organizers at the agency desk to reset it.')
    }
    const members = roster.members.slice()
    members[i] = { ...m, uid, email: (req.auth!.token.email as string | undefined) ?? null, claimedAt: m.claimedAt ?? Date.now() }
    tx.set(rosterRef, { members }, { merge: true })
    if (!booth.organizerUid) tx.set(boothRef, { organizerUid: uid }, { merge: true })
    return { member: m.name, boothName: booth.nameEn }
  })

  await auth.setCustomUserClaims(uid, { role: 'organizer', boothId })

  // Promote, never reset — the same care as acceptInvite: a student who scanned booths as a
  // visitor this morning keeps their own record.
  const userRef = db.doc(`users/${uid}`)
  const existing = await userRef.get()
  const email = (req.auth!.token.email as string | undefined) ?? ''
  await userRef.set(existing.exists
    ? { role: 'organizer', boothId, lastSeenAt: FieldValue.serverTimestamp(),
        displayName: (existing.data() as UserDoc).displayName || result.member }
    : {
      role: 'organizer', boothId, displayName: result.member.split(/[/|]/)[0].trim(), contact: email, contactVerified: true,
      visitorType: 'staff', institution: 'MFU', countryCode: 'TH', isInternational: false,
      stampCount: 0, points: 0, stampedBoothIds: [], daysAttended: [],
      createdAt: FieldValue.serverTimestamp(), lastSeenAt: FieldValue.serverTimestamp(),
    }, { merge: true })

  await audit(uid, 'claimBoothSeat', 'booth', boothId, null, { member: result.member })
  return { ok: true as const, boothId, boothName: result.boothName }
})

type ImportRow = { boothNo: string; nameEn: string; nameTh?: string; team: string[]; hostUnit?: string; location?: string }

/**
 * Load (or reload) the official project list: one row per project. A booth is matched by its
 * booth number, so loading a corrected list updates projects in place — and keeps every
 * registration whose name is still on the team.
 */
export const importProjectList = onCall({ timeoutSeconds: 300 }, async (req) => {
  const { uid: actor } = requireRole(req, 'admin')
  const rows = req.data?.rows as ImportRow[] | undefined
  if (!Array.isArray(rows) || rows.length === 0) throw new HttpsError('invalid-argument', 'No rows to import')
  if (rows.length > 400) throw new HttpsError('invalid-argument', 'At most 400 projects at a time')
  const ev = await getActiveEvent(true)

  let created = 0, updated = 0, members = 0
  for (const [n, r] of rows.entries()) {
    const boothNo = str(r?.boothNo, `row ${n + 1} booth number`, { max: 24 })
    const nameEn = str(r?.nameEn, `row ${n + 1} project name`, { max: 120 })
    const nameTh = str(r?.nameTh, 'nameTh', { required: false, max: 120 })
    const hostUnit = str(r?.hostUnit, 'hostUnit', { required: false, max: 120 })
    const location = str(r?.location, 'location', { required: false, max: 80 })
    const team = (Array.isArray(r?.team) ? r.team : []).map((x) => String(x ?? '').trim()).filter(Boolean).slice(0, 12)
    const id = `b-${boothNo.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}`
    if (id === 'b-') throw new HttpsError('invalid-argument', `Row ${n + 1}: booth number needs a letter or digit`)

    const ref = db.doc(`booths/${id}`)
    const snap = await ref.get()
    if (snap.exists) {
      await ref.set({
        nameEn, ...(nameTh ? { nameTh } : {}), shortName: boothNo,
        ...(hostUnit ? { hostUnit } : {}), ...(location ? { location } : {}), teamSize: team.length,
      }, { merge: true })
      updated++
    } else {
      await createBoothDoc(ev, { id, nameEn, nameTh, shortName: boothNo, hostUnit, location }, actor)
      await ref.set({ teamSize: team.length }, { merge: true })
      created++
    }

    // Keep each existing registration whose person is still on the list.
    const rosterRef = db.doc(`boothRosters/${id}`)
    const prev = ((await rosterRef.get()).data() as BoothRosterDoc | undefined)?.members ?? []
    const next: RosterMember[] = team.map((line) => {
      const keys = rosterKeys(line)
      const kept = prev.find((p) => p.uid && p.keys.some((k) => keys.includes(k)))
      return { name: line, keys, uid: kept?.uid ?? null, email: kept?.email ?? null, claimedAt: kept?.claimedAt ?? null }
    })
    await rosterRef.set({ boothId: id, members: next, updatedAt: FieldValue.serverTimestamp() })
    members += next.length
  }
  await audit(actor, 'importProjectList', 'event', ev.id, null, { projects: rows.length, created, updated, members })
  return { ok: true as const, created, updated, members }
})

/**
 * Free one name on a team list — for "someone registered as me" or a student who signed in with
 * the wrong account. The account that held it goes back to having no role (it can register again,
 * or join as a visitor).
 */
export const resetTeamSeat = onCall(async (req) => {
  const { uid: actor } = requireRole(req, 'admin')
  const boothId = str(req.data?.boothId, 'boothId', { max: 40 })
  const name = str(req.data?.name, 'name', { max: 160 })
  const ref = db.doc(`boothRosters/${boothId}`)
  const freed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref)
    if (!snap.exists) throw new HttpsError('not-found', 'No team list for that booth')
    const members = (snap.data() as BoothRosterDoc).members.slice()
    const i = members.findIndex((m) => m.name === name)
    if (i < 0) throw new HttpsError('not-found', 'That name is not on the list')
    const was = members[i].uid ?? null
    members[i] = { ...members[i], uid: null, email: null, claimedAt: null }
    tx.set(ref, { members }, { merge: true })
    return was
  })
  if (freed) {
    const u = await auth.getUser(freed).catch(() => null)
    if (u?.customClaims?.role === 'organizer' && u.customClaims.boothId === boothId) {
      // Back to a visitor if they had joined as one before, otherwise to no role at all (the app
      // then offers them registration again).
      const uref = db.doc(`users/${freed}`)
      const wasVisitor = !!((await uref.get()).data() as UserDoc | undefined)?.passportNo
      await auth.setCustomUserClaims(freed, wasVisitor ? { role: 'visitor' } : {})
      await uref.set({ role: wasVisitor ? 'visitor' : FieldValue.delete(), boothId: null }, { merge: true })
      const b = await db.doc(`booths/${boothId}`).get()
      if ((b.data() as BoothDoc | undefined)?.organizerUid === freed) await b.ref.set({ organizerUid: null }, { merge: true })
    }
  }
  await audit(actor, 'resetTeamSeat', 'booth', boothId, { name, uid: freed }, null)
  return { ok: true as const }
})
