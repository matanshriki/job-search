export type JobStatus =
  | 'new'
  | 'saved'
  | 'considering'
  | 'applied'
  | 'interviewing'
  | 'rejected'
  | 'archived'

export type JobSourceType =
  | 'company_career_page'
  | 'greenhouse'
  | 'linkedin_manual'
  | 'referral'
  | 'recruiter'
  | 'manual_entry'

export const JOB_SOURCE_LABELS: Record<JobSourceType, string> = {
  company_career_page: 'Company Career Page',
  greenhouse: 'Greenhouse',
  linkedin_manual: 'LinkedIn Manual',
  referral: 'Referral',
  recruiter: 'Recruiter',
  manual_entry: 'Manual Entry',
}

export type CompanyPriority = 'high' | 'medium' | 'low'

export interface Job {
  id: string
  title: string
  company: string
  location: string
  department: string | null
  employmentType: string | null
  description: string
  sourceType: JobSourceType
  sourceLabel: string
  sourceUrl: string
  dateFound: string
  datePosted: string | null
  score: number
  fitSummary: string
  strengths: string[]
  concerns: string[]
  status: JobStatus
  notes: string
  tags: string[]
  /** Dedup key: normalized company + title + location */
  normalizedKey?: string
  companyId?: string | null
  insightSnippet?: string
  redFlags?: string[]
}

export interface TrackedCompany {
  id: string
  name: string
  website: string
  careerPageUrl: string
  notes: string
  priority: CompanyPriority
  lastScanAt: string | null
  jobsFoundCount: number
  createdAt: string
}

export type SeniorityLevel =
  | 'intern'
  | 'junior'
  | 'mid'
  | 'senior'
  | 'staff'
  | 'principal'
  | 'director'
  | 'executive'

export interface SearchProfile {
  targetTitles: string[]
  excludedTitles: string[]
  targetSeniority: SeniorityLevel[]
  preferredFunctions: string[]
  preferredIndustries: string[]
  preferredGeographies: string[]
  remotePreference: 'remote_first' | 'hybrid_ok' | 'onsite_ok' | 'flexible'
  idealCompanyStage: string[]
  keywordsBoost: string[]
  keywordsPenalize: string[]
  compensationNotes: string
  personalSummary: string
}

export interface ScoreWeights {
  title: number
  seniority: number
  domain: number
  location: number
  keyword: number
  strategic: number
}

export interface ScoreBreakdown {
  titleFit: number
  seniorityFit: number
  domainFit: number
  locationFit: number
  keywordFit: number
  strategicFit: number
  weights: ScoreWeights
}

export interface ScanRecord {
  id: string
  companyId: string
  companyName: string
  at: string
  outcome: 'success' | 'partial' | 'failed'
  message: string
  jobsFound: number
  method: 'greenhouse_api' | 'generic_html' | 'cors_blocked' | 'paste_html'
}

export type JobsFeedSort = 'score' | 'dateFound' | 'datePosted'

export interface JobsFeedPersistedState {
  q: string
  source: string
  status: string
  company: string
  location: string
  minScore: string
  sort: JobsFeedSort
  /** When true, hide jobs that do not mention any Profile “preferred geography” term */
  hideOutsideProfileGeos: boolean
  /** Currently selected saved view, or null for ad-hoc filters */
  activeViewId: string | null
}

export interface SavedJobsView {
  id: string
  name: string
  q: string
  source: string
  status: string
  company: string
  location: string
  minScore: string
  sort: JobsFeedSort
  hideOutsideProfileGeos: boolean
}

export interface AppData {
  version: number
  profile: SearchProfile
  companies: TrackedCompany[]
  jobs: Job[]
  scanHistory: ScanRecord[]
  /** Persisted jobs feed filters (local-first) */
  jobsFeed?: JobsFeedPersistedState
  /** Named filter presets */
  savedJobViews?: SavedJobsView[]
}

export const DEFAULT_PROFILE: SearchProfile = {
  targetTitles: [
    'Head of Professional Services',
    'Head of Delivery',
    'Professional Services Leadership',
    'Partner Operations',
    'Customer Success',
    'Services Strategy',
    'AI leadership',
    'Ops leadership',
    'Program leadership',
  ],
  excludedTitles: [],
  targetSeniority: ['senior', 'staff', 'principal', 'director', 'executive'],
  preferredFunctions: [
    'professional services',
    'platform',
    'operation',
    'saas',
    'b2b',
    'scale',
    'partners',
  ],
  preferredIndustries: [
    'b2b saas',
    'enterprise software',
    'fintech',
    'developer tools',
  ],
  preferredGeographies: ['Israel'],
  remotePreference: 'flexible',
  idealCompanyStage: [
    'Series B',
    'Series C',
    'Series D',
    'Growth',
    'Public',
    'Late stage',
  ],
  keywordsBoost: [],
  keywordsPenalize: [],
  compensationNotes: '',
  personalSummary: '',
}

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  title: 25,
  seniority: 15,
  domain: 20,
  location: 15,
  keyword: 15,
  strategic: 10,
}
