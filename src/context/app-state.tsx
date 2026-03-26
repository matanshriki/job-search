/* eslint-disable react-refresh/only-export-components -- context + hook */
import * as React from 'react'
import { DEFAULT_JOBS_FEED, MIN_RELEVANT_MATCH_SCORE } from '@/domain/constants'
import type {
  AppData,
  Job,
  JobsFeedPersistedState,
  SavedJobsView,
  SearchProfile,
  TrackedCompany,
} from '@/domain/types'
import { useToast } from '@/hooks/use-toast'
import { createJobId, jobFromDraft, jobFromManualParts } from '@/services/jobFactory'
import { scanCompanyCareerPage, scanFromPastedHtml } from '@/services/parsing/careerScanner'
import {
  buildJobFromPastedContent,
  type ManualJobInput,
} from '@/services/parsing/manualIntake'
import { rescoreAllJobs, rescoreJob } from '@/services/scoring/matchEngine'
import {
  appendScanHistory,
  clearAppData,
  createEmptyAppData,
  exportAppDataJson,
  importAppDataJson,
  loadAppData,
  saveAppData,
  updateCompanyInList,
  updateJobInList,
} from '@/storage/appStorage'

function initialData(): AppData {
  return loadAppData()
}

interface AppStateContextValue {
  data: AppData
  setData: React.Dispatch<React.SetStateAction<AppData>>
  updateProfile: (profile: SearchProfile) => void
  /** Re-run scoring for every job using the profile already saved in storage (no form changes). */
  recalculateAllMatchScores: () => void
  addCompany: (c: Omit<TrackedCompany, 'id' | 'createdAt' | 'lastScanAt' | 'jobsFoundCount'>) => void
  updateCompany: (c: TrackedCompany) => void
  deleteCompany: (id: string) => void
  scanCompany: (companyId: string) => Promise<void>
  pasteHtmlForCompany: (companyId: string, html: string, baseUrl: string) => Promise<void>
  addManualJob: (input: ManualJobInput) => void
  updateJob: (job: Job) => void
  deleteJob: (id: string) => void
  importJson: (json: string) => void
  exportJson: () => string
  resetAll: () => void
  updateJobsFeed: (patch: Partial<JobsFeedPersistedState>) => void
  saveJobView: (view: Omit<SavedJobsView, 'id'>) => void
  deleteJobView: (id: string) => void
}

