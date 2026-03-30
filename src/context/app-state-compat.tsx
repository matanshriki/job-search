/* eslint-disable react-refresh/only-export-components */
/**
 * Compatibility adapter: exposes the old useAppState() interface backed by the new API state.
 * Existing pages continue to work unchanged.
 */
import * as React from 'react'
import {
  ApiStateProvider,
  useApiState,
  type FrontendJob,
  type FrontendCompany,
  type FrontendProfile,
  type ApiManualJobInput,
} from './api-state'
import type { AppData, Job, JobsFeedPersistedState, SavedJobsView, SearchProfile, TrackedCompany } from '@/domain/types'
import { DEFAULT_JOBS_FEED } from '@/domain/constants'

// ─── Context interface (same as old AppStateProvider) ─────────────────────────

interface AppStateContextValue {
  data: AppData
  setData: React.Dispatch<React.SetStateAction<AppData>>
  updateProfile: (profile: SearchProfile) => void
  recalculateAllMatchScores: () => void
  addCompany: (c: Omit<TrackedCompany, 'id' | 'createdAt' | 'lastScanAt' | 'jobsFoundCount'>) => void
  updateCompany: (c: TrackedCompany) => void
  deleteCompany: (id: string) => void
  scanCompany: (companyId: string) => Promise<void>
  pasteHtmlForCompany: (companyId: string, html: string, baseUrl: string) => Promise<void>
  addManualJob: (input: ApiManualJobInput) => void
  updateJob: (job: Job) => void
  deleteJob: (id: string) => void
  importJson: (json: string) => void
  exportJson: () => string
  resetAll: () => void
  updateJobsFeed: (patch: Partial<JobsFeedPersistedState>) => void
  saveJobView: (view: Omit<SavedJobsView, 'id'>) => void
  deleteJobView: (id: string) => void
  // Loading indicator
  loading: boolean
  backendAvailable: boolean
}

const AppStateContext = React.createContext<AppStateContextValue | null>(null)

function frontendJobToLegacy(j: FrontendJob): Job {
  return {
    id: j.id,
    title: j.title,
    company: j.company,
    location: j.location,
    department: j.department,
    employmentType: j.employmentType,
    description: j.description,
    sourceType: j.sourceType,
    sourceLabel: j.sourceLabel,
    sourceUrl: j.sourceUrl,
    dateFound: j.dateFound,
    datePosted: j.datePosted,
    score: j.score,
    fitSummary: j.fitSummary,
    strengths: j.strengths,
    concerns: j.concerns,
    status: j.status,
    notes: j.notes,
    tags: j.tags,
    normalizedKey: j.normalizedKey,
    companyId: j.companyId,
    insightSnippet: j.insightSnippet,
    redFlags: j.redFlags,
  }
}

function frontendCompanyToLegacy(c: FrontendCompany): TrackedCompany {
  return {
    id: c.id,
    name: c.name,
    website: c.website,
    careerPageUrl: c.careerPageUrl,
    notes: c.notes,
    priority: c.priority,
    lastScanAt: c.lastScanAt,
    jobsFoundCount: c.jobsFoundCount,
    createdAt: c.createdAt,
  }
}

function frontendProfileToLegacy(p: FrontendProfile): SearchProfile {
  return {
    targetTitles: p.targetTitles,
    excludedTitles: p.excludedTitles,
    targetSeniority: p.targetSeniority as SearchProfile['targetSeniority'],
    preferredFunctions: p.preferredFunctions,
    preferredIndustries: p.preferredIndustries,
    preferredGeographies: p.preferredGeographies,
    remotePreference: p.remotePreference,
    idealCompanyStage: p.idealCompanyStage,
    keywordsBoost: p.keywordsBoost,
    keywordsPenalize: p.keywordsPenalize,
    compensationNotes: p.compensationNotes,
    personalSummary: p.personalSummary,
  }
}

