import { jobDuplicateKey } from '@/lib/utils'
import type { JobSourceType } from '@/domain/types'
import { JOB_SOURCE_LABELS } from '@/domain/types'

export interface ManualJobInput {
  title?: string
  company?: string
  location?: string
  description: string
  sourceType: JobSourceType
  sourceUrl?: string
  linkedInUrl?: string
}

function firstLineTitle(text: string): string | null {
  const line = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 2)
  if (!line) return null
  if (line.length > 120) return line.slice(0, 117) + '…'
  return line
}

export function parseLinkedInJobUrl(url: string): { id: string | null; clean: string } {
  const clean = url.trim()
  const m = clean.match(/linkedin\.com\/jobs\/view\/(\d+)/i)
  return { id: m?.[1] ?? null, clean }
}

/**
 * Heuristic extraction from pasted LinkedIn / career-site job text.
 */
export function extractFieldsFromPastedJobText(raw: string): {
  title?: string
  company?: string
  location?: string
} {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
  const out: { title?: string; company?: string; location?: string } = {}
  if (lines.length === 0) return out

  const first = lines[0]
  const atMatch = first.match(/^(.+?)\s+at\s+(.+?)$/i)
  if (atMatch) {
    out.title = atMatch[1].trim()
    out.company = atMatch[2].replace(/\s*[·•].*$/, '').trim()
  } else if (first.length <= 120 && !/^about\s+(the\s+)?job/i.test(first)) {
    out.title = first
  }

  if (lines[1]) {
    const second = lines[1]
    const dotParts = second.split(/\s*[·•]\s*/)
    if (dotParts.length >= 2) {
      if (!out.company) out.company = dotParts[0].trim()
      const locCandidate = dotParts[1].trim()
      if (
        /remote|hybrid|onsite|on-site|area|,|[A-Z]{2}\b|united|uk|emea|apac|worldwide/i.test(
          locCandidate,
        )
      ) {
        out.location = locCandidate.replace(/\s*·.*$/, '').trim()
      }
    } else if (!out.company && second.length < 90 && !/^see\s+more/i.test(second)) {
      out.company = second
    }
  }

  const head = lines.slice(0, 12).join('\n')
  if (!out.location) {
    if (/\bremote\b/i.test(head)) out.location = 'Remote'
    else if (/\bhybrid\b/i.test(head)) out.location = 'Hybrid'
    else {
      const m = head.match(
        /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*(?:[A-Z]{2}|[A-Za-z ]{2,30}))\b/,
      )
      if (m) out.location = m[1].trim()
    }
  }

  return out
}

export function buildJobFromPastedContent(input: ManualJobInput): {
  title: string
  company: string
  location: string
  description: string
  sourceUrl: string
  sourceLabel: string
  normalizedKey: string
} {
  const desc = input.description.trim()
  const extracted = extractFieldsFromPastedJobText(desc)

  const title =
    (input.title && input.title.trim()) ||
    extracted.title ||
    firstLineTitle(desc) ||
    'Untitled role'

  const company =
    (input.company && input.company.trim()) ||
    extracted.company ||
    'Unknown company'

  const location =
    (input.location && input.location.trim()) ||
    extracted.location ||
    inferLocation(desc) ||
    'Unspecified'

  const sourceUrl =
    input.linkedInUrl?.trim() ||
    input.sourceUrl?.trim() ||
    (input.sourceType === 'linkedin_manual' ? 'https://www.linkedin.com/jobs/' : '')

  const sourceLabel = JOB_SOURCE_LABELS[input.sourceType]

  return {
    title,
    company,
    location: location || 'Unspecified',
    description: desc || title,
    sourceUrl,
    sourceLabel,
    normalizedKey: jobDuplicateKey(company, title, location || 'Unspecified'),
  }
}

function inferLocation(text: string): string {
  const m = text.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*,\s*[A-Z]{2,})\b/)
  if (m) return m[1]
  if (/remote/i.test(text)) return 'Remote'
  if (/hybrid/i.test(text)) return 'Hybrid'
  return ''
}
