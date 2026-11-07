import { doc } from 'firebase/firestore'
import { db } from './firebase'
import { useAuth } from './auth'
import { useDoc } from './data'
import { EVENT_SURVEY_ID, surveyGates, type SurveyDoc } from '../../shared/model'

/**
 * The festival survey as it concerns the visitor holding the phone: is it published, how long
 * is it, and have they already answered.
 *
 * Read in one place because three screens now depend on the same two facts and must never
 * disagree — the Prize page (which withholds the gift QR until the answers are in), the nudge
 * sheet in the passport layout, and the banner on the cover. `surveys/{EVENT_SURVEY_ID}` is
 * readable by any signed-in visitor; `surveyTaken/{uid}_{id}` only by its owner and admins.
 *
 * `loading` matters to the gate: until both documents have answered, the Prize page must not
 * decide either way, or the QR would flash for a moment before the survey card replaced it.
 */
export function useFestivalSurvey(enabled = true) {
  const { user } = useAuth()
  const survey = useDoc<SurveyDoc>(enabled ? doc(db, 'surveys', EVENT_SURVEY_ID) : null, [enabled])
  const taken = useDoc(user && enabled ? doc(db, 'surveyTaken', `${user.uid}_${EVENT_SURVEY_ID}`) : null, [user?.uid, enabled])
  const count = survey.data?.questions?.length ?? 0
  return {
    survey: survey.data,
    count,
    /** Published with at least one question — the only state in which a visitor is asked. */
    live: !!survey.data?.active && count > 0,
    /**
     * Whether an unanswered survey withholds every reward: agent photo, prizes, MFU333. On while
     * the survey is published, unless an admin lifted it (`gateGift: false`). See `surveyGates`.
     */
    gate: surveyGates(survey.data),
    taken: !!taken.data,
    /** Rewards are sealed until the survey is answered. */
    owed: surveyGates(survey.data) && !taken.data,
    loading: survey.loading || (!!user && enabled && taken.loading),
  }
}
