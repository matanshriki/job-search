/** Workable public jobs API — Node.js compatible */

export interface WorkableJob {
  id: string
  title: string
  full_title?: string
  shortcode?: string
  location?: { location_str?: string; city?: string; country?: string; remote?: boolean }
  department?: string
  employment_type?: string
  url?: string
  application_url?: string
  created_at?: string
}

interface WorkableResponse {
  jobs?: WorkableJob[]
  next_page?: string
}

const WORKABLE_TOKEN_PATTERNS = [
  /apply\.workable\.com\/([^/?#\s"']+)/i,
  /([^/?#\s"'.]+)\.workable\.com/i,
]

export function extractWorkableToken(text: string): string | null {
  // Pattern: apply.workable.com/company-slug
  const applyMatch = text.match(/apply\.workable\.com\/([^/?#\s"']+)/i)
  if (applyMatch?.[1]) return decodeURIComponent(applyMatch[1])

  // Pattern: company.workable.com (subdomain style, older)
  const subdomainMatch = text.match(/(?:^|[^a-z])([a-z0-9-]+)\.workable\.com/i)
  if (subdomainMatch?.[1] && subdomainMatch[1] !== 'apply' && subdomainMatch[1] !== 'www') {
    return decodeURIComponent(subdomainMatch[1])
  }

  return null
}

export function isLikelyWorkablePage(html: string, pageUrl: string): boolean {
  const blob = `${pageUrl} ${html}`.toLowerCase()
  return blob.includes('workable.com') || blob.includes('workable-widget')
}

export async function fetchWorkableJobs(
  token: string,
): Promise<{ ok: true; jobs: WorkableJob[] } | { ok: false; error: string }> {
  // Workable public API endpoint
  const apiUrl = `https://apply.workable.com/api/v3/accounts/${encodeURIComponent(token)}/jobs`
  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; JobSearchBot/1.0)',
      },
      body: JSON.stringify({ query: '', location: [], department: [], worktype: [], remote: [] }),
    })

    if (!res.ok) {
      return { ok: false, error: `Workable API returned ${res.status} for "${token}".` }
    }

    const data = (await res.json()) as WorkableResponse
    if (!Array.isArray(data?.jobs)) {
      return { ok: false, error: `Workable API returned no jobs array for "${token}".` }
    }

    return { ok: true, jobs: data.jobs }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: `Workable fetch failed: ${msg}` }
  }
}

export function workableJobToNormalized(job: WorkableJob, companyName: string) {
  const loc = job.location?.location_str
    ?? [job.location?.city, job.location?.country].filter(Boolean).join(', ')
    ?? (job.location?.remote ? 'Remote' : 'Unspecified')

  return {
    title: job.title,
    company: companyName,
    location: loc || 'Unspecified',
    department: job.department ?? null,
    employmentType: job.employment_type ?? null,
    description: job.title,
    sourceUrl: job.url ?? job.application_url ?? '',
    datePosted: job.created_at ?? null,
  }
}
