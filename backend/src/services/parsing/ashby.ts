/** Ashby public job board GraphQL API — Node.js compatible */

export interface AshbyJobPosting {
  id: string
  title: string
  locationName?: string
  departmentName?: string
  employmentType?: string
  jobUrl?: string
  publishedDate?: string
  isListed?: boolean
}

interface AshbyApiResponse {
  data?: {
    jobBoard?: {
      jobPostings?: AshbyJobPosting[]
    }
  }
}

const ASHBY_TOKEN_PATTERNS = [
  /jobs\.ashbyhq\.com\/([^/?#\s"']+)/i,
  /ashbyhq\.com\/([^/?#\s"']+)/i,
]

export function extractAshbyToken(text: string): string | null {
  for (const re of ASHBY_TOKEN_PATTERNS) {
    const m = text.match(re)
    // Skip tokens that look like API paths (non-user-graphql, api, etc.)
    if (m?.[1] && !m[1].startsWith('api') && !m[1].includes('graphql')) {
      return decodeURIComponent(m[1])
    }
  }
  return null
}

export function isLikelyAshbyPage(html: string, pageUrl: string): boolean {
  const blob = `${pageUrl} ${html}`.toLowerCase()
  return blob.includes('ashbyhq.com') || blob.includes('ashby-job-posting')
}

const ASHBY_GQL_QUERY = `
  query ApiJobBoardWithTeams($organizationHostedJobsPageName: String!) {
    jobBoard: jobBoardWithTeams(organizationHostedJobsPageName: $organizationHostedJobsPageName) {
      jobPostings {
        id
        title
        locationName
        departmentName
        employmentType
        jobUrl
        publishedDate
        isListed
      }
    }
  }
`.trim()

export async function fetchAshbyJobs(
  token: string,
): Promise<{ ok: true; jobs: AshbyJobPosting[] } | { ok: false; error: string }> {
  try {
    const res = await fetch('https://jobs.ashbyhq.com/api/non-user-graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (compatible; JobSearchBot/1.0)',
      },
      body: JSON.stringify({
        operationName: 'ApiJobBoardWithTeams',
        variables: { organizationHostedJobsPageName: token },
        query: ASHBY_GQL_QUERY,
      }),
    })

    if (!res.ok) {
      return { ok: false, error: `Ashby API returned ${res.status} for "${token}".` }
    }

    const data = (await res.json()) as AshbyApiResponse
    const postings = data?.data?.jobBoard?.jobPostings

    if (!Array.isArray(postings)) {
      return { ok: false, error: `Ashby API returned no postings array for "${token}".` }
    }

    // Filter to only listed/active jobs
    const listed = postings.filter((j) => j.isListed !== false)
    return { ok: true, jobs: listed }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: `Ashby fetch failed: ${msg}` }
  }
}

export function ashbyJobToNormalized(job: AshbyJobPosting, companyName: string) {
  return {
    title: job.title,
    company: companyName,
    location: job.locationName || 'Unspecified',
    department: job.departmentName ?? null,
    employmentType: job.employmentType ?? null,
    description: job.title,
    sourceUrl: job.jobUrl ?? '',
    datePosted: job.publishedDate ?? null,
  }
}
