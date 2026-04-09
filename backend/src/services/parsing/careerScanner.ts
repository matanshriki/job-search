/**
 * Career page scanner — Node.js server-side version.
 * No browser dependencies; uses native fetch (Node 18+).
 */

import { extractGreenhouseBoardToken, fetchGreenhouseJobs, greenhouseJobToNormalized, isLikelyGreenhousePage } from './greenhouse'
import { extractLeverToken, fetchLeverJobs, leverJobToNormalized, isLikelyLeverPage } from './lever'
import { extractAshbyToken, fetchAshbyJobs, ashbyJobToNormalized, isLikelyAshbyPage } from './ashby'
import { extractWorkableToken, fetchWorkableJobs, workableJobToNormalized, isLikelyWorkablePage } from './workable'
import { parseGenericJobListHtml } from './genericHtml'

export type ScanMethod = 'greenhouse_api' | 'lever_api' | 'ashby_api' | 'workable_api' | 'generic_html' | 'cors_blocked' | 'paste_html' | 'manual'

export interface NormalizedJobDraft {
  title: string
  company: string
  location: string
  department: string | null
  employmentType: string | null
  description: string
  sourceType: string
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

export function jobDuplicateKey(company: string, title: string, location: string): string {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
  return `${norm(company)}|${norm(title)}|${norm(location)}`
}

/** Fetch HTML of a career page server-side (no CORS restrictions) */
async function fetchCareerPageHtml(
  url: string,
): Promise<{ ok: true; html: string; finalUrl: string } | { ok: false; error: string }> {
  const https = url.startsWith('https')
  const agentOptions: Record<string, unknown> = {}

  if (https && process.env.JOB_SEARCH_ALLOW_INSECURE_TLS === '1') {
    // Import node:https only when needed
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { Agent } = require('node:https') as typeof import('node:https')
    agentOptions.agent = new Agent({ rejectUnauthorized: false })
  }

  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; JobSearchBot/1.0)',
        'Accept': 'text/html,application/xhtml+xml,*/*',
      },
      ...agentOptions,
    })

    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status} when fetching career page.` }
    }

    const html = await res.text()
    return { ok: true, html, finalUrl: res.url || url }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return { ok: false, error: msg }
  }
}

/** Build candidate fallback URLs from a company domain */
function buildFallbackUrls(companyDomain: string): string[] {
  const domain = companyDomain.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')
  if (!domain) return []
  return [
    `https://${domain}/careers`,
    `https://${domain}/jobs`,
    `https://www.${domain}/careers`,
    `https://www.${domain}/jobs`,
  ]
}

