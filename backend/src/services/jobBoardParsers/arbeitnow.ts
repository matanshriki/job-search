/**
 * Arbeitnow job board parser.
 * Free, unauthenticated public API with strong international tech coverage.
 * API docs: https://www.arbeitnow.com/api
 */

import { NormalizedJobDraft, jobDuplicateKey } from '../parsing/careerScanner'

export interface ArbeitnowSearchConfig {
  search?: string   // keyword filter applied client-side (API has no search param)
  limit?: number
}

interface ArbeitnowJob {
  slug: string
  company_name: string
  title: string
  description: string
  remote: boolean
  url: string
  tags: string[]
  job_types: string[]
  location: string
  created_at: number // unix timestamp
}

interface ArbeitnowResponse {
  data: ArbeitnowJob[]
}

export async function fetchArbeitnowJobs(config: ArbeitnowSearchConfig): Promise<NormalizedJobDraft[]> {
  const res = await fetch('https://arbeitnow.com/api/job-board-api', {
    headers: { 'User-Agent': 'JobSearchCopilot/1.0 (personal job tracking tool)' },
  })
  if (!res.ok) throw new Error(`Arbeitnow API returned ${res.status}`)
  const data = await res.json() as ArbeitnowResponse

  let jobs = data.data ?? []

  // Client-side keyword filter (API has no search param)
  if (config.search?.trim()) {
    const terms = config.search.toLowerCase().split(/\s+/)
    jobs = jobs.filter((job) => {
      const haystack = `${job.title} ${job.company_name} ${job.tags.join(' ')}`.toLowerCase()
      return terms.some((t) => haystack.includes(t))
    })
  }

  if (config.limit) jobs = jobs.slice(0, config.limit)

  return jobs.map((job): NormalizedJobDraft => {
    const location = job.remote ? 'Remote' : (job.location || 'Unspecified')
    const company = job.company_name || 'Unknown Company'
    const title = job.title || 'Untitled'

    const description = job.description
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 8000)

    return {
      title,
      company,
      location,
      department: job.tags[0] || null,
      employmentType: job.job_types[0] || null,
      description,
      sourceType: 'job_board_arbeitnow',
      sourceLabel: 'Arbeitnow',
      sourceUrl: job.url,
      datePosted: job.created_at ? new Date(job.created_at * 1000).toISOString() : null,
      normalizedKey: jobDuplicateKey(company, title, location),
    }
  })
}
