/**
 * Adzuna job search API.
 * https://developer.adzuna.com/docs/search
 *
 * Requires server env (free tier at adzuna.com):
 *   ADZUNA_APP_ID
 *   ADZUNA_APP_KEY
 */

import { NormalizedJobDraft, jobDuplicateKey } from '../parsing/careerScanner'

export interface AdzunaSearchConfig {
  /** Keywords (maps to API `what`) */
  what?: string
  /** Location text (maps to API `where`) */
  where?: string
  /** ISO country subdomain: us, gb, de, fr, in, au, ca, … (default us) */
  country?: string
  limit?: number
}

interface AdzunaCompany {
  display_name?: string
}

interface AdzunaLocation {
  display_name?: string | string[]
}

interface AdzunaJob {
  title?: string
  company?: AdzunaCompany | string
  location?: AdzunaLocation
  description?: string
  created?: string
  redirect_url?: string
}

interface AdzunaSearchResponse {
  results?: AdzunaJob[]
  count?: number
}

function locationText(loc: AdzunaLocation | undefined): string {
  if (!loc?.display_name) return 'Unspecified'
  const d = loc.display_name
  return Array.isArray(d) ? d.filter(Boolean).join(', ') : d
}

function companyName(job: AdzunaJob): string {
  const c = job.company
  if (typeof c === 'string') return c || 'Unknown Company'
  return c?.display_name?.trim() || 'Unknown Company'
}

export async function fetchAdzunaJobs(config: AdzunaSearchConfig): Promise<NormalizedJobDraft[]> {
  const appId = process.env.ADZUNA_APP_ID?.trim()
  const appKey = process.env.ADZUNA_APP_KEY?.replace(/\s+/g, '') ?? ''
  if (!appId || !appKey) {
    throw new Error(
      'Adzuna requires ADZUNA_APP_ID and ADZUNA_APP_KEY in backend environment (free keys at developer.adzuna.com).',
    )
  }

  const country = (config.country ?? 'us').toLowerCase().replace(/[^a-z]/g, '') || 'us'
  const page = 1
  const limit = Math.min(Math.max(config.limit ?? 50, 1), 50)

  const params = new URLSearchParams({
    app_id: appId,
    app_key: appKey,
    results_per_page: String(limit),
  })
  if (config.what?.trim()) params.set('what', config.what.trim())
  if (config.where?.trim()) params.set('where', config.where.trim())

  const url = `https://api.adzuna.com/v1/api/jobs/${country}/search/${page}?${params.toString()}`

  let data: AdzunaSearchResponse
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'JobSearchCopilot/1.0 (personal job tracking)' },
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`Adzuna API ${res.status}: ${text.slice(0, 200)}`)
    }
    data = (await res.json()) as AdzunaSearchResponse
  } catch (e) {
    throw new Error(`Adzuna fetch failed: ${e instanceof Error ? e.message : String(e)}`)
  }

  const rows = data.results ?? []
  return rows.map((job): NormalizedJobDraft => {
    const title = job.title?.trim() || 'Untitled'
    const company = companyName(job)
    const location = locationText(job.location)
    const description = (job.description ?? '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 8000)
    const sourceUrl = job.redirect_url?.trim() || `https://www.adzuna.${country}/`
    const datePosted = job.created ?? null

    return {
      title,
      company,
      location,
      department: null,
      employmentType: null,
      description: description || title,
      sourceType: 'job_board_adzuna',
      sourceLabel: 'Adzuna',
      sourceUrl,
      datePosted,
      normalizedKey: jobDuplicateKey(company, title, location),
    }
  })
}
