import {
  extractGreenhouseBoardToken,
  fetchGreenhouseJobs,
  greenhouseJobToNormalized,
  isLikelyGreenhousePage,
} from '@/services/parsing/greenhouse'
import { parseGenericJobListHtml } from '@/services/parsing/genericHtml'
import type { JobSourceType } from '@/domain/types'
import { JOB_SOURCE_LABELS } from '@/domain/types'
import { jobDuplicateKey } from '@/lib/utils'

export type ScanMethod = 'greenhouse_api' | 'generic_html' | 'cors_blocked' | 'paste_html'

export interface NormalizedJobDraft {
  title: string
  company: string
  location: string
  department: string | null
  employmentType: string | null
  description: string
  sourceType: JobSourceType
  sourceLabel: string
  sourceUrl: string
  datePosted: string | null
  normalizedKey: string
}

export interface CareerScanResult {
  ok: boolean
  method: ScanMethod
  message: string
  jobs: NormalizedJobDraft[]
  warnings: string[]
}

type CareerPageFetchResult =
  | { ok: true; html: string; finalUrl: string }
  | { ok: false; error: string; corsBlocked: boolean }

/** In `npm run dev`, Vite serves `/__career_fetch` (server-side fetch) to avoid browser CORS. */
async function fetchCareerPageHtmlViaDevProxy(
  url: string,
): Promise<CareerPageFetchResult | null> {
  if (!import.meta.env.DEV) return null
  try {
    const res = await fetch(
      `/__career_fetch?url=${encodeURIComponent(url)}`,
      { method: 'GET', credentials: 'omit' },
    )
    if (!res.ok) {
      return {
        ok: false,
        error: `Dev proxy HTTP ${res.status}.`,
        corsBlocked: false,
      }
    }
    const data = (await res.json()) as {
      ok?: boolean
      html?: string
      finalUrl?: string
      error?: string
    }
    if (data.ok && typeof data.html === 'string') {
      return {
        ok: true,
        html: data.html,
        finalUrl: typeof data.finalUrl === 'string' ? data.finalUrl : url,
      }
    }
    return {
      ok: false,
      error: typeof data.error === 'string' ? data.error : 'Dev proxy fetch failed.',
      corsBlocked: false,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const cause =
      e instanceof Error && e.cause instanceof Error ? ` (${e.cause.message})` : ''
    return {
      ok: false,
      error: `Dev career proxy unreachable or invalid response: ${msg}${cause}`,
      corsBlocked: false,
    }
  }
}

async function fetchCareerPageHtml(url: string): Promise<CareerPageFetchResult> {
  const viaProxy = await fetchCareerPageHtmlViaDevProxy(url)
  if (viaProxy) return viaProxy

  try {
    const res = await fetch(url, {
      method: 'GET',
      mode: 'cors',
      credentials: 'omit',
      redirect: 'follow',
    })
    if (!res.ok) {
      return {
        ok: false,
        error: `HTTP ${res.status} when fetching career page.`,
        corsBlocked: false,
      }
    }
    const html = await res.text()
    return { ok: true, html, finalUrl: res.url || url }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const corsBlocked =
      /network|failed to fetch|cors|load failed/i.test(msg) ||
      msg === 'Failed to fetch'
    return {
      ok: false,
      error: msg,
      corsBlocked,
    }
  }
}

export async function scanCompanyCareerPage(options: {
  careerPageUrl: string
  companyName: string
}): Promise<CareerScanResult> {
  const { careerPageUrl, companyName } = options
  const warnings: string[] = []

  const tokenFromUrl = extractGreenhouseBoardToken(careerPageUrl)
  if (tokenFromUrl) {
    const gh = await fetchGreenhouseJobs(tokenFromUrl)
    if (gh.ok) {
      const jobs: NormalizedJobDraft[] = gh.jobs.map((j) => {
        const n = greenhouseJobToNormalized(j, companyName)
        return {
          ...n,
          sourceType: 'greenhouse',
          sourceLabel: JOB_SOURCE_LABELS.greenhouse,
          sourceUrl: n.sourceUrl || careerPageUrl,
          normalizedKey: jobDuplicateKey(companyName, n.title, n.location || 'Unspecified'),
        }
      })
      return {
        ok: jobs.length > 0,
        method: 'greenhouse_api',
        message:
          jobs.length > 0
            ? `Loaded ${jobs.length} roles from Greenhouse public API.`
            : 'Greenhouse board returned zero jobs.',
        jobs,
        warnings,
      }
    }
    warnings.push(gh.error)
  }

  const fetched = await fetchCareerPageHtml(careerPageUrl)
  if (!fetched.ok) {
    return {
      ok: false,
      method: fetched.corsBlocked ? 'cors_blocked' : 'generic_html',
      jobs: [],
      warnings,
      message: fetched.corsBlocked
        ? `Browser blocked cross-origin fetch (CORS). This is expected for many career sites. Use “Paste HTML” on the Companies page, or add jobs manually. Technical detail: ${fetched.error}`
        : `Could not fetch career page: ${fetched.error}`,
    }
  }

  const { html, finalUrl } = fetched

  if (tokenFromUrl || isLikelyGreenhousePage(html, finalUrl)) {
    const embedded = extractGreenhouseBoardToken(html) ?? tokenFromUrl
    if (embedded) {
      const gh = await fetchGreenhouseJobs(embedded)
      if (gh.ok) {
        const jobs: NormalizedJobDraft[] = gh.jobs.map((j) => {
          const n = greenhouseJobToNormalized(j, companyName)
          return {
            ...n,
            sourceType: 'greenhouse',
            sourceLabel: JOB_SOURCE_LABELS.greenhouse,
            sourceUrl: n.sourceUrl || finalUrl,
            normalizedKey: jobDuplicateKey(companyName, n.title, n.location || 'Unspecified'),
          }
        })
        if (jobs.length > 0) {
          return {
            ok: true,
            method: 'greenhouse_api',
            message: `Detected Greenhouse; loaded ${jobs.length} roles.`,
            jobs,
            warnings,
          }
        }
      } else {
        warnings.push(gh.error)
      }
    } else {
      warnings.push(
        'Page references Greenhouse but no board token could be resolved from the URL or HTML.',
      )
    }
  }

  const generic = parseGenericJobListHtml(html, finalUrl)
  warnings.push(...generic.warnings)

  const jobs: NormalizedJobDraft[] = generic.jobs.map((g) => ({
    title: g.title,
    company: companyName,
    location: g.locationHint ?? 'Unspecified',
    department: null,
    employmentType: null,
    description: g.title,
    sourceType: 'company_career_page',
    sourceLabel: JOB_SOURCE_LABELS.company_career_page,
    sourceUrl: g.sourceUrl,
    datePosted: null,
    normalizedKey: jobDuplicateKey(
      companyName,
      g.title,
      g.locationHint ?? 'Unspecified',
    ),
  }))

  return {
    ok: jobs.length > 0,
    method: 'generic_html',
    message:
      jobs.length > 0
        ? `Parsed approximately ${jobs.length} role links from HTML (heuristic; verify results).`
        : 'Generic HTML parse found no confident job listings.',
    jobs,
    warnings,
  }
}

export async function scanFromPastedHtml(options: {
  html: string
  baseUrl: string
  companyName: string
}): Promise<CareerScanResult> {
  const { html, baseUrl, companyName } = options
  const warnings: string[] = []

  const token =
    extractGreenhouseBoardToken(html) || extractGreenhouseBoardToken(baseUrl)
  if (token) {
    const gh = await fetchGreenhouseJobs(token)
    if (gh.ok) {
      const jobs: NormalizedJobDraft[] = gh.jobs.map((j) => {
        const n = greenhouseJobToNormalized(j, companyName)
        return {
          ...n,
          sourceType: 'greenhouse',
          sourceLabel: JOB_SOURCE_LABELS.greenhouse,
          sourceUrl: n.sourceUrl || baseUrl,
          normalizedKey: jobDuplicateKey(companyName, n.title, n.location || 'Unspecified'),
        }
      })
      return {
        ok: jobs.length > 0,
        method: 'paste_html',
        message:
          jobs.length > 0
            ? `Resolved Greenhouse board from pasted content; loaded ${jobs.length} roles.`
            : 'Greenhouse board returned zero jobs.',
        jobs,
        warnings,
      }
    }
    warnings.push(gh.error)
  }

  const generic = parseGenericJobListHtml(html, baseUrl)
  warnings.push(...generic.warnings)
  const jobs: NormalizedJobDraft[] = generic.jobs.map((g) => ({
    title: g.title,
    company: companyName,
    location: g.locationHint ?? 'Unspecified',
    department: null,
    employmentType: null,
    description: g.title,
    sourceType: 'company_career_page',
    sourceLabel: JOB_SOURCE_LABELS.company_career_page,
    sourceUrl: g.sourceUrl,
    datePosted: null,
    normalizedKey: jobDuplicateKey(
      companyName,
      g.title,
      g.locationHint ?? 'Unspecified',
    ),
  }))

  return {
    ok: jobs.length > 0,
    method: 'paste_html',
    message:
      jobs.length > 0
        ? `Imported ${jobs.length} listings from pasted HTML.`
        : 'Could not extract listings from pasted HTML.',
    jobs,
    warnings,
  }
}
