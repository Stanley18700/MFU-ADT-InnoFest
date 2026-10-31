/**
 * The ADT InnoFest 2026 booths — the senior projects.
 *
 * EMPTY until the organisers send the booth list (project title, team, description, location).
 * Until then the event is seeded with no booths, and booths can be added by hand in
 * Admin → Booths. When the list arrives, fill this file (or regenerate it with
 * scripts/build-booths.py from the sheet) and re-run the seed: it is idempotent.
 *
 * Ids should be the booth codes printed on the signs (e.g. A-01), so signage, the sheet and
 * Firestore agree. `hostUnit` holds the team members' names, separated by " · ".
 */
import type { BoothCategory, Zone } from './shared/model'

export interface SeedBooth {
  id: string
  nameEn: string
  nameTh: string
  shortName: string
  hostUnit: string
  category: BoothCategory
  location: string
  descriptionEn: string
  accentColor: string
  zone: Zone
  isPrizeDesk: boolean
}

export const SEED_BOOTHS: SeedBooth[] = []
