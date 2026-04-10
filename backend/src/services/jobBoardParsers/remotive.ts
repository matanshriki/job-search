/**
 * Remotive job board parser.
 * Fetches from the free, unauthenticated Remotive public API and maps
 * results to the shared NormalizedJobDraft interface used by careerScanner.
 *
 * API docs: https://remotive.com/api/remote-jobs
 */

import { NormalizedJobDraft, jobDuplicateKey } from '../parsing/careerScanner'

export interface RemotiveSearchConfig {
  search?: string      // keywords (titles, tech, etc.)
  category?: string    // e.g. "software-dev", "data", "devops"
  limit?: number       // max results (default 50)
}

interface RemotiveJob {
  id: number
  url: string
  title: string
  company_name: string
  company_logo?: string
  category: string
  job_type: string
  publication_date: string
  candidate_required_location: string
  salary?: string
  description: string
  tags?: string[]
}

interface RemotiveResponse {
  'job-count': number
  jobs: RemotiveJob[]
}

export async function fetchRemotiveJobs(config: RemotiveSearchConfig): Promise<NormalizedJobDraft[]> {
  const params = new URLSearchParams()
  if (config.search) params.set('search', config.search)
  if (config.category) params.set('category', config.category)
  if (config.limit) params.set('limit', String(config.limit))

  const url = `https://remotive.com/api/remote-jobs?${params.toString()}`

  let data: RemotiveResponse
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'JobSearchCopilot/1.0 (personal job tracking tool)' },
    })
    if (!res.ok) throw new Error(`Remotive API returned ${res.status}`)
    data = await res.json() as RemotiveResponse
  } catch (err) {
    throw new Error(`Remotive fetch failed: ${err instanceof Error ? err.message : String(err)}`)
  }

  return (data.jobs ?? []).map((job): NormalizedJobDraft => {
    const location = job.candidate_required_location || 'Remote'
    const company = job.company_name || 'Unknown Company'
    const title = job.title || 'Untitled'

    // Strip HTML tags from description (Remotive descriptions are HTML)
    const description = job.description
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 8000)

    return {
      title,
      company,
      location,
      department: job.category || null,
      employmentType: job.job_type || null,
      description,
      sourceType: 'job_board_remotive',
      sourceLabel: 'Remotive',
      sourceUrl: job.url,
      datePosted: job.publication_date || null,
      normalizedKey: jobDuplicateKey(company, title, location),
    }
  })
}
