/**
 * Best-effort HTML job extraction — Node.js compatible.
 * Uses regex-based parsing instead of DOMParser.
 */

export interface GenericParsedJob {
  title: string
  sourceUrl: string
  locationHint: string | null
}

const JOB_HINT = /career|job|opening|position|role|apply|greenhouse|lever|ashby/i

// US states — reject these as job titles (they're location filter links)
const GEO_TERMS = new Set([
  'alabama', 'alaska', 'arizona', 'arkansas', 'california', 'colorado', 'connecticut',
  'delaware', 'florida', 'georgia', 'hawaii', 'idaho', 'illinois', 'indiana', 'iowa',
  'kansas', 'kentucky', 'louisiana', 'maine', 'maryland', 'massachusetts', 'michigan',
  'minnesota', 'mississippi', 'missouri', 'montana', 'nebraska', 'nevada',
  'new hampshire', 'new jersey', 'new mexico', 'new york', 'north carolina', 'north dakota',
  'ohio', 'oklahoma', 'oregon', 'pennsylvania', 'rhode island', 'south carolina',
  'south dakota', 'tennessee', 'texas', 'utah', 'vermont', 'virginia', 'washington',
  'west virginia', 'wisconsin', 'wyoming', 'district of columbia', 'puerto rico',
  // Common non-state geo terms
  'remote', 'worldwide', 'global', 'europe', 'apac', 'americas', 'latam',
  'usa', 'united states', 'uk', 'united kingdom', 'canada', 'australia',
  'germany', 'france', 'israel', 'india', 'singapore',
  // Generic nav/filter words
  'all', 'all jobs', 'all roles', 'all locations', 'all departments',
  'see all', 'view all', 'apply now', 'apply here', 'learn more',
  'back', 'next', 'previous', 'home', 'careers', 'jobs',
])

// Words that strongly suggest a real job title
const ROLE_WORDS = /\b(engineer|manager|director|head|vp|vice president|analyst|lead|specialist|coordinator|developer|designer|architect|consultant|advisor|executive|officer|president|associate|senior|junior|staff|principal|product|data|sales|marketing|operations|success|service|support|partner|delivery|program|project|account|business|strategy|talent|people|finance|legal|security|devops|qa|research|scientist|recruiter|hr|technical|solutions|implementation|onboarding|enablement|representative|intern)\b/i

// Common non-English nav phrases that appear on career pages with multiple locales
const NON_ENGLISH_NAV = new Set([
  'ontdek carrières', 'découvrir les emplois', 'emplois', 'karriere entdecken',
  'carrières', 'stellenangebote', 'vagas', 'empleos', 'offres d\'emploi',
  'bekijk vacatures', 'vacatures', 'posizioni aperte', 'opportunités',
  'découvrir', 'postuler', 'voir les offres', 'alle stellen',
])

function looksLikeJobTitle(text: string): boolean {
  const lower = text.toLowerCase().trim()

  // Reject known non-English nav phrases
  if (NON_ENGLISH_NAV.has(lower)) return false

  // Reject pure geographic/nav terms
  if (GEO_TERMS.has(lower)) return false

  const words = text.trim().split(/\s+/)

  // Reject non-ASCII-heavy text with no recognizable role keyword.
  // Real English job titles are almost entirely ASCII; nav text in Dutch/French/
  // German/etc. often has accented characters (è, ê, ë, ü, ö, ã, …).
  const nonAscii = (text.match(/[^\x00-\x7F]/g) ?? []).length
  const nonAsciiRatio = nonAscii / text.length
  if (nonAsciiRatio > 0.08 && !ROLE_WORDS.test(text)) return false

  // Reject if it's a single word with no role indicator
  if (words.length === 1 && !ROLE_WORDS.test(text)) return false

  // Must be multi-word OR contain a clear role keyword
  return words.length >= 2 || ROLE_WORDS.test(text)
}

/** Extract <a href="...">text</a> pairs from raw HTML */
function extractAnchors(html: string): Array<{ href: string; text: string; context: string }> {
  const anchors: Array<{ href: string; text: string; context: string }> = []
  const anchorRe = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = anchorRe.exec(html)) !== null) {
    const href = m[1] ?? ''
    const rawText = m[2] ?? ''
    const text = rawText
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    const start = Math.max(0, m.index - 200)
    const end = Math.min(html.length, m.index + m[0].length + 200)
    const context = html.slice(start, end).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
    anchors.push({ href, text, context })
  }
  return anchors
}

function inferLocationFromContext(context: string): string | null {
  const m = context.match(/\b(remote|hybrid|onsite|on-site)[^.|\n]{0,80}/i)
  return m ? m[0].trim() : null
}

function resolveUrl(href: string, baseUrl: string): string | null {
  try {
    return new URL(href, baseUrl).href
  } catch {
    return null
  }
}

/** URLs that look like category/filter pages, not individual job postings */
function looksLikeCategoryUrl(url: string): boolean {
  try {
    const u = new URL(url)
    const path = u.pathname.toLowerCase()
    // Filter out paths that end with just a state/country/region slug
    // Real job pages usually have a numeric ID or a longer specific path
    const segments = path.split('/').filter(Boolean)
    if (segments.length === 0) return true
    const last = segments[segments.length - 1]
    // Reject if last segment is a US state slug
    if (GEO_TERMS.has(last.replace(/-/g, ' '))) return true
    // Reject pure filter/category patterns like /jobs/remote, /careers/texas
    if (segments.length <= 2 && GEO_TERMS.has(last.replace(/-/g, ' '))) return true
  } catch {
    // ignore
  }
  return false
}

export function parseGenericJobListHtml(
  html: string,
  baseUrl: string,
): { jobs: GenericParsedJob[]; warnings: string[] } {
  const warnings: string[] = []
  const anchors = extractAnchors(html)
  const seen = new Set<string>()
  const jobs: GenericParsedJob[] = []

  for (const { href, text, context } of anchors) {
    // Length guard — job titles are typically 5-120 chars
    if (text.length < 5 || text.length > 120) continue
    // Must look like a career link
    if (!JOB_HINT.test(`${text} ${href}`)) continue
    // Must look like a real job title, not a location filter
    if (!looksLikeJobTitle(text)) continue

    const abs = resolveUrl(href, baseUrl)
    if (!abs) continue
    // Skip category/filter URLs
    if (looksLikeCategoryUrl(abs)) continue

    const key = `${text.toLowerCase()}|${abs}`
    if (seen.has(key)) continue
    seen.add(key)

    jobs.push({
      title: text,
      sourceUrl: abs,
      locationHint: inferLocationFromContext(context),
    })
    if (jobs.length >= 80) break
  }

  if (jobs.length === 0) {
    warnings.push(
      'No job links detected with generic heuristics. The page may be JavaScript-rendered, behind auth, or use an unsupported ATS. Try the "Paste HTML" option.',
    )
  } else if (jobs.length >= 80) {
    warnings.push('Capped generic parse at 80 listings to avoid noise.')
  }

  return { jobs, warnings }
}

export function extractPageTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  return m ? m[1].replace(/\s+/g, ' ').trim() : null
}
