/**
 * Best-effort HTML job extraction. Fragile by nature; failures should surface to the user.
 */

export interface GenericParsedJob {
  title: string
  sourceUrl: string
  locationHint: string | null
}

const JOB_HINT = /career|job|opening|position|role|apply|greenhouse|lever|ashby/i

export function parseGenericJobListHtml(
  html: string,
  baseUrl: string,
): { jobs: GenericParsedJob[]; warnings: string[] } {
  const warnings: string[] = []
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const anchors = Array.from(doc.querySelectorAll('a[href]'))
  const seen = new Set<string>()
  const jobs: GenericParsedJob[] = []

  for (const a of anchors) {
    const text = (a.textContent ?? '').replace(/\s+/g, ' ').trim()
    const href = a.getAttribute('href') ?? ''
    if (text.length < 4 || text.length > 180) continue
    if (!JOB_HINT.test(`${text} ${href}`)) continue

    let abs = ''
    try {
      abs = new URL(href, baseUrl).href
    } catch {
      continue
    }

    const key = `${text}|${abs}`
    if (seen.has(key)) continue
    seen.add(key)

    jobs.push({
      title: text,
      sourceUrl: abs,
      locationHint: inferLocationFromContext(a),
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

function inferLocationFromContext(el: Element): string | null {
  const parent = el.closest('li, article, tr, div')
  if (!parent) return null
  const t = (parent.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 400)
  const m = t.match(
    /\b(remote|hybrid|onsite|on-site)[^.|\n]{0,80}/i,
  )
  if (m) return m[0].trim()
  return null
}

export function extractPageTitle(html: string): string | null {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const t = doc.querySelector('title')?.textContent?.trim()
  return t || null
}
