/* eslint-disable react-refresh/only-export-components */
/**
 * API-backed global state context.
 * Replaces the localStorage-only app-state.tsx with backend API calls.
 * Keeps the same public interface so existing pages continue to work.
 */
import * as React from 'react'
import {
  profileApi,
  companiesApi,
  jobsApi,
  resumesApi,
  agentsApi,
  dataApi,
  healthApi,
  type ApiJob,
  type ApiCompany,
  type ApiProfile,
  type ApiResume,
  type ApiScanRun,
  type ApiAppSettings,
} from '@/services/api'
import { useToast } from '@/hooks/use-toast'

// ─── Helper to parse JSON fields from the API ────────────────────────────────

function parseJson<T>(s: string | undefined | null, fallback: T): T {
  if (!s) return fallback
  try { return JSON.parse(s) } catch { return fallback }
}

/** Convert ApiProfile (raw DB) → frontend SearchProfile shape */
export function apiProfileToSearchProfile(p: ApiProfile) {
  return {
    targetTitles: parseJson<string[]>(p.preferredTitlesJson, []),
    excludedTitles: parseJson<string[]>(p.excludedTitlesJson, []),
    targetSeniority: parseJson<string[]>(p.seniorityLevel, []),
    preferredFunctions: parseJson<string[]>(p.preferredFunctionsJson, []),
    preferredIndustries: parseJson<string[]>(p.preferredIndustriesJson, []),
    preferredGeographies: parseJson<string[]>(p.preferredLocationsJson, []),
    remotePreference: (p.remotePreference || 'flexible') as 'remote_first' | 'hybrid_ok' | 'onsite_ok' | 'flexible',
    idealCompanyStage: parseJson<string[]>(p.idealCompanyStageJson, []),
    keywordsBoost: parseJson<string[]>(p.targetKeywordsJson, []),
    keywordsPenalize: parseJson<string[]>(p.excludedKeywordsJson, []),
    compensationNotes: p.compensationNotes,
    personalSummary: p.summary,
    fullName: p.fullName,
    email: p.email,
    linkedinUrl: p.linkedinUrl,
  }
}

/** Convert ApiJob → frontend Job shape for backward compat with existing page components */
export function apiJobToFrontend(j: ApiJob) {
  return {
    id: String(j.id),
    title: j.title,
    company: j.company?.name ?? '',
    location: j.location,
    department: j.department || null,
    employmentType: j.employmentType || null,
    description: j.descriptionClean || j.descriptionRaw,
    sourceType: j.sourceType as never,
    sourceLabel: j.sourceLabel,
    sourceUrl: j.jobUrl,
    dateFound: j.discoveredAt,
    datePosted: j.postedAt,
    score: j.match?.fitScore ?? 0,
    fitSummary: j.match?.fitSummary ?? '',
    strengths: parseJson<string[]>(j.match?.strengthsJson, []),
    concerns: parseJson<string[]>(j.match?.concernsJson, []),
    status: j.status as never,
    notes: j.notes,
    tags: parseJson<string[]>(j.tagsJson, []),
    normalizedKey: j.normalizedKey,
    companyId: j.companyId ? String(j.companyId) : null,
    insightSnippet: j.match?.insightSnippet ?? '',
    redFlags: parseJson<string[]>(j.match?.redFlagsJson, []),
    // Extra API-only fields
    _apiId: j.id,
    _hasAssets: (j.generatedAssets?.length ?? 0) > 0,
    _assetTypes: (j.generatedAssets ?? []).map((a) => a.assetType),
  }
}

export function apiCompanyToFrontend(c: ApiCompany) {
  return {
    id: String(c.id),
    name: c.name,
    website: c.companyDomain,
    careerPageUrl: c.careersUrl,
    notes: c.notes,
    priority: c.priority as 'high' | 'medium' | 'low',
    lastScanAt: c.lastScan?.startedAt ?? null,
    jobsFoundCount: c.jobsFoundCount ?? 0,
    createdAt: c.createdAt,
    _apiId: c.id,
  }
}

// ─── Context types ────────────────────────────────────────────────────────────

