import type { Job, JobSourceType, SearchProfile } from '@/domain/types'
import { rescoreJob } from '@/services/scoring/matchEngine'
import type { NormalizedJobDraft } from '@/services/parsing/careerScanner'

export function createJobId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
}

export function jobFromDraft(
  draft: NormalizedJobDraft,
  profile: SearchProfile,
  options?: { companyId?: string | null; status?: Job['status'] },
): Job {
  const base: Job = {
    id: createJobId(),
    title: draft.title,
    company: draft.company,
    location: draft.location,
    department: draft.department,
    employmentType: draft.employmentType,
    description: draft.description,
    sourceType: draft.sourceType,
    sourceLabel: draft.sourceLabel,
    sourceUrl: draft.sourceUrl,
    dateFound: new Date().toISOString(),
    datePosted: draft.datePosted,
    score: 0,
    fitSummary: '',
    strengths: [],
    concerns: [],
    status: options?.status ?? 'new',
    notes: '',
    tags: [],
    normalizedKey: draft.normalizedKey,
    companyId: options?.companyId ?? null,
  }
  return rescoreJob(base, profile)
}

export function jobFromManualParts(
  parts: {
    title: string
    company: string
    location: string
    description: string
    sourceType: JobSourceType
    sourceLabel: string
    sourceUrl: string
    normalizedKey: string
  },
  profile: SearchProfile,
): Job {
  return jobFromDraft(
    {
      title: parts.title,
      company: parts.company,
      location: parts.location,
      department: null,
      employmentType: null,
      description: parts.description,
      sourceType: parts.sourceType,
      sourceLabel: parts.sourceLabel,
      sourceUrl: parts.sourceUrl,
      datePosted: null,
      normalizedKey: parts.normalizedKey,
    },
    profile,
  )
}
