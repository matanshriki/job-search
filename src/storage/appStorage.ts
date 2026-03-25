import {
  DEFAULT_PROFILE,
  type AppData,
  type Job,
  type ScanRecord,
  type SearchProfile,
  type TrackedCompany,
} from '@/domain/types'
import { DEFAULT_JOBS_FEED, MIN_RELEVANT_MATCH_SCORE, STORAGE_KEY } from '@/domain/constants'
import { buildDefaultTrackedCompanies } from '@/data/defaultCompanies'
import { jobDuplicateKey } from '@/lib/utils'
import { rescoreAllJobs } from '@/services/scoring/matchEngine'

const CURRENT_VERSION = 2

function migrateJobKeys(jobs: Job[]): Job[] {
  return jobs.map((j) => {
    const segments = (j.normalizedKey ?? '').split('|')
    if (segments.length >= 3) return j
    return {
      ...j,
      normalizedKey: jobDuplicateKey(j.company, j.title, j.location),
    }
  })
}

/** Old demo slugs 404 on Greenhouse API — remap to real public boards */
const GREENHOUSE_CAREER_URL_FIXES: Record<string, string> = {
  'https://boards.greenhouse.io/vertexscaleexample': 'https://boards.greenhouse.io/greenhouse',
  'http://boards.greenhouse.io/vertexscaleexample': 'https://boards.greenhouse.io/greenhouse',
  'https://boards.greenhouse.io/northstarexample': 'https://boards.greenhouse.io/mongodb',
  'http://boards.greenhouse.io/northstarexample': 'https://boards.greenhouse.io/mongodb',
}

function migrateCompanyCareerUrls(companies: TrackedCompany[]): TrackedCompany[] {
  return companies.map((c) => {
    const key = c.careerPageUrl.trim()
    const fixed = GREENHOUSE_CAREER_URL_FIXES[key]
    return fixed ? { ...c, careerPageUrl: fixed } : c
  })
}

/** Shipped demo seed (mockData) — remove so the app stays aligned with real defaults. */
const BUNDLED_DEMO_COMPANY_IDS = new Set(['co-vertex', 'co-meridian', 'co-northstar'])
const BUNDLED_DEMO_COMPANY_NAMES = new Set([
  'VertexScale',
  'Meridian Cloud',
  'Northstar Ledger',
])

function migrateBundledDemoSeed(data: AppData): { data: AppData; changed: boolean } {
  const hasDemo = data.companies.some((c) => BUNDLED_DEMO_COMPANY_IDS.has(c.id))
  if (!hasDemo) return { data, changed: false }

  const hadOnlyBundledDemo =
    data.companies.length > 0 &&
    data.companies.every((c) => BUNDLED_DEMO_COMPANY_IDS.has(c.id))

  const keptCompanies = data.companies.filter((c) => !BUNDLED_DEMO_COMPANY_IDS.has(c.id))
  const removedIds = new Set(
    data.companies.filter((c) => BUNDLED_DEMO_COMPANY_IDS.has(c.id)).map((c) => c.id),
  )
  const keptJobs = data.jobs.filter((j) => {
    if (j.companyId && removedIds.has(j.companyId)) return false
    if (!j.companyId && BUNDLED_DEMO_COMPANY_NAMES.has(j.company)) return false
    return true
  })
  const scanHistory = data.scanHistory.filter((r) => !removedIds.has(r.companyId))

  let companies = keptCompanies
  if (companies.length === 0) companies = buildDefaultTrackedCompanies()

  const profile: SearchProfile = hadOnlyBundledDemo
    ? { ...DEFAULT_PROFILE }
    : { ...DEFAULT_PROFILE, ...data.profile }

  return {
    data: {
      ...data,
      companies,
      jobs: keptJobs,
      scanHistory,
      profile,
    },
    changed: true,
  }
}

export function createEmptyAppData(): AppData {
  return {
    version: CURRENT_VERSION,
    profile: { ...DEFAULT_PROFILE },
    companies: buildDefaultTrackedCompanies(),
    jobs: [],
    scanHistory: [],
    jobsFeed: { ...DEFAULT_JOBS_FEED },
    savedJobViews: [],
  }
}