export async function scanCompanyCareerPage(options: {
  careerPageUrl: string
  companyName: string
  companyDomain?: string
}): Promise<CareerScanResult> {
  const { careerPageUrl, companyName, companyDomain } = options
  const warnings: string[] = []

  // 1. Try Greenhouse API (token in URL)
  const tokenFromUrl = extractGreenhouseBoardToken(careerPageUrl)
  if (tokenFromUrl) {
    const gh = await fetchGreenhouseJobs(tokenFromUrl)
    if (gh.ok) {
      const jobs: NormalizedJobDraft[] = gh.jobs.map((j) => {
        const n = greenhouseJobToNormalized(j, companyName)
        return {
          ...n,
          sourceType: 'greenhouse',
          sourceLabel: 'Greenhouse',
          sourceUrl: n.sourceUrl || careerPageUrl,
          normalizedKey: jobDuplicateKey(companyName, n.title, n.location || 'Unspecified'),
        }
      })
      return {
        ok: true,
        method: 'greenhouse_api',
        message: jobs.length > 0
          ? `Loaded ${jobs.length} roles from Greenhouse public API.`
          : 'Greenhouse board returned zero open roles.',
        jobs,
        warnings,
      }
    }
    warnings.push(gh.error)
  }

  // 2. Try Lever API (token in URL)
  const leverTokenFromUrl = extractLeverToken(careerPageUrl)
  if (leverTokenFromUrl) {
    const lv = await fetchLeverJobs(leverTokenFromUrl)
    if (lv.ok) {
      const jobs: NormalizedJobDraft[] = lv.jobs.map((j) => {
        const n = leverJobToNormalized(j, companyName)
        return {
          ...n,
          sourceType: 'lever',
          sourceLabel: 'Lever',
          sourceUrl: n.sourceUrl || careerPageUrl,
          normalizedKey: jobDuplicateKey(companyName, n.title, n.location || 'Unspecified'),
        }
      })
      return {
        ok: true,
        method: 'lever_api',
        message: jobs.length > 0
          ? `Loaded ${jobs.length} roles from Lever public API.`
          : 'Lever board returned zero open roles.',
        jobs,
        warnings,
      }
    }
    warnings.push(lv.error)
  }

  // 3. Try Ashby API (token in URL)
  const ashbyTokenFromUrl = extractAshbyToken(careerPageUrl)
  if (ashbyTokenFromUrl) {
    const ab = await fetchAshbyJobs(ashbyTokenFromUrl)
    if (ab.ok) {
      const jobs: NormalizedJobDraft[] = ab.jobs.map((j) => {
        const n = ashbyJobToNormalized(j, companyName)
        return {
          ...n,
          sourceType: 'ashby',
          sourceLabel: 'Ashby',
          sourceUrl: n.sourceUrl || careerPageUrl,
          normalizedKey: jobDuplicateKey(companyName, n.title, n.location || 'Unspecified'),
        }
      })
      return {
        ok: true,
        method: 'ashby_api',
        message: jobs.length > 0
          ? `Loaded ${jobs.length} roles from Ashby public API.`
          : 'Ashby board returned zero open roles.',
        jobs,
        warnings,
      }
    }
    warnings.push(ab.error)
  }

  // 4. Try Workable API (token in URL)
  const workableTokenFromUrl = extractWorkableToken(careerPageUrl)
  if (workableTokenFromUrl) {
    const wk = await fetchWorkableJobs(workableTokenFromUrl)
    if (wk.ok) {
      const jobs: NormalizedJobDraft[] = wk.jobs.map((j) => {
        const n = workableJobToNormalized(j, companyName)
        return {
          ...n,
          sourceType: 'workable',
          sourceLabel: 'Workable',
          sourceUrl: n.sourceUrl || careerPageUrl,
          normalizedKey: jobDuplicateKey(companyName, n.title, n.location || 'Unspecified'),
        }
      })
      return {
        ok: true,
        method: 'workable_api',
        message: jobs.length > 0
          ? `Loaded ${jobs.length} roles from Workable public API.`
          : 'Workable board returned zero open roles.',
        jobs,
        warnings,
      }
    }
    warnings.push(wk.error)
  }

  // 5. Fetch HTML (server-side, no CORS issue)
  let fetched = await fetchCareerPageHtml(careerPageUrl)

  // 5a. If the configured URL failed and it looks like a boards.greenhouse.io URL
  //     (i.e. a wrong/guessed board token), fall back to the company's real domain.
  if (!fetched.ok && tokenFromUrl && companyDomain) {
    warnings.push(`Career page URL failed (${fetched.error}). Trying company domain as fallback.`)
    for (const fallback of buildFallbackUrls(companyDomain)) {
      const attempt = await fetchCareerPageHtml(fallback)
      if (attempt.ok) {
        fetched = attempt
        break
      }
    }
  }

  if (!fetched.ok) {
    return {
      ok: false,
      method: 'generic_html',
      jobs: [],
      warnings,
      message: `Could not fetch career page: ${fetched.error}`,
    }
  }

  const { html, finalUrl } = fetched

  // 5b. Check if fetched HTML is Greenhouse
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
            sourceLabel: 'Greenhouse',
            sourceUrl: n.sourceUrl || finalUrl,
            normalizedKey: jobDuplicateKey(companyName, n.title, n.location || 'Unspecified'),
          }
        })
        return {
          ok: true,
          method: 'greenhouse_api',
          message: jobs.length > 0
            ? `Detected Greenhouse; loaded ${jobs.length} roles.`
            : 'Greenhouse board detected but returned zero open roles.',
          jobs,
          warnings,
        }
      } else {
        warnings.push(gh.error)
      }
    }
  }

  // 6. Check if fetched HTML is Lever
  if (leverTokenFromUrl || isLikelyLeverPage(html, finalUrl)) {
    const embedded = extractLeverToken(html) ?? leverTokenFromUrl
    if (embedded) {
      const lv = await fetchLeverJobs(embedded)
      if (lv.ok) {
        const jobs: NormalizedJobDraft[] = lv.jobs.map((j) => {
          const n = leverJobToNormalized(j, companyName)
          return {
            ...n,
            sourceType: 'lever',
            sourceLabel: 'Lever',
            sourceUrl: n.sourceUrl || finalUrl,
            normalizedKey: jobDuplicateKey(companyName, n.title, n.location || 'Unspecified'),
          }
        })
        return {
          ok: true,
          method: 'lever_api',
          message: jobs.length > 0
            ? `Detected Lever; loaded ${jobs.length} roles.`
            : 'Lever board detected but returned zero open roles.',
          jobs,
          warnings,
        }
      }
    }
  }

  // 7. Check if fetched HTML is Ashby
  if (ashbyTokenFromUrl || isLikelyAshbyPage(html, finalUrl)) {
    const embedded = extractAshbyToken(html) ?? ashbyTokenFromUrl
    if (embedded) {
      const ab = await fetchAshbyJobs(embedded)
      if (ab.ok) {
        const jobs: NormalizedJobDraft[] = ab.jobs.map((j) => {
          const n = ashbyJobToNormalized(j, companyName)
          return {
            ...n,
            sourceType: 'ashby',
            sourceLabel: 'Ashby',
            sourceUrl: n.sourceUrl || finalUrl,
            normalizedKey: jobDuplicateKey(companyName, n.title, n.location || 'Unspecified'),
          }
        })
        return {
          ok: true,
          method: 'ashby_api',
          message: jobs.length > 0
            ? `Detected Ashby; loaded ${jobs.length} roles.`
            : 'Ashby board detected but returned zero open roles.',
          jobs,
          warnings,
        }
      } else {
        warnings.push(ab.error)
      }
    }
  }

  // 8. Check if fetched HTML is Workable
  if (workableTokenFromUrl || isLikelyWorkablePage(html, finalUrl)) {
    const embedded = extractWorkableToken(html) ?? workableTokenFromUrl
    if (embedded) {
      const wk = await fetchWorkableJobs(embedded)
      if (wk.ok) {
        const jobs: NormalizedJobDraft[] = wk.jobs.map((j) => {
          const n = workableJobToNormalized(j, companyName)
          return {
            ...n,
            sourceType: 'workable',
            sourceLabel: 'Workable',
            sourceUrl: n.sourceUrl || finalUrl,
            normalizedKey: jobDuplicateKey(companyName, n.title, n.location || 'Unspecified'),
          }
        })
        return {
          ok: true,
          method: 'workable_api',
          message: jobs.length > 0
            ? `Detected Workable; loaded ${jobs.length} roles.`
            : 'Workable board detected but returned zero open roles.',
          jobs,
          warnings,
        }
      } else {
        warnings.push(wk.error)
      }
    }
  }

  // 9. Generic HTML parse (fallback)
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
    sourceLabel: 'Company Career Page',
    sourceUrl: g.sourceUrl,
    datePosted: null,
    normalizedKey: jobDuplicateKey(companyName, g.title, g.locationHint ?? 'Unspecified'),
  }))

  return {
    ok: true,
    method: 'generic_html',
    message: jobs.length > 0
      ? `Parsed approximately ${jobs.length} role links from HTML (heuristic; verify results).`
      : 'No job listings found in static HTML — the page may be JavaScript-rendered. Try "Paste HTML" instead: open the careers page in your browser, copy the full page HTML, and paste it here.',
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

  const token = extractGreenhouseBoardToken(html) || extractGreenhouseBoardToken(baseUrl)
  if (token) {
    const gh = await fetchGreenhouseJobs(token)
    if (gh.ok) {
      const jobs: NormalizedJobDraft[] = gh.jobs.map((j) => {
        const n = greenhouseJobToNormalized(j, companyName)
        return {
          ...n,
          sourceType: 'greenhouse',
          sourceLabel: 'Greenhouse',
          sourceUrl: n.sourceUrl || baseUrl,
          normalizedKey: jobDuplicateKey(companyName, n.title, n.location || 'Unspecified'),
        }
      })
      return {
        ok: true,
        method: 'paste_html',
        message: jobs.length > 0
          ? `Resolved Greenhouse board from pasted content; loaded ${jobs.length} roles.`
          : 'Greenhouse board returned zero open roles.',
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
    sourceLabel: 'Company Career Page',
    sourceUrl: g.sourceUrl,
    datePosted: null,
    normalizedKey: jobDuplicateKey(companyName, g.title, g.locationHint ?? 'Unspecified'),
  }))

  return {
    ok: true,
    method: 'paste_html',
    message: jobs.length > 0
      ? `Imported ${jobs.length} listings from pasted HTML.`
      : 'Could not extract job listings from the pasted HTML. Make sure to paste the full rendered page source (not a partial snippet).',
    jobs,
    warnings,
  }
}
