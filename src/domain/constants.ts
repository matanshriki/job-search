import type { JobStatus, JobsFeedPersistedState } from './types'

export const STORAGE_KEY = 'job-search-command-center-v1'

/**
 * Jobs at or below this are “low fit” for your saved profile.
 * Used for dashboard stats, job feed default min score, and top matches.
 */
export const MIN_RELEVANT_MATCH_SCORE = 55

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  new: 'New',
  saved: 'Saved',
  considering: 'Considering',
  applied: 'Applied',
  interviewing: 'Interview scheduled',
  rejected: 'Rejected',
  archived: 'Archived',
}

export const JOB_STATUS_ORDER: JobStatus[] = [
  'new',
  'saved',
  'considering',
  'applied',
  'interviewing',
  'rejected',
  'archived',
]

export const COMPANY_PRIORITY_LABEL = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
} as const

export const DEFAULT_JOBS_FEED: JobsFeedPersistedState = {
  q: '',
  source: 'all',
  status: 'all',
  company: '',
  location: '',
  minScore: String(MIN_RELEVANT_MATCH_SCORE),
  sort: 'score',
  hideOutsideProfileGeos: true,
  activeViewId: null,
}

export const SENIORITY_LABELS: Record<string, string> = {
  intern: 'Intern',
  junior: 'Junior',
  mid: 'Mid',
  senior: 'Senior',
  staff: 'Staff',
  principal: 'Principal',
  director: 'Director',
  executive: 'Executive',
}
