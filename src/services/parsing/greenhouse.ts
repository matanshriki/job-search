/**
 * Greenhouse public board API — often callable from the browser (CORS permitting).
 * Docs pattern: GET https://boards-api.greenhouse.io/v1/boards/{board_token}/jobs
 */

export interface GreenhouseJob {
  id: number
  title: string
  location?: { name?: string }
  updated_at?: string
  first_published?: string
  absolute_url?: string
  content?: string
  departments?: { name?: string }[]
  metadata?: { name?: string; value?: string | null }[]
}

export interface GreenhouseBoardResponse {
  jobs: GreenhouseJob[]
}

const GH_TOKEN_PATTERNS = [
  /boards\.greenhouse\.io\/([^/?.#]+)/i,
  /job-boards\.greenhouse\.io\/([^/?.#]+)/i,
  /greenhouse\.io\/embed\/job_board\/\?for=([^&]+)/i,
  /boards-api\.greenhouse\.io\/v1\/boards\/([^/?.#]+)/i,
]

export function extractGreenhouseBoardToken(url: string): string | null {
  const u = url.trim()
  for (const re of GH_TOKEN_PATTERNS) {
    const m = u.match(re)
    if (m?.[1]) return decodeURIComponent(m[1])
  }
  return null
}

export function isLikelyGreenhousePage(html: string, pageUrl: string): boolean {
  const blob = `${pageUrl} ${html.slice(0, 8000)}`.toLowerCase()
  return (
    blob.includes('greenhouse') ||
    blob.includes('boards.greenhouse.io') ||
    blob.includes('job-boards.greenhouse.io')
  )
}

export async function fetchGreenhouseJobs(
  boardToken: string,
): Promise<{ ok: true; jobs: GreenhouseJob[] } | { ok: false; error: string }> {
  const apiUrl = `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(boardToken)}/jobs`
  try {
    const res = await fetch(apiUrl, { method: 'GET' })
    if (!res.ok) {
      const notFoundHint =
        res.status === 404
          ? ` The slug "${boardToken}" is not a valid board (404). Use the segment after boards.greenhouse.io/ or job-boards.greenhouse.io/ from the company’s real job page — demo placeholders like "vertexscaleexample" will always fail.`
          : ''
      return {
        ok: false,
        error: `Greenhouse API returned ${res.status} for board "${boardToken}".${notFoundHint}`,
      }
    }
    const data = (await res.json()) as GreenhouseBoardResponse
    if (!data || !Array.isArray(data.jobs)) {
      return { ok: false, error: 'Greenhouse API response missing jobs array.' }
    }
    return { ok: true, jobs: data.jobs }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return {
      ok: false,
      error: `Greenhouse fetch failed: ${msg}`,
    }
  }
}

export function greenhouseJobToNormalized(job: GreenhouseJob, companyName: string) {
  const loc = job.location?.name ?? ''
  const dept = job.departments?.[0]?.name ?? null
  const employment =
    job.metadata?.find((m) => (m.name ?? '').toLowerCase().includes('employment'))?.value ??
    null
  const desc = job.content ? stripHtmlToText(job.content) : ''
  const posted = job.first_published ?? job.updated_at ?? null
  return {
    title: job.title,
    company: companyName,
    location: loc || 'Unspecified',
    department: dept,
    employmentType: employment,
    description: desc || job.title,
    sourceUrl: job.absolute_url ?? '',
    datePosted: posted,
  }
}

function stripHtmlToText(html: string): string {
  if (typeof DOMParser === 'undefined') return html.replace(/<[^>]+>/g, ' ')
  const doc = new DOMParser().parseFromString(html, 'text/html')
  return doc.body?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}