export type FrontendJob = ReturnType<typeof apiJobToFrontend>
export type FrontendCompany = ReturnType<typeof apiCompanyToFrontend>
export type FrontendProfile = ReturnType<typeof apiProfileToSearchProfile>

export interface ApiStateContextValue {
  // Loading state
  loading: boolean
  backendAvailable: boolean

  // Data
  profile: FrontendProfile | null
  companies: FrontendCompany[]
  jobs: FrontendJob[]
  scanHistory: ApiScanRun[]
  resumes: ApiResume[]
  settings: ApiAppSettings | null

  // Profile actions
  updateProfile: (profile: FrontendProfile) => Promise<void>

  // Company actions
  addCompany: (c: { name: string; careersUrl: string; companyDomain?: string; priority?: string; notes?: string }) => Promise<void>
  updateCompany: (c: FrontendCompany) => Promise<void>
  deleteCompany: (id: string) => Promise<void>
  scanCompany: (companyId: string) => Promise<void>
  pasteHtmlForCompany: (companyId: string, html: string, baseUrl: string) => Promise<void>

  // Job actions
  addManualJob: (input: ApiManualJobInput) => Promise<void>
  updateJob: (job: FrontendJob) => Promise<void>
  deleteJob: (id: string) => Promise<void>

  // Data actions
  importJson: (json: string) => Promise<void>
  exportJson: () => Promise<string>
  resetAll: () => Promise<void>

  // Refresh
  refresh: () => Promise<void>
}

export interface ApiManualJobInput {
  title?: string
  company?: string
  location?: string
  description: string
  sourceType?: string
  sourceUrl?: string
  notes?: string
  tags?: string[]
}

// ─── Context ──────────────────────────────────────────────────────────────────

const ApiStateContext = React.createContext<ApiStateContextValue | null>(null)