export function loadAppData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return createEmptyAppData()
    const parsed = JSON.parse(raw) as AppData
    if (!parsed || typeof parsed !== 'object') return createEmptyAppData()
    const jobsRaw = Array.isArray(parsed.jobs) ? parsed.jobs : []
    const companiesRaw = Array.isArray(parsed.companies) ? parsed.companies : []
    const companies = migrateCompanyCareerUrls(companiesRaw)
    const fromStorageVersion = typeof parsed.version === 'number' ? parsed.version : 0
    const mergedFeed = { ...DEFAULT_JOBS_FEED, ...parsed.jobsFeed }
    const jobsFeedMigrated =
      fromStorageVersion < 2 && (mergedFeed.minScore === '' || mergedFeed.minScore == null)
    const jobsFeed = jobsFeedMigrated
      ? { ...mergedFeed, minScore: String(MIN_RELEVANT_MATCH_SCORE) }
      : mergedFeed

    const next: AppData = {
      ...createEmptyAppData(),
      ...parsed,
      profile: { ...DEFAULT_PROFILE, ...parsed.profile },
      companies,
      jobs: migrateJobKeys(jobsRaw),
      scanHistory: Array.isArray(parsed.scanHistory) ? parsed.scanHistory : [],
      jobsFeed,
      savedJobViews: Array.isArray(parsed.savedJobViews)
        ? parsed.savedJobViews
        : [],
      version: CURRENT_VERSION,
    }
    const prevUrls = new Map(companiesRaw.map((c) => [c.id, c.careerPageUrl]))
    const urlsMigrated = companies.some((c) => prevUrls.get(c.id) !== c.careerPageUrl)

    const { data: demoStripped, changed: demoMigrated } = migrateBundledDemoSeed(next)
    const rescored = {
      ...demoStripped,
      jobs: rescoreAllJobs(demoStripped.jobs, demoStripped.profile),
    }

    if (urlsMigrated || demoMigrated || jobsFeedMigrated) saveAppData(rescored)
    return rescored
  } catch {
    return createEmptyAppData()
  }
}

export function saveAppData(data: AppData): void {
  const payload: AppData = {
    ...data,
    version: CURRENT_VERSION,
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
}

export function exportAppDataJson(data: AppData): string {
  return JSON.stringify(
    { ...data, version: CURRENT_VERSION, exportedAt: new Date().toISOString() },
    null,
    2,
  )
}

export function importAppDataJson(json: string): AppData {
  const parsed = JSON.parse(json) as AppData & { exportedAt?: string }
  const jobsRaw = Array.isArray(parsed.jobs) ? parsed.jobs : []
  const mergedFeed = { ...DEFAULT_JOBS_FEED, ...parsed.jobsFeed }
  const jobsFeedImport =
    mergedFeed.minScore === '' || mergedFeed.minScore == null
      ? { ...mergedFeed, minScore: String(MIN_RELEVANT_MATCH_SCORE) }
      : mergedFeed

  const merged: AppData = {
    ...createEmptyAppData(),
    ...parsed,
    profile: { ...DEFAULT_PROFILE, ...parsed.profile },
    companies: migrateCompanyCareerUrls(
      Array.isArray(parsed.companies) ? parsed.companies : [],
    ),
    jobs: migrateJobKeys(jobsRaw),
    scanHistory: Array.isArray(parsed.scanHistory) ? parsed.scanHistory : [],
    jobsFeed: jobsFeedImport,
    savedJobViews: Array.isArray(parsed.savedJobViews)
      ? parsed.savedJobViews
      : [],
    version: CURRENT_VERSION,
  }
  const { data: demoStripped } = migrateBundledDemoSeed(merged)
  return {
    ...demoStripped,
    jobs: rescoreAllJobs(demoStripped.jobs, demoStripped.profile),
  }
}

export function clearAppData(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export type AppDataPatch = Partial<
  Pick<
    AppData,
    'profile' | 'companies' | 'jobs' | 'scanHistory' | 'jobsFeed' | 'savedJobViews'
  >
>

export function mergePatch(current: AppData, patch: AppDataPatch): AppData {
  return {
    ...current,
    ...patch,
    profile: patch.profile ?? current.profile,
    companies: patch.companies ?? current.companies,
    jobs: patch.jobs ?? current.jobs,
    scanHistory: patch.scanHistory ?? current.scanHistory,
    jobsFeed: patch.jobsFeed ?? current.jobsFeed ?? { ...DEFAULT_JOBS_FEED },
    savedJobViews: patch.savedJobViews ?? current.savedJobViews ?? [],
  }
}

export function updateJobInList(jobs: Job[], job: Job): Job[] {
  const i = jobs.findIndex((j) => j.id === job.id)
  if (i === -1) return [...jobs, job]
  const next = [...jobs]
  next[i] = job
  return next
}

export function updateCompanyInList(
  companies: TrackedCompany[],
  company: TrackedCompany,
): TrackedCompany[] {
  const i = companies.findIndex((c) => c.id === company.id)
  if (i === -1) return [...companies, company]
  const next = [...companies]
  next[i] = company
  return next
}

export function appendScanHistory(
  history: ScanRecord[],
  record: ScanRecord,
): ScanRecord[] {
  return [record, ...history].slice(0, 200)
}

export function replaceProfile(current: AppData, profile: SearchProfile): AppData {
  return { ...current, profile: { ...profile } }
}
