import type { TrackedCompany } from '@/domain/types'

/** Returns an empty list — users add their own target companies via the UI. */
export function buildDefaultTrackedCompanies(): TrackedCompany[] {
  return []
}