export function ApiStateProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast()

  const [loading, setLoading] = React.useState(true)
  const [backendAvailable, setBackendAvailable] = React.useState(false)
  const [profile, setProfile] = React.useState<FrontendProfile | null>(null)
  const [companies, setCompanies] = React.useState<FrontendCompany[]>([])
  const [jobs, setJobs] = React.useState<FrontendJob[]>([])
  const [scanHistory, setScanHistory] = React.useState<ApiScanRun[]>([])
  const [resumes, setResumes] = React.useState<ApiResume[]>([])
  const [settings] = React.useState<ApiAppSettings | null>(null)

  const loadAll = React.useCallback(async () => {
    try {
      await healthApi.check()
      setBackendAvailable(true)
    } catch {
      setBackendAvailable(false)
      setLoading(false)
      return
    }

    try {
      const [profileRes, companiesRes, jobsRes, resumesRes, scanRunsRes] = await Promise.allSettled([
        profileApi.get(),
        companiesApi.list(),
        jobsApi.list({ limit: '500' }),
        resumesApi.list(),
        agentsApi.getScanRuns({ limit: '50' }),
      ])

      if (profileRes.status === 'fulfilled') {
        setProfile(apiProfileToSearchProfile(profileRes.value.profile))
      }
      if (companiesRes.status === 'fulfilled') {
        setCompanies(companiesRes.value.companies.map(apiCompanyToFrontend))
      }
      if (jobsRes.status === 'fulfilled') {
        setJobs(jobsRes.value.jobs.map(apiJobToFrontend))
      }
      if (resumesRes.status === 'fulfilled') {
        setResumes(resumesRes.value.resumes)
      }
      if (scanRunsRes.status === 'fulfilled') {
        setScanHistory(scanRunsRes.value.runs)
      }
    } catch (e) {
      console.error('Failed to load app data:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void loadAll()
  }, [loadAll])

  const updateProfile = React.useCallback(async (p: FrontendProfile) => {
    try {
      await profileApi.update(p)
      setProfile(p)
      // Reload jobs since scores may have changed
      const jobsRes = await jobsApi.list({ limit: '500' })
      setJobs(jobsRes.jobs.map(apiJobToFrontend))
      toast({ title: 'Profile saved', description: 'Preferences updated; jobs re-scored.', variant: 'success' })
    } catch (e) {
      toast({ title: 'Failed to save profile', description: String(e), variant: 'destructive' })
      throw e
    }
  }, [toast])

  const addCompany = React.useCallback(async (data: Parameters<ApiStateContextValue['addCompany']>[0]) => {
    try {
      const res = await companiesApi.create(data)
      setCompanies((prev) => [...prev, apiCompanyToFrontend(res.company)])
      toast({ title: 'Company added', variant: 'success' })
    } catch (e) {
      toast({ title: 'Failed to add company', description: String(e), variant: 'destructive' })
      throw e
    }
  }, [toast])

  const updateCompany = React.useCallback(async (c: FrontendCompany) => {
    try {
      const res = await companiesApi.update(c._apiId, {
        name: c.name,
        careersUrl: c.careerPageUrl,
        companyDomain: c.website,
        priority: c.priority,
        notes: c.notes,
      })
      setCompanies((prev) => prev.map((x) => x._apiId === c._apiId ? apiCompanyToFrontend(res.company) : x))
      toast({ title: 'Company updated', variant: 'success' })
    } catch (e) {
      toast({ title: 'Failed to update company', description: String(e), variant: 'destructive' })
      throw e
    }
  }, [toast])

  const deleteCompany = React.useCallback(async (id: string) => {
    const apiId = parseInt(id, 10) || (companies.find((c) => c.id === id)?._apiId)
    if (!apiId) return
    try {
      await companiesApi.delete(apiId)
      setCompanies((prev) => prev.filter((c) => c._apiId !== apiId))
      setJobs((prev) => prev.map((j) => j.companyId === id ? { ...j, companyId: null } : j))
      toast({ title: 'Company removed', variant: 'default' })
    } catch (e) {
      toast({ title: 'Failed to remove company', description: String(e), variant: 'destructive' })
      throw e
    }
  }, [companies, toast])

  const scanCompany = React.useCallback(async (companyId: string) => {
    const company = companies.find((c) => c.id === companyId)
    if (!company) return
    try {
      toast({ title: 'Scanning…', description: `Fetching roles from ${company.name}` })
      const result = await companiesApi.scan(company._apiId)
      // Reload jobs and companies
      const [jobsRes, companiesRes, scanRunsRes] = await Promise.all([
        jobsApi.list({ limit: '500' }),
        companiesApi.list(),
        agentsApi.getScanRuns({ limit: '50' }),
      ])
      setJobs(jobsRes.jobs.map(apiJobToFrontend))
      setCompanies(companiesRes.companies.map(apiCompanyToFrontend))
      setScanHistory(scanRunsRes.runs)
      const dupNote = result.jobsFound > 0 && result.jobsCreated === 0
        ? ' All found roles were already in your pipeline (duplicates).'
        : ''
      toast({
        title: result.ok ? 'Scan complete' : 'Scan finished with issues',
        description: `${result.message}${dupNote}`,
        variant: result.ok ? 'success' : 'destructive',
      })
    } catch (e) {
      toast({ title: 'Scan failed', description: String(e), variant: 'destructive' })
      throw e
    }
  }, [companies, toast])

  const pasteHtmlForCompany = React.useCallback(async (companyId: string, html: string, baseUrl: string) => {
    const company = companies.find((c) => c.id === companyId)
    if (!company) return
    try {
      const result = await companiesApi.pasteHtml(company._apiId, html, baseUrl)
      const [jobsRes, companiesRes] = await Promise.all([
        jobsApi.list({ limit: '500' }),
        companiesApi.list(),
      ])
      setJobs(jobsRes.jobs.map(apiJobToFrontend))
      setCompanies(companiesRes.companies.map(apiCompanyToFrontend))
      toast({
        title: result.ok ? 'HTML import complete' : 'HTML import incomplete',
        description: result.message,
        variant: result.ok ? 'success' : 'destructive',
      })
    } catch (e) {
      toast({ title: 'HTML import failed', description: String(e), variant: 'destructive' })
      throw e
    }
  }, [companies, toast])

  const addManualJob = React.useCallback(async (input: ApiManualJobInput) => {
    if (!input.description?.trim()) {
      toast({ title: 'Description required', description: 'Paste or enter a job description before saving.', variant: 'destructive' })
      return
    }
    try {
      const res = await jobsApi.create({
        title: input.title ?? '',
        company: input.company,
        location: input.location,
        description: input.description,
        sourceType: input.sourceType ?? 'manual_entry',
        sourceUrl: input.sourceUrl,
        notes: input.notes,
        tags: input.tags,
      })
      if (res.job) setJobs((prev) => [apiJobToFrontend(res.job), ...prev])
      toast({ title: 'Job added', description: input.title, variant: 'success' })
    } catch (e) {
      toast({ title: 'Failed to add job', description: String(e), variant: 'destructive' })
      throw e
    }
  }, [toast])

  const updateJob = React.useCallback(async (job: FrontendJob) => {
    const apiId = job._apiId ?? parseInt(job.id, 10)
    if (!apiId) return
    try {
      const res = await jobsApi.update(apiId, {
        status: job.status,
        notes: job.notes,
        tagsJson: JSON.stringify(job.tags),
      } as never)
      if (res.job) setJobs((prev) => prev.map((j) => j._apiId === apiId ? apiJobToFrontend(res.job) : j))
      toast({ title: 'Job saved', variant: 'success' })
    } catch (e) {
      toast({ title: 'Failed to save job', description: String(e), variant: 'destructive' })
      throw e
    }
  }, [toast])

  const deleteJob = React.useCallback(async (id: string) => {
    const apiId = parseInt(id, 10) || (jobs.find((j) => j.id === id)?._apiId)
    if (!apiId) return
    try {
      await jobsApi.delete(apiId)
      setJobs((prev) => prev.filter((j) => j._apiId !== apiId))
      toast({ title: 'Job removed', variant: 'default' })
    } catch (e) {
      toast({ title: 'Failed to remove job', description: String(e), variant: 'destructive' })
      throw e
    }
  }, [jobs, toast])

  const importJson = React.useCallback(async (json: string) => {
    try {
      const data = JSON.parse(json) as unknown
      await dataApi.import(data, false)
      await loadAll()
      toast({ title: 'Import complete', description: 'Data restored from backup.', variant: 'success' })
    } catch (e) {
      toast({ title: 'Import failed', description: String(e), variant: 'destructive' })
      throw e
    }
  }, [loadAll, toast])

  const exportJson = React.useCallback(async () => {
    const data = await dataApi.export()
    return JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 2)
  }, [])

  const resetAll = React.useCallback(async () => {
    try {
      await dataApi.import({}, true)
      await loadAll()
      toast({ title: 'Data reset', description: 'All data cleared.', variant: 'default' })
    } catch (e) {
      toast({ title: 'Reset failed', description: String(e), variant: 'destructive' })
      throw e
    }
  }, [loadAll, toast])

  const refresh = React.useCallback(() => loadAll(), [loadAll])

  const value = React.useMemo<ApiStateContextValue>(() => ({
    loading, backendAvailable,
    profile, companies, jobs, scanHistory, resumes, settings,
    updateProfile, addCompany, updateCompany, deleteCompany,
    scanCompany, pasteHtmlForCompany,
    addManualJob, updateJob, deleteJob,
    importJson, exportJson, resetAll, refresh,
  }), [
    loading, backendAvailable, profile, companies, jobs, scanHistory, resumes, settings,
    updateProfile, addCompany, updateCompany, deleteCompany,
    scanCompany, pasteHtmlForCompany,
    addManualJob, updateJob, deleteJob,
    importJson, exportJson, resetAll, refresh,
  ])

  return <ApiStateContext.Provider value={value}>{children}</ApiStateContext.Provider>
}

export function useApiState() {
  const ctx = React.useContext(ApiStateContext)
  if (!ctx) throw new Error('useApiState must be used within ApiStateProvider')
  return ctx
}

/** Hook for jobs feed filter state — persisted via API settings */
export function useJobsFeedFilters() {
  const [filters, setFilters] = React.useState({
    q: '',
    source: 'all',
    status: 'all',
    company: '',
    location: '',
    minScore: '55',
    sort: 'score' as 'score' | 'dateFound' | 'datePosted',
    hideOutsideProfileGeos: true,
  })
  return { filters, setFilters }
}
