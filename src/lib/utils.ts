import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

export function startOfWeekIso(now = new Date()): string {
  const d = new Date(now)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

/** Normalize a segment for stable duplicate matching */
export function normalizeDuplicateSegment(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
}

/**
 * Duplicate detection key: company + title + location (all normalized).
 * Same role in two locations is treated as distinct.
 */
export function jobDuplicateKey(company: string, title: string, location: string): string {
  return [
    normalizeDuplicateSegment(company),
    normalizeDuplicateSegment(title),
    normalizeDuplicateSegment(location),
  ].join('|')
}

