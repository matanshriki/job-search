import type { TrackedCompany } from '@/domain/types'

/** Shipped defaults for a fresh install / reset — adjust career URLs to match each company’s real board. */
export function buildDefaultTrackedCompanies(): TrackedCompany[] {
  const createdAt = new Date().toISOString()
  return [
    {
      id: 'co-wiz',
      name: 'wiz',
      website: 'https://www.wiz.io',
      careerPageUrl: 'https://www.wiz.io/careers',
      notes: '',
      priority: 'high',
      lastScanAt: null,
      jobsFoundCount: 0,
      createdAt,
    },
    {
      id: 'co-monday',
      name: 'monday.com',
      website: 'https://monday.com',
      careerPageUrl: 'https://monday.com/careers/',
      notes: '',
      priority: 'high',
      lastScanAt: null,
      jobsFoundCount: 0,
      createdAt,
    },
    {
      id: 'co-hibob',
      name: 'hibob',
      website: 'https://www.hibob.com',
      careerPageUrl: 'https://www.hibob.com/careers/',
      notes: 'Also try https://careers.hibob.com/ if this URL stops redirecting correctly.',
      priority: 'high',
      lastScanAt: null,
      jobsFoundCount: 0,
      createdAt,
    },
  ]
}
