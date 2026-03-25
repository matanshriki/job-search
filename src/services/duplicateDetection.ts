import type { Job } from '@/domain/types'
import { jobDuplicateKey } from '@/lib/utils'

export interface DuplicateGroup {
  key: string
  jobIds: string[]
}

export function jobDedupKey(job: Job): string {
  return (
    job.normalizedKey ||
    jobDuplicateKey(job.company, job.title, job.location) ||
    `${job.sourceUrl}|${job.title}`.toLowerCase()
  )
}

export function findDuplicateGroups(jobs: Job[]): DuplicateGroup[] {
  const map = new Map<string, string[]>()
  for (const j of jobs) {
    const key = jobDedupKey(j)
    const list = map.get(key) ?? []
    list.push(j.id)
    map.set(key, list)
  }
  return [...map.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([key, jobIds]) => ({ key, jobIds }))
}

export function suggestTagsFromText(text: string, existing: string[]): string[] {
  const common = [
    'React',
    'TypeScript',
    'Node',
    'Python',
    'Go',
    'AWS',
    'Kubernetes',
    'ML',
    'Data',
    'Product',
    'Leadership',
    'Frontend',
    'Backend',
    'Full stack',
    'Security',
    'Finance',
    'Health',
    'B2B',
    'Startup',
    'SaaS',
    'GTM',
    'Platform',
  ]
  const lower = text.toLowerCase()
  const suggestions = common.filter(
    (c) => lower.includes(c.toLowerCase()) && !existing.includes(c),
  )
  return [...new Set(suggestions)].slice(0, 8)
}