const AppStateContext = React.createContext<AppStateContextValue | null>(null)

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = React.useState<AppData>(initialData)
  const { toast } = useToast()

  const persist = React.useCallback((next: AppData) => {
    setData(next)
    saveAppData(next)
  }, [])

  const updateProfile = React.useCallback(
    (profile: SearchProfile) => {
      const rescored = rescoreAllJobs(data.jobs, profile)
      persist({ ...data, profile, jobs: rescored })
      toast({ title: 'Profile saved', description: 'Preferences updated; jobs re-scored.', variant: 'success' })
    },
    [data, persist, toast],
  )

  const recalculateAllMatchScores = React.useCallback(() => {
    const rescored = rescoreAllJobs(data.jobs, data.profile)
    persist({ ...data, jobs: rescored })
    toast({
      title: 'Scores refreshed',
      description: `Re-scored ${rescored.length} jobs with your saved profile.`,
      variant: 'success',
    })
  }, [data, persist, toast])

  const addCompany = React.useCallback(
    (c: Omit<TrackedCompany, 'id' | 'createdAt' | 'lastScanAt' | 'jobsFoundCount'>) => {
      const company: TrackedCompany = {
        ...c,
        id: createJobId(),
        createdAt: new Date().toISOString(),
        lastScanAt: null,
        jobsFoundCount: 0,
      }
      persist({ ...data, companies: [...data.companies, company] })
      toast({ title: 'Company added', variant: 'success' })
    },
    [data, persist, toast],
  )

  const updateCompany = React.useCallback(
    (c: TrackedCompany) => {
      persist({ ...data, companies: updateCompanyInList(data.companies, c) })
      toast({ title: 'Company updated', variant: 'success' })
    },
    [data, persist, toast],
  )

  const deleteCompany = React.useCallback(
    (id: string) => {
      persist({
        ...data,
        companies: data.companies.filter((x) => x.id !== id),
        jobs: data.jobs.map((j) => (j.companyId === id ? { ...j, companyId: null } : j)),
      })
      toast({ title: 'Company removed', variant: 'default' })
    },
    [data, persist, toast],
  )

  const scanCompany = React.useCallback(
    async (companyId: string) => {
      const company = data.companies.find((c) => c.id === companyId)
      if (!company) return
      const result = await scanCompanyCareerPage({
        careerPageUrl: company.careerPageUrl,
        companyName: company.name,
      })
      const scanId = createJobId()
      const record = {
        id: scanId,
        companyId: company.id,
        companyName: company.name,
        at: new Date().toISOString(),
        outcome: result.ok ? ('success' as const) : result.jobs.length > 0 ? ('partial' as const) : ('failed' as const),
        message: [result.message, ...result.warnings].filter(Boolean).join(' · '),
        jobsFound: result.jobs.length,
        method: result.method,
      }
      let nextJobs = [...data.jobs]
      const existingKeys = new Set(nextJobs.map((j) => j.normalizedKey ?? ''))
      let added = 0
      for (const draft of result.jobs) {
        if (existingKeys.has(draft.normalizedKey)) continue
        const job = jobFromDraft(draft, data.profile, { companyId: company.id })
        nextJobs = updateJobInList(nextJobs, job)
        existingKeys.add(draft.normalizedKey)
        added++
      }
      const updatedCompany: TrackedCompany = {
        ...company,
        lastScanAt: record.at,
        jobsFoundCount: company.jobsFoundCount + added,
      }
      persist({
        ...data,
        jobs: nextJobs,
        companies: updateCompanyInList(data.companies, updatedCompany),
        scanHistory: appendScanHistory(data.scanHistory, record),
      })
      const dupNote =
        result.jobs.length > 0 && added === 0
          ? ' Nothing new was added — these roles were already in your pipeline (same title × company × location).'
          : ''
      const whereNote =
        added > 0
          ? ` Open Jobs feed. If new roles don’t appear: they’re usually filtered out — clear Min score (default ${MIN_RELEVANT_MATCH_SCORE}+) or turn off “Match profile geographies” when titles don’t include your geo keywords.`
          : ''
      toast({
        title: result.ok ? 'Scan complete' : 'Scan finished with issues',
        description: `${result.message}${dupNote}${whereNote}`,
        variant: result.ok ? 'success' : 'destructive',
      })
    },
    [data, persist, toast],
  )

  const pasteHtmlForCompany = React.useCallback(
    async (companyId: string, html: string, baseUrl: string) => {
      const company = data.companies.find((c) => c.id === companyId)
      if (!company) return
      const result = await scanFromPastedHtml({
        html,
        baseUrl: baseUrl || company.careerPageUrl,
        companyName: company.name,
      })
      const record = {
        id: createJobId(),
        companyId: company.id,
        companyName: company.name,
        at: new Date().toISOString(),
        outcome: result.ok ? ('success' as const) : ('failed' as const),
        message: [result.message, ...result.warnings].filter(Boolean).join(' · '),
        jobsFound: result.jobs.length,
        method: 'paste_html' as const,
      }
      let nextJobs = [...data.jobs]
      const existingKeys = new Set(nextJobs.map((j) => j.normalizedKey ?? ''))
      let added = 0
      for (const draft of result.jobs) {
        if (existingKeys.has(draft.normalizedKey)) continue
        const job = jobFromDraft(draft, data.profile, { companyId: company.id })
        nextJobs = updateJobInList(nextJobs, job)
        existingKeys.add(draft.normalizedKey)
        added++
      }
      const updatedCompany: TrackedCompany = {
        ...company,
        lastScanAt: record.at,
        jobsFoundCount: company.jobsFoundCount + added,
      }
      persist({
        ...data,
        jobs: nextJobs,
        companies: updateCompanyInList(data.companies, updatedCompany),
        scanHistory: appendScanHistory(data.scanHistory, record),
      })
      const pasteDup =
        result.jobs.length > 0 && added === 0
          ? ' Nothing new was added — duplicates of roles already in your pipeline.'
          : ''
      const pasteWhere =
        added > 0
          ? ` Open Jobs feed. If new rows are missing: clear Min score or turn off “Match profile geographies” (same as after a scan).`
          : ''
      toast({
        title: result.ok ? 'HTML import complete' : 'HTML import incomplete',
        description: `${result.message}${pasteDup}${pasteWhere}`,
        variant: result.ok ? 'success' : 'destructive',
      })
    },
    [data, persist, toast],
  )

  const addManualJob = React.useCallback(
    (input: ManualJobInput) => {
      if (!input.description?.trim()) {
        toast({
          title: 'Description required',
          description: 'Paste or enter a job description before saving.',
          variant: 'destructive',
        })
        return
      }
      const built = buildJobFromPastedContent(input)
      const job = jobFromManualParts(
        {
          ...built,
          sourceType: input.sourceType,
        },
        data.profile,
      )
      persist({ ...data, jobs: updateJobInList(data.jobs, job) })
      toast({ title: 'Job added', description: built.title, variant: 'success' })
    },
    [data, persist, toast],
  )

  const updateJob = React.useCallback(
    (job: Job) => {
      const scored = rescoreJob(job, data.profile)
      persist({ ...data, jobs: updateJobInList(data.jobs, scored) })
      toast({ title: 'Job saved', variant: 'success' })
    },
    [data, persist, toast],
  )

  const deleteJob = React.useCallback(
    (id: string) => {
      persist({ ...data, jobs: data.jobs.filter((j) => j.id !== id) })
      toast({ title: 'Job removed', variant: 'default' })
    },
    [data, persist, toast],
  )

  const importJson = React.useCallback(
    (json: string) => {
      const imported = importAppDataJson(json)
      const rescored = rescoreAllJobs(imported.jobs, imported.profile)
      const next = { ...imported, jobs: rescored }
      persist(next)
      toast({ title: 'Import complete', description: 'Data restored from backup.', variant: 'success' })
    },
    [persist, toast],
  )

  const exportJson = React.useCallback(() => exportAppDataJson(data), [data])

  const resetAll = React.useCallback(() => {
    clearAppData()
    const empty = createEmptyAppData()
    persist(empty)
    toast({ title: 'Data reset', description: 'Local storage cleared.', variant: 'default' })
  }, [persist, toast])

  const updateJobsFeed = React.useCallback(
    (patch: Partial<JobsFeedPersistedState>) => {
      const current = data.jobsFeed ?? { ...DEFAULT_JOBS_FEED }
      persist({ ...data, jobsFeed: { ...current, ...patch } })
    },
    [data, persist],
  )

  const saveJobView = React.useCallback(
    (view: Omit<SavedJobsView, 'id'>) => {
      const v: SavedJobsView = { ...view, id: createJobId() }
      persist({
        ...data,
        savedJobViews: [...(data.savedJobViews ?? []), v],
        jobsFeed: { ...(data.jobsFeed ?? { ...DEFAULT_JOBS_FEED }), activeViewId: v.id },
      })
      toast({ title: 'View saved', description: `"${v.name}" is stored locally.`, variant: 'success' })
    },
    [data, persist, toast],
  )

  const deleteJobView = React.useCallback(
    (id: string) => {
      const jf = data.jobsFeed ?? { ...DEFAULT_JOBS_FEED }
      persist({
        ...data,
        savedJobViews: (data.savedJobViews ?? []).filter((x) => x.id !== id),
        jobsFeed:
          jf.activeViewId === id ? { ...jf, activeViewId: null } : jf,
      })
      toast({ title: 'View removed', variant: 'default' })
    },
    [data, persist, toast],
  )

  const value = React.useMemo(
    () => ({
      data,
      setData: (u: React.SetStateAction<AppData>) => {
        const next = typeof u === 'function' ? u(data) : u
        persist(next)
      },
      updateProfile,
      recalculateAllMatchScores,
      addCompany,
      updateCompany,
      deleteCompany,
      scanCompany,
      pasteHtmlForCompany,
      addManualJob,
      updateJob,
      deleteJob,
      importJson,
      exportJson,
      resetAll,
      updateJobsFeed,
      saveJobView,
      deleteJobView,
    }),
    [
      data,
      persist,
      updateProfile,
      recalculateAllMatchScores,
      addCompany,
      updateCompany,
      deleteCompany,
      scanCompany,
      pasteHtmlForCompany,
      addManualJob,
      updateJob,
      deleteJob,
      importJson,
      exportJson,
      resetAll,
      updateJobsFeed,
      saveJobView,
      deleteJobView,
    ],
  )

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

export function useAppState() {
  const ctx = React.useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState must be used within AppStateProvider')
  return ctx
}
