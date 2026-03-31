/** Lever public postings API — Node.js compatible */

export interface LeverPosting {
  id: string
  text: string          // job title
  categories: {
    location?: string
    team?: string
    department?: string
    commitment?: string // employment type
  }
  description?: string
  descriptionPlain?: string
  hostedUrl?: string
  applyUrl?: string
  createdAt?: number    // ms timestamp
  updatedAt?: number
}

const LEVER_TOKEN_PATTERNS = [
  /jobs\.lever\.co\/([^/?#\s]+)/i,
  /lever\.co\/([^/?#\s]+)\/jobs/i,
]

export function extractLeverToken(url: string): string | null {
  const u = url.trim()
  for (const re of LEVER_TOKEN_PATTERNS) {
    const m = u.match(re)
    if (m?.[1]) return decodeURIComponent(m[1])
  }
  return null
}

export function isLikelyLeverPage(html: string, pageUrl: string): boolean {
  const blob = `${pageUrl} ${html.slice(0, 8000)}`.toLowerCase()
  return blob.includes('lever.co') || blob.includes('jobs.lever')
}

export async function fetchLeverJobs(
  token: string,
): Promise<{ ok: true; jobs: LeverPosting[] } | { ok: false; error: string }> {
  const apiUrl = `https://api.lever.co/v0/postings/${encodeURIComponent(token)}?mode=json`
  try {
    const res = await fetch(apiUrl, { method: 'GET' })
    if (!res.ok) {
      return {
        ok: false,
        error: `Lever API returned ${res.status} for "${token}".${res.status === 404 ? ' Check the company slug.' : ''}`,
      }
    }
    const data = (await res.json()) as LeverPosting[]
    if (!Array.isArray(data)) {
      return { ok: false, error: 'Lever API response was not an array.' }
    }
    return { ok: true, jobs: data }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: `Lever fetch failed: ${msg}` }
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

export function leverJobToNormalized(job: LeverPosting, companyName: string) {
  const location = job.categories?.location ?? 'Unspecified'
  const department = job.categories?.team ?? job.categories?.department ?? null
  const employmentType = job.categories?.commitment ?? null
  const desc = job.descriptionPlain ?? (job.description ? stripHtml(job.description) : '')
  const postedAt = job.createdAt ? new Date(job.createdAt).toISOString() : null

  return {
    title: job.text,
    company: companyName,
    location: location || 'Unspecified',
    department,
    employmentType,
    description: desc || job.text,
    sourceUrl: job.hostedUrl ?? job.applyUrl ?? '',
    datePosted: postedAt,
  }
}
