/**
 * Frontend API client — wraps all calls to the backend REST API.
 * Falls back to an error boundary if the backend is unreachable.
 */

const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? 'http://localhost:3001'
const TOKEN_KEY = 'job-search-auth-token'

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem(TOKEN_KEY)
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function request<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const url = `${API_BASE}${path}`
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders(), ...options?.headers },
    ...options,
  })
  if (res.status === 401) {
    // Token expired or invalid — clear it and let the app redirect to login
    localStorage.removeItem(TOKEN_KEY)
    window.dispatchEvent(new Event('auth:expired'))
    throw new Error('Session expired. Please log in again.')
  }
  const json = await res.json() as { ok: boolean; error?: string; message?: string } & T
  if (!res.ok || !json.ok) {
    // Some endpoints (e.g. scan) return failure details in `message`, not `error`
    throw new Error(json.error ?? json.message ?? `API error ${res.status}`)
  }
  return json
}

function get<T>(path: string) {
  return request<T>(path, { method: 'GET' })
}

function post<T>(path: string, body?: unknown) {
  return request<T>(path, { method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined })
}

function put<T>(path: string, body: unknown) {
  return request<T>(path, { method: 'PUT', body: JSON.stringify(body) })
}

function del<T = { ok: boolean }>(path: string) {
  return request<T>(path, { method: 'DELETE' })
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export const profileApi = {
  get: () => get<{ profile: ApiProfile }>('/api/profile'),
  update: (data: Partial<ApiSearchProfile> & { fullName?: string; email?: string; linkedinUrl?: string }) =>
    put<{ profile: ApiProfile; rescored: number }>('/api/profile', data),
}

// ─── Companies ────────────────────────────────────────────────────────────────

export const companiesApi = {
  list: () => get<{ companies: ApiCompany[] }>('/api/companies'),
  get: (id: number) => get<{ company: ApiCompany }>(`/api/companies/${id}`),
  create: (data: { name: string; careersUrl?: string; companyDomain?: string; priority?: string; notes?: string }) =>
    post<{ company: ApiCompany }>('/api/companies', data),
  update: (id: number, data: Partial<ApiCompany>) =>
    put<{ company: ApiCompany }>(`/api/companies/${id}`, data),
  delete: (id: number) => del(`/api/companies/${id}`),
  scan: (id: number) => post<ApiScanResult>(`/api/companies/${id}/scan`),
  pasteHtml: (id: number, html: string, baseUrl?: string) =>
    post<ApiScanResult & { jobsCreated: number }>(`/api/companies/${id}/paste-html`, { html, baseUrl }),
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

export const jobsApi = {
  list: (params?: ApiJobsFilter) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
    return get<{ jobs: ApiJob[]; total: number }>(`/api/jobs${qs}`)
  },
  get: (id: number) => get<{ job: ApiJob }>(`/api/jobs/${id}`),
  create: (data: ApiCreateJobInput) => post<{ job: ApiJob }>('/api/jobs', data),
  update: (id: number, data: Partial<ApiJob>) => put<{ job: ApiJob }>(`/api/jobs/${id}`, data),
  delete: (id: number) => del(`/api/jobs/${id}`),
  getScore: (id: number) => get<{ score: ApiScoreResult }>(`/api/jobs/${id}/score`),
  getAssets: (id: number) => get<{ assets: ApiGeneratedAsset[] }>(`/api/jobs/${id}/assets`),
  getNotes: (id: number) => get<{ notes: ApiJobNote[] }>(`/api/jobs/${id}/notes`),
  addNote: (id: number, content: string, noteType?: string) =>
    post<{ note: ApiJobNote }>(`/api/jobs/${id}/notes`, { content, noteType }),
  runAgent: (id: number, agentType: ApiAgentType, body?: unknown) =>
    post<{ result: unknown }>(`/api/jobs/${id}/run-agent/${agentType}`, body),
}

// ─── Resumes ──────────────────────────────────────────────────────────────────

export interface ApiExtractedProfile {
  fullName: string
  email: string
  linkedinUrl: string
  personalSummary: string
  targetTitles: string[]
  targetSeniority: string[]
  preferredFunctions: string[]
  preferredIndustries: string[]
  preferredGeographies: string[]
  keywordsBoost: string[]
  remotePreference: 'remote_first' | 'hybrid_ok' | 'onsite_ok' | 'flexible'
  idealCompanyStage: string[]
}

export const resumesApi = {
  list: () => get<{ resumes: ApiResume[] }>('/api/resumes'),
  get: (id: number) => get<{ resume: ApiResume }>(`/api/resumes/${id}`),
  create: (data: { title: string; rawText?: string; isBaseResume?: boolean }) =>
    post<{ resume: ApiResume }>('/api/resumes', data),
  update: (id: number, data: Partial<ApiResume>) =>
    put<{ resume: ApiResume }>(`/api/resumes/${id}`, data),
  delete: (id: number) => del(`/api/resumes/${id}`),

  upload: async (file: File, title?: string, isBaseResume?: boolean): Promise<{ resume: ApiResume; charCount: number }> => {
    const form = new FormData()
    form.append('file', file)
    if (title) form.append('title', title)
    if (isBaseResume) form.append('isBaseResume', 'true')
    const token = localStorage.getItem('job-search-auth-token')
    const res = await fetch(`${API_BASE}/api/resumes/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    })
    if (res.status === 401) {
      localStorage.removeItem('job-search-auth-token')
      window.dispatchEvent(new Event('auth:expired'))
      throw new Error('Session expired. Please log in again.')
    }
    const json = await res.json() as { ok: boolean; error?: string; resume: ApiResume; charCount: number }
    if (!res.ok || !json.ok) throw new Error(json.error ?? `Upload failed: ${res.status}`)
    return json
  },

  extractProfile: (id: number) =>
    post<{ extracted: ApiExtractedProfile }>(`/api/resumes/${id}/extract-profile`),
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export const dashboardApi = {
  getStats: () => get<ApiDashboardStats>('/api/dashboard/stats'),
  getNotifications: () => get<{ notifications: ApiNotification[] }>('/api/dashboard/notifications'),
  markNotificationRead: (id: number) => post(`/api/dashboard/notifications/${id}/read`),
  markAllNotificationsRead: () => post('/api/dashboard/notifications/read-all'),
}

// ─── Agents ───────────────────────────────────────────────────────────────────

export const agentsApi = {
  getRuns: (params?: { agentType?: string; status?: string; limit?: string }) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
    return get<{ runs: ApiAgentRun[] }>(`/api/agents/runs${qs}`)
  },
  getScanRuns: (params?: { companyId?: string; status?: string; limit?: string }) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
    return get<{ runs: ApiScanRun[] }>(`/api/agents/scan-runs${qs}`)
  },
  scanAll: () => post<{ results: ApiScanResult[] }>('/api/agents/scan-all'),
  discoverCompanies: () =>
    post<{
      suggestions: ApiCompanySuggestion[]
      source: 'ai' | 'curated'
      message: string
    }>('/api/agents/discover-companies'),
  getStatus: () => get<ApiAgentsStatus>('/api/agents/status'),
  getAllAssets: (params?: { assetType?: string; limit?: string }) => {
    const qs = params ? '?' + new URLSearchParams(params as Record<string, string>).toString() : ''
    return get<{ assets: ApiGeneratedAsset[] }>(`/api/agents/assets${qs}`)
  },
  getSettings: () => get<{ settings: ApiAppSettings }>('/api/agents/settings'),
  updateSettings: (data: Partial<ApiAppSettings>) =>
    put<{ settings: ApiAppSettings }>('/api/agents/settings', data),
  inferCareersUrl: (companyName: string) =>
    post<{ careersUrl: string; atsProvider: string; companyDomain: string; confidence: string }>(
      '/api/agents/infer-careers-url',
      { companyName },
    ),
}

// ─── Import/Export ────────────────────────────────────────────────────────────

export const dataApi = {
  export: async () => {
    const res = await fetch(`${API_BASE}/api/export`, { method: 'GET' })
    if (!res.ok) throw new Error(`Export failed: ${res.status}`)
    return await res.json() as Record<string, unknown>
  },
  import: (data: unknown, clearExisting = false) =>
    post<{ ok: boolean; imported: Record<string, number> }>('/api/import', { data, clearExisting }),
}

// ─── Health ───────────────────────────────────────────────────────────────────

export const healthApi = {
  check: () => get<{ ok: boolean; status: string; timestamp: string }>('/api/health'),
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ApiAgentType = 'fit_analysis' | 'resume_tailoring' | 'outreach' | 'interview_prep'

export interface ApiProfile {
  id: number
  fullName: string
  email: string
  linkedinUrl: string
  preferredTitlesJson: string
  excludedTitlesJson: string
  seniorityLevel: string
  preferredFunctionsJson: string
  preferredIndustriesJson: string
  preferredLocationsJson: string
  remotePreference: string
  idealCompanyStageJson: string
  targetKeywordsJson: string
  excludedKeywordsJson: string
  compensationNotes: string
  summary: string
  updatedAt: string
}

export interface ApiSearchProfile {
  targetTitles: string[]
  excludedTitles: string[]
  targetSeniority: string[]
  preferredFunctions: string[]
  preferredIndustries: string[]
  preferredGeographies: string[]
  remotePreference: 'remote_first' | 'hybrid_ok' | 'onsite_ok' | 'flexible'
  idealCompanyStage: string[]
  keywordsBoost: string[]
  keywordsPenalize: string[]
  compensationNotes: string
  personalSummary: string
}

export interface ApiCompany {
  id: number
  name: string
  companyDomain: string
  careersUrl: string
  priority: string
  notes: string
  active: boolean
  createdAt: string
  updatedAt: string
  sources?: ApiCompanySource[]
  jobsFoundCount?: number
  lastScan?: ApiScanRun | null
}

export interface ApiCompanySource {
  id: number
  companyId: number
  sourceType: string
  sourceUrl: string
  atsProvider: string
  active: boolean
  lastCheckedAt: string | null
}

export interface ApiJob {
  id: number
  companyId: number | null
  title: string
  location: string
  department: string
  employmentType: string
  descriptionRaw: string
  descriptionClean: string
  jobUrl: string
  sourceType: string
  sourceLabel: string
  postedAt: string | null
  discoveredAt: string
  isActive: boolean
  normalizedKey: string
  status: string
  notes: string
  tagsJson: string
  company?: { id: number; name: string; priority: string } | null
  match?: ApiJobMatch | null
  generatedAssets?: Array<{ id: number; assetType: string; createdAt: string }>
  jobNotes?: ApiJobNote[]
  agentRuns?: ApiAgentRun[]
  activityLogs?: ApiActivityLog[]
}

export interface ApiJobMatch {
  id: number
  jobPostingId: number
  fitScore: number
  fitLabel: string
  scoreBreakdownJson: string
  matchingReasonsJson: string
  concernsJson: string
  redFlagsJson: string
  fitSummary: string
  insightSnippet: string
  strengthsJson: string
  recommendedResumePointsJson: string
}

export interface ApiJobNote {
  id: number
  jobPostingId: number
  noteType: string
  content: string
  createdAt: string
  updatedAt: string
}

export interface ApiGeneratedAsset {
  id: number
  jobPostingId: number
  resumeId: number | null
  assetType: string
  content: string
  version: number
  modelName: string
  createdAt: string
  updatedAt: string
  jobPosting?: { id: number; title: string; companyId: number | null }
}

export interface ApiCompanySuggestion {
  name: string
  careersUrl: string
  companyDomain: string
  atsProvider: 'greenhouse' | 'lever' | 'ashby' | 'workable' | 'other'
  whyRelevant: string
  priority: 'high' | 'medium'
}

export interface ApiAgentRun {
  id: number
  jobPostingId: number | null
  agentType: string
  status: string
  inputJson: string
  outputJson: string
  startedAt: string
  completedAt: string | null
  errorMessage: string
  jobPosting?: { id: number; title: string } | null
}

export interface ApiScanRun {
  id: number
  companyId: number | null
  sourceId: number | null
  status: string
  jobsFound: number
  jobsCreated: number
  jobsUpdated: number
  jobsMarkedInactive: number
  method: string
  message: string
  startedAt: string
  completedAt: string | null
  errorMessage: string
  company?: { id: number; name: string } | null
}

export interface ApiScanResult {
  ok: boolean
  message: string
  warnings: string[]
  jobsFound: number
  jobsCreated: number
  jobsUpdated: number
  companyId?: number
  companyName?: string
  scanRunId?: number
}

export interface ApiResume {
  id: number
  title: string
  rawText: string
  filePath: string
  isBaseResume: boolean
  createdAt: string
  updatedAt: string
}

export interface ApiNotification {
  id: number
  jobPostingId: number | null
  channel: string
  message: string
  status: string
  sentAt: string | null
  createdAt: string
  jobPosting?: { id: number; title: string } | null
}

export interface ApiActivityLog {
  id: number
  entityType: string
  entityId: string
  action: string
  metadataJson: string
  createdAt: string
}

export interface ApiScoreResult {
  total: number
  breakdown: Record<string, unknown>
  dimensions: Array<{ id: string; label: string; score: number; max: number; explanation: string }>
  fitSummary: string
  strengths: string[]
  concerns: string[]
  insightSnippet: string
  redFlags: string[]
}

export interface ApiDashboardStats {
  ok: boolean
  stats: {
    totalJobs: number
    relevantJobs: number
    companiesCount: number
    newJobsThisWeek: number
    highMatchCount: number
    awaitingReviewCount: number
    appliedCount: number
    interviewingCount: number
    withGeneratedPrepCount: number
    unreadNotifications: number
    minScore: number
  }
  topMatches: ApiJob[]
  recentScans: ApiScanRun[]
  failedScans: ApiScanRun[]
  recentAgentRuns: ApiAgentRun[]
  statusBreakdown: Array<{ status: string; count: number }>
}

export interface ApiAgentsStatus {
  ok: boolean
  aiEnabled: boolean
  totalRuns: number
  failedRuns: number
  pendingRuns: number
  recentRuns: ApiAgentRun[]
}

export interface ApiAppSettings {
  id: number
  minRelevantScore: number
  autoScanIntervalHours: number
  autoRunFitAnalysis: boolean
  fitAnalysisThreshold: number
  jobsFeedJson: string
  savedJobViewsJson: string
}

export interface ApiJobsFilter {
  q?: string
  status?: string
  source?: string
  company?: string
  location?: string
  minScore?: string
  maxScore?: string
  sort?: string
  hideOutsideProfileGeos?: string
  page?: string
  limit?: string
}

export interface ApiCreateJobInput {
  title: string
  company?: string
  location?: string
  description?: string
  sourceType?: string
  sourceUrl?: string
  status?: string
  notes?: string
  tags?: string[]
  companyId?: number
  department?: string
  employmentType?: string
  datePosted?: string
}
