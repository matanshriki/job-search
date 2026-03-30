import { Copy, ExternalLink, Loader2, Play, ShieldAlert, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { InterviewPrepPanel } from '@/components/job/InterviewPrepPanel'
import { ScoreExplanationPanel } from '@/components/job/ScoreExplanationPanel'
import { SourceBadge } from '@/components/job/SourceBadge'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { JOB_STATUS_LABELS } from '@/domain/constants'
import type { Job, JobStatus } from '@/domain/types'
import { useAppState } from '@/context/app-state'
import { formatDate } from '@/lib/utils'
import { suggestTagsFromText } from '@/services/duplicateDetection'
import { scoreJobAgainstProfile, type FullScoreResult } from '@/services/scoring/matchEngine'
import {
  jobsApi,
  type ApiGeneratedAsset,
  type ApiJobNote,
  type ApiScoreResult,
  type ApiAgentType,
} from '@/services/api'
import { useToast } from '@/hooks/use-toast'
import { formatDistanceToNow } from 'date-fns'

// ─── Agent Runner ─────────────────────────────────────────────────────────────

function AgentButton({
  jobId,
  agentType,
  label,
  existingAsset,
  onComplete,
}: {
  jobId: number
  agentType: ApiAgentType
  label: string
  existingAsset?: ApiGeneratedAsset
  onComplete: () => void
}) {
  const { toast } = useToast()
  const [running, setRunning] = useState(false)

  const run = async () => {
    setRunning(true)
    try {
      await jobsApi.runAgent(jobId, agentType)
      onComplete()
      toast({ title: `${label} complete`, variant: 'success' })
    } catch (e) {
      toast({ title: `${label} failed`, description: String(e), variant: 'destructive' })
    } finally {
      setRunning(false)
    }
  }

  return (
    <Button size="sm" variant={existingAsset ? 'outline' : 'default'} onClick={() => void run()} disabled={running}>
      {running ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Play className="mr-2 h-3.5 w-3.5" />}
      {existingAsset ? `Re-run ${label}` : `Run ${label}`}
    </Button>
  )
}

// ─── Asset Display ────────────────────────────────────────────────────────────

function AssetSection({
  asset,
  fields,
}: {
  asset: ApiGeneratedAsset
  fields: Array<{ key: string; label: string; isList?: boolean }>
}) {
  const { toast } = useToast()
  let parsed: Record<string, unknown> | null = null
  try { parsed = JSON.parse(asset.content) } catch { /* raw content */ }

  if (!parsed) {
    return (
      <div className="space-y-2">
        <div className="flex justify-end">
          <Button variant="ghost" size="sm" onClick={() => { void navigator.clipboard.writeText(asset.content); toast({ title: 'Copied', variant: 'success' }) }}>
            <Copy className="mr-2 h-3.5 w-3.5" /> Copy
          </Button>
        </div>
        <pre className="whitespace-pre-wrap text-sm text-muted-foreground leading-relaxed">{asset.content}</pre>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="text-[10px]">
            {asset.modelName === 'mock' ? 'Mock output' : `${asset.modelName} · v${asset.version}`}
          </Badge>
          <span className="text-xs text-muted-foreground">{formatDate(asset.createdAt)}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => { void navigator.clipboard.writeText(asset.content); toast({ title: 'Copied raw JSON', variant: 'success' }) }}>
          <Copy className="mr-2 h-3.5 w-3.5" /> Copy
        </Button>
      </div>
      {fields.map(({ key, label, isList }) => {
        const val = parsed?.[key]
        if (val === undefined || val === null) return null
        return (
          <div key={key}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
            {isList && Array.isArray(val) ? (
              <ul className="space-y-2">
                {(val as string[]).map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary/60" />
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{String(val)}</p>
            )}
          </div>
        )
      })}
    </div>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data, updateJob, deleteJob } = useAppState()
  const { toast } = useToast()
  const job = data.jobs.find((j) => j.id === id)

  // API-backed data
  const jobApiId = job ? (job as Job & { _apiId?: number })._apiId ?? parseInt(id ?? '0', 10) : parseInt(id ?? '0', 10)
  const [assets, setAssets] = useState<ApiGeneratedAsset[]>([])
  const [notes, setNotes] = useState<ApiJobNote[]>([])
  const [liveScore, setLiveScore] = useState<ApiScoreResult | null>(null)
  const [loadingAssets, setLoadingAssets] = useState(true)
  const [newNoteText, setNewNoteText] = useState('')
  const [savingNote, setSavingNote] = useState(false)

  const loadJobData = async () => {
    if (!jobApiId) return
    try {
      const [assetsRes, notesRes, scoreRes] = await Promise.allSettled([
        jobsApi.getAssets(jobApiId),
        jobsApi.getNotes(jobApiId),
        jobsApi.getScore(jobApiId),
      ])
      if (assetsRes.status === 'fulfilled') setAssets(assetsRes.value.assets)
      if (notesRes.status === 'fulfilled') setNotes(notesRes.value.notes)
      if (scoreRes.status === 'fulfilled') setLiveScore(scoreRes.value.score)
    } catch (e) {
      console.warn('Could not load job detail data from API:', e)
    } finally {
      setLoadingAssets(false)
    }
  }

  useEffect(() => { void loadJobData() }, [jobApiId])

  const scored = useMemo<FullScoreResult | null>(() => {
    if (!job) return null
    if (liveScore) return liveScore as unknown as FullScoreResult
    return scoreJobAgainstProfile(job, data.profile)
  }, [job, data.profile, liveScore])

  const [notesText, setNotesText] = useState(job?.notes ?? '')
  const [tagsText, setTagsText] = useState((job?.tags ?? []).join(', '))

  useEffect(() => {
    if (!job) return
    setNotesText(job.notes)
    setTagsText(job.tags.join(', '))
  }, [job?.id])

  const trackedCompany = useMemo(() => {
    if (!job) return null
    if (job.companyId) {
      const byId = data.companies.find((c) => c.id === job.companyId)
      if (byId) return byId
    }
    const name = job.company.trim().toLowerCase()
    return data.companies.find((c) => c.name.trim().toLowerCase() === name) ?? null
  }, [job, data.companies])

  if (!job || !scored) {
    return (
      <>
        <PageHeader title="Job not found" description="This role may have been removed." />
        <Button asChild variant="secondary"><Link to="/jobs">Back to feed</Link></Button>
      </>
    )
  }

  const persistField = (patch: Partial<Job>) => {
    updateJob({ ...job, ...patch })
  }

  const suggestions = suggestTagsFromText(`${job.title} ${job.description}`, job.tags)

  const fitAsset = assets.find((a) => a.assetType === 'fit_analysis')
  const resumeAsset = assets.find((a) => a.assetType === 'resume_tailoring')
  const outreachAsset = assets.find((a) => a.assetType === 'outreach_message')
  const interviewAsset = assets.find((a) => a.assetType === 'interview_prep')

  const handleAddNote = async () => {
    if (!newNoteText.trim()) return
    setSavingNote(true)
    try {
      const res = await jobsApi.addNote(jobApiId, newNoteText)
      setNotes((prev) => [res.note, ...prev])
      setNewNoteText('')
    } catch (e) {
      toast({ title: 'Failed to add note', description: String(e), variant: 'destructive' })
    } finally {
      setSavingNote(false)
    }
  }

  return (
    <>
      <PageHeader
        title={job.title}
        description={`${job.company} · ${job.location}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {job.sourceUrl ? (
              <Button variant="outline" size="sm" asChild>
                <a href={job.sourceUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4 mr-1.5" /> Source
                </a>
              </Button>
            ) : null}
            <Button variant="destructive" size="sm" onClick={() => { deleteJob(job.id); navigate('/jobs') }}>
              Delete
            </Button>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <SourceBadge sourceType={job.sourceType} label={job.sourceLabel} />
        <Badge variant="secondary">{JOB_STATUS_LABELS[job.status as JobStatus]}</Badge>
        <span className="text-sm text-muted-foreground">
          Found {formatDate(job.dateFound)}
          {job.datePosted ? ` · Posted ${formatDate(job.datePosted)}` : ''}
        </span>
        {assets.length > 0 && (
          <Badge variant="outline" className="border-primary/30 text-primary text-[10px]">
            <Sparkles className="mr-1 h-3 w-3" /> {assets.length} assets
          </Badge>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Tabs workspace — left 2/3 */}
        <div className="lg:col-span-2">
          <Tabs defaultValue="overview">
            <TabsList className="mb-4 flex-wrap h-auto gap-1">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="score">Score</TabsTrigger>
              <TabsTrigger value="fit">Fit Analysis</TabsTrigger>
              <TabsTrigger value="resume">Resume</TabsTrigger>
              <TabsTrigger value="outreach">Outreach</TabsTrigger>
              <TabsTrigger value="interview">Interview Prep</TabsTrigger>
              <TabsTrigger value="notes">Notes</TabsTrigger>
              <TabsTrigger value="activity">Activity</TabsTrigger>
            </TabsList>

            {/* Overview */}
            <TabsContent value="overview" className="space-y-4">
              <Card>
                <CardHeader><CardTitle className="text-base">Role overview</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
                  {job.department ? <p><span className="font-medium text-foreground">Department:</span> {job.department}</p> : null}
                  {job.employmentType ? <p><span className="font-medium text-foreground">Employment:</span> {job.employmentType}</p> : null}
                  <Separator />
                  <p className="whitespace-pre-wrap text-foreground/90">{job.description}</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Sparkles className="h-4 w-4 text-primary" />
                    Quick insights
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-muted-foreground">
                  <p>{job.insightSnippet || scored.insightSnippet}</p>
                  <div>
                    <p className="mb-2 font-medium text-foreground">Strengths</p>
                    <ul className="list-inside list-disc space-y-1">
                      {(job.strengths.length ? job.strengths : scored.strengths).map((s) => <li key={s}>{s}</li>)}
                    </ul>
                  </div>
                  <div>
                    <p className="mb-2 font-medium text-foreground">Concerns</p>
                    <ul className="list-inside list-disc space-y-1">
                      {(job.concerns.length ? job.concerns : scored.concerns).map((s) => <li key={s}>{s}</li>)}
                    </ul>
                  </div>
                </CardContent>
              </Card>

              {((job.redFlags?.length ?? 0) > 0 || scored.redFlags.length > 0) ? (
                <Card className="border-amber-500/30 bg-amber-500/5">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-base text-amber-200">
                      <ShieldAlert className="h-4 w-4" /> Red flag hints
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="list-inside list-disc text-sm text-muted-foreground">
                      {[...new Set([...(job.redFlags ?? []), ...scored.redFlags])].map((s) => <li key={s}>{s}</li>)}
                    </ul>
                  </CardContent>
                </Card>
              ) : null}
            </TabsContent>

            {/* Score breakdown */}
            <TabsContent value="score">
              <ScoreExplanationPanel dimensions={scored.dimensions} total={scored.total} />
            </TabsContent>

            {/* Fit Analysis */}
            <TabsContent value="fit" className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {fitAsset ? 'AI-generated fit analysis for this role.' : 'No fit analysis yet — run the agent below.'}
                </p>
                <AgentButton
                  jobId={jobApiId}
                  agentType="fit_analysis"
                  label="Fit Analysis"
                  existingAsset={fitAsset}
                  onComplete={() => void loadJobData()}
                />
              </div>
              {fitAsset && (
                <AssetSection
                  asset={fitAsset}
                  fields={[
                    { key: 'fitSummary', label: 'Summary' },
                    { key: 'matchingReasons', label: 'Matching reasons', isList: true },
                    { key: 'concerns', label: 'Concerns', isList: true },
                    { key: 'missingSignals', label: 'Missing signals', isList: true },
                    { key: 'recommendedResumePoints', label: 'Recommended resume points', isList: true },
                  ]}
                />
              )}
            </TabsContent>

            {/* Resume Tailoring */}
            <TabsContent value="resume" className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {resumeAsset ? 'Tailored resume suggestions for this role.' : 'No resume tailoring yet.'}
                </p>
                <AgentButton
                  jobId={jobApiId}
                  agentType="resume_tailoring"
                  label="Resume Tailor"
                  existingAsset={resumeAsset}
                  onComplete={() => void loadJobData()}
                />
              </div>
              {resumeAsset && (
                <AssetSection
                  asset={resumeAsset}
                  fields={[
                    { key: 'tailoredSummary', label: 'Tailored summary' },
                    { key: 'prioritizedBullets', label: 'Prioritized bullets to emphasize', isList: true },
                    { key: 'suggestedEdits', label: 'Suggested edits', isList: true },
                    { key: 'keywordsToInclude', label: 'Keywords to include', isList: true },
                  ]}
                />
              )}
            </TabsContent>

            {/* Outreach */}
            <TabsContent value="outreach" className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {outreachAsset ? 'Outreach messages generated for this role.' : 'No outreach generated yet.'}
                </p>
                <AgentButton
                  jobId={jobApiId}
                  agentType="outreach"
                  label="Outreach"
                  existingAsset={outreachAsset}
                  onComplete={() => void loadJobData()}
                />
              </div>
              {outreachAsset && (
                <AssetSection
                  asset={outreachAsset}
                  fields={[
                    { key: 'recruiterMessage', label: 'Recruiter message' },
                    { key: 'linkedinNote', label: 'LinkedIn connection note' },
                    { key: 'coverNote', label: 'Cover note' },
                    { key: 'networkingAngle', label: 'Networking angle' },
                  ]}
                />
              )}
            </TabsContent>

            {/* Interview Prep */}
            <TabsContent value="interview" className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {interviewAsset ? 'Interview prep materials generated.' : 'No interview prep yet.'}
                </p>
                <AgentButton
                  jobId={jobApiId}
                  agentType="interview_prep"
                  label="Interview Prep"
                  existingAsset={interviewAsset}
                  onComplete={() => void loadJobData()}
                />
              </div>
              {interviewAsset ? (
                <AssetSection
                  asset={interviewAsset}
                  fields={[
                    { key: 'intro60s', label: '60-second intro' },
                    { key: 'whyCompany', label: 'Why this company' },
                    { key: 'whyRole', label: 'Why this role' },
                    { key: 'recruiterQuestions', label: 'Likely recruiter questions', isList: true },
                    { key: 'hiringManagerQuestions', label: 'Likely hiring manager questions', isList: true },
                    { key: 'talkingPoints', label: 'Key talking points', isList: true },
                    { key: 'possibleObjections', label: 'Possible objections to address', isList: true },
                    { key: 'questionsToAsk', label: 'Questions to ask them', isList: true },
                  ]}
                />
              ) : job.status === 'interviewing' ? (
                <InterviewPrepPanel job={job} profile={data.profile} company={trackedCompany} />
              ) : (
                <p className="text-sm text-muted-foreground">
                  Move this job to <strong>Interviewing</strong> status (in the pipeline sidebar) to
                  unlock the legacy prep panel, or run the AI agent above for richer preparation.
                </p>
              )}
            </TabsContent>

            {/* Notes */}
            <TabsContent value="notes" className="space-y-4">
              <div className="space-y-3">
                <div>
                  <Label className="text-xs text-muted-foreground">Quick note</Label>
                  <div className="mt-1 flex gap-2">
                    <Textarea
                      value={newNoteText}
                      onChange={(e) => setNewNoteText(e.target.value)}
                      placeholder="Add a note…"
                      className="min-h-[72px]"
                    />
                  </div>
                  <Button
                    size="sm"
                    className="mt-2"
                    onClick={() => void handleAddNote()}
                    disabled={savingNote || !newNoteText.trim()}
                  >
                    {savingNote ? 'Saving…' : 'Add Note'}
                  </Button>
                </div>
                {notes.length > 0 && (
                  <div className="space-y-2 pt-2">
                    {notes.map((n) => (
                      <div key={n.id} className="rounded-lg border border-border/60 bg-muted/10 p-3 text-sm">
                        <p className="text-muted-foreground">{n.content}</p>
                        <p className="mt-1.5 text-xs text-muted-foreground/60">
                          {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
                {notes.length === 0 && !loadingAssets && (
                  <p className="text-sm text-muted-foreground">No notes yet.</p>
                )}
              </div>
            </TabsContent>

            {/* Activity */}
            <TabsContent value="activity">
              <div className="space-y-2">
                {/* Show agent runs for this job */}
                {assets.length > 0 && (
                  <div>
                    <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Generated assets</p>
                    {assets.map((a) => (
                      <div key={a.id} className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/40 p-3 mb-2">
                        <Sparkles className="h-4 w-4 shrink-0 text-primary" />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{a.assetType.replace('_', ' ')}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(a.createdAt)} · {a.modelName}</p>
                        </div>
                        <Badge variant="secondary" className="text-[10px]">v{a.version}</Badge>
                      </div>
                    ))}
                  </div>
                )}
                {assets.length === 0 && !loadingAssets && (
                  <p className="text-sm text-muted-foreground">No activity yet. Run agents to see output here.</p>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          <Card className="border-primary/25 bg-gradient-to-br from-primary/10 to-transparent">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Composite match</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center">
                <p className="font-display text-5xl font-bold text-primary">{job.score}</p>
                <p className="text-xs text-muted-foreground">out of 100</p>
              </div>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{job.fitSummary}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Pipeline</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Select value={job.status} onValueChange={(v) => persistField({ status: v as JobStatus })}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(JOB_STATUS_LABELS) as JobStatus[]).map((k) => (
                      <SelectItem key={k} value={k}>{JOB_STATUS_LABELS[k]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="notes-inline" className="text-xs text-muted-foreground">Notes</Label>
                <Textarea
                  id="notes-inline"
                  className="mt-1"
                  value={notesText}
                  onChange={(e) => setNotesText(e.target.value)}
                  onBlur={() => persistField({ notes: notesText })}
                />
              </div>
              <div>
                <Label htmlFor="tags-inline" className="text-xs text-muted-foreground">Tags (comma-separated)</Label>
                <Textarea
                  id="tags-inline"
                  className="mt-1 min-h-[72px]"
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  onBlur={() => persistField({ tags: tagsText.split(',').map((t) => t.trim()).filter(Boolean) })}
                />
                {suggestions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {suggestions.map((t) => (
                      <Button key={t} type="button" size="sm" variant="outline" className="h-7 text-xs"
                        onClick={() => {
                          const next = [...job.tags, t]
                          setTagsText(next.join(', '))
                          persistField({ tags: next })
                        }}
                      >+ {t}</Button>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Source</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground break-all">
              <p><span className="font-medium text-foreground">Label:</span> {job.sourceLabel}</p>
              <p><span className="font-medium text-foreground">URL:</span> {job.sourceUrl || '—'}</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}
