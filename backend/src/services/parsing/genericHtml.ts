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

/** Extract <a href="...">text</a> pairs from raw HTML */
function extractAnchors(html: string): Array<{ href: string; text: string; context: string }> {
  const anchors: Array<{ href: string; text: string; context: string }> = []
  // Match <a ...> ... </a> including multiline
  const anchorRe = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = anchorRe.exec(html)) !== null) {
    const href = m[1] ?? ''
    const rawText = m[2] ?? ''
    // Strip inner HTML tags to get plain text
    const text = rawText
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
    // Grab some context around the anchor for location inference
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

export function parseGenericJobListHtml(
  html: string,
  baseUrl: string,
): { jobs: GenericParsedJob[]; warnings: string[] } {
  const warnings: string[] = []
  const anchors = extractAnchors(html)
  const seen = new Set<string>()
  const jobs: GenericParsedJob[] = []

  for (const { href, text, context } of anchors) {
    if (text.length < 4 || text.length > 180) continue
    if (!JOB_HINT.test(`${text} ${href}`)) continue

    const abs = resolveUrl(href, baseUrl)
    if (!abs) continue

    const key = `${text}|${abs}`
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
      'No job links detected with generic heuristics. The page may be JavaScript-rendered, behind auth, or use an unsupported structure.',
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