/** Inner component that consumes ApiStateProvider and re-exposes old interface */
function AppStateCompatInner({ children }: { children: React.ReactNode }) {
  const api = useApiState()
  const [jobsFeed, setJobsFeed] = React.useState<JobsFeedPersistedState>({ ...DEFAULT_JOBS_FEED })
  const [savedJobViews, setSavedJobViews] = React.useState<SavedJobsView[]>([])

  // Build the legacy AppData object from API state
  const data = React.useMemo<AppData>(() => ({
    version: 3,
    profile: api.profile ? frontendProfileToLegacy(api.profile) : {
      targetTitles: [], excludedTitles: [], targetSeniority: [],
      preferredFunctions: [], preferredIndustries: [], preferredGeographies: [],
      remotePreference: 'flexible', idealCompanyStage: [],
      keywordsBoost: [], keywordsPenalize: [], compensationNotes: '', personalSummary: '',
    },
    companies: api.companies.map(frontendCompanyToLegacy),
    jobs: api.jobs.map(frontendJobToLegacy),
    scanHistory: api.scanHistory.map((s) => ({
      id: String(s.id),
      companyId: s.companyId ? String(s.companyId) : '',
      companyName: s.company?.name ?? '',
      at: s.startedAt,
      outcome: s.status === 'completed' ? 'success' : s.status === 'failed' ? 'failed' : 'partial' as never,
      message: s.message,
      jobsFound: s.jobsFound,
      method: (s.method || 'generic_html') as never,
    })),
    jobsFeed,
    savedJobViews,
  }), [api.profile, api.companies, api.jobs, api.scanHistory, jobsFeed, savedJobViews])

  const updateProfile = React.useCallback((profile: SearchProfile) => {
    void api.updateProfile({
      ...profile,
      fullName: (api.profile as typeof api.profile & { fullName?: string })?.fullName ?? '',
      email: (api.profile as typeof api.profile & { email?: string })?.email ?? '',
      linkedinUrl: (api.profile as typeof api.profile & { linkedinUrl?: string })?.linkedinUrl ?? '',
    })
  }, [api])

  const recalculateAllMatchScores = React.useCallback(() => {
    void api.refresh()
  }, [api])

  const addCompany = React.useCallback(
    (c: Omit<TrackedCompany, 'id' | 'createdAt' | 'lastScanAt' | 'jobsFoundCount'>) => {
      void api.addCompany({
        name: c.name,
        careersUrl: c.careerPageUrl,
        companyDomain: c.website,
        priority: c.priority,
        notes: c.notes,
      })
    }, [api],
  )

  const updateCompany = React.useCallback((c: TrackedCompany) => {
    const apiCompany = api.companies.find((x) => x.id === c.id)
    if (!apiCompany) return
    void api.updateCompany({ ...apiCompany, ...c, _apiId: apiCompany._apiId })
  }, [api])

  const deleteCompany = React.useCallback((id: string) => {
    void api.deleteCompany(id)
  }, [api])

  const updateJob = React.useCallback((job: Job) => {
    const apiJob = api.jobs.find((j) => j.id === job.id)
    if (!apiJob) return
    const merged = Object.assign({}, apiJob, {
      status: job.status,
      notes: job.notes,
      tags: job.tags,
    })
    void api.updateJob(merged)
  }, [api])

  const deleteJob = React.useCallback((id: string) => {
    void api.deleteJob(id)
  }, [api])

  const importJson = React.useCallback((json: string) => {
    void api.importJson(json)
  }, [api])

  const exportJson = React.useCallback(() => {
    // Return empty for now — async export handled separately
    void api.exportJson().then((s) => {
      // Trigger download
      const blob = new Blob([s], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `job-search-export-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      URL.revokeObjectURL(url)
    })
    return '{}'
  }, [api])

  const resetAll = React.useCallback(() => {
    void api.resetAll()
  }, [api])

  const updateJobsFeed = React.useCallback((patch: Partial<JobsFeedPersistedState>) => {
    setJobsFeed((prev) => ({ ...prev, ...patch }))
  }, [])

  const saveJobView = React.useCallback((view: Omit<SavedJobsView, 'id'>) => {
    const v: SavedJobsView = { ...view, id: `view_${Date.now()}` }
    setSavedJobViews((prev) => [...prev, v])
    setJobsFeed((prev) => ({ ...prev, activeViewId: v.id }))
  }, [])

  const deleteJobView = React.useCallback((id: string) => {
    setSavedJobViews((prev) => prev.filter((x) => x.id !== id))
    setJobsFeed((prev) => prev.activeViewId === id ? { ...prev, activeViewId: null } : prev)
  }, [])

  const value = React.useMemo<AppStateContextValue>(() => ({
    data,
    setData: () => { /* no-op — use specific mutation methods */ },
    updateProfile, recalculateAllMatchScores,
    addCompany, updateCompany, deleteCompany,
    scanCompany: api.scanCompany, pasteHtmlForCompany: api.pasteHtmlForCompany,
    addManualJob: (input) => void api.addManualJob(input),
    updateJob, deleteJob, importJson, exportJson, resetAll,
    updateJobsFeed, saveJobView, deleteJobView,
    loading: api.loading, backendAvailable: api.backendAvailable,
  }), [
    data, updateProfile, recalculateAllMatchScores,
    addCompany, updateCompany, deleteCompany, api,
    updateJob, deleteJob, importJson, exportJson, resetAll,
    updateJobsFeed, saveJobView, deleteJobView,
  ])

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

/** Drop-in replacement for the old AppStateProvider */
export function AppStateProvider({ children }: { children: React.ReactNode }) {
  return (
    <ApiStateProvider>
      <AppStateCompatInner>{children}</AppStateCompatInner>
    </ApiStateProvider>
  )
}

export function useAppState() {
  const ctx = React.useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider')
  return ctx
}

export { useApiState } from './api-state'
