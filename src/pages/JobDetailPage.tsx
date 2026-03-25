import { ExternalLink, ShieldAlert, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
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
import { Textarea } from '@/components/ui/textarea'
import { JOB_STATUS_LABELS } from '@/domain/constants'
import type { Job, JobStatus, SearchProfile, TrackedCompany } from '@/domain/types'
import { useAppState } from '@/context/app-state'
import { formatDate } from '@/lib/utils'
import { suggestTagsFromText } from '@/services/duplicateDetection'
import { scoreJobAgainstProfile, type FullScoreResult } from '@/services/scoring/matchEngine'

function JobDetailBody({
  job,
  scored,
  profile,
  trackedCompany,
  updateJob,
  deleteJob,
  navigate,
}: {
  job: Job
  scored: FullScoreResult
  profile: SearchProfile
  trackedCompany: TrackedCompany | null
  updateJob: (j: Job) => void
  deleteJob: (id: string) => void
  navigate: ReturnType<typeof useNavigate>
}) {
  const [notes, setNotes] = useState(job.notes)
  const [tagsText, setTagsText] = useState(job.tags.join(', '))
  const prepRef = useRef<HTMLDivElement>(null)
  const prevStatus = useRef(job.status)

  useEffect(() => {
    if (job.status === 'interviewing' && prevStatus.current !== 'interviewing') {
      queueMicrotask(() =>
        prepRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
      )
    }
    prevStatus.current = job.status
  }, [job.status])

  const suggestions = suggestTagsFromText(
    `${job.title} ${job.description}`,
    job.tags,
  )

  const persistField = (patch: Partial<Job>) => {
    updateJob({ ...job, ...patch })
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
                  <ExternalLink className="h-4 w-4" />
                  Source
                </a>
              </Button>
            ) : null}
            <Button
              variant="destructive"
              size="sm"
              onClick={() => {
                deleteJob(job.id)
                navigate('/jobs')
              }}
            >
              Delete
            </Button>
          </div>
        }
      />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <SourceBadge sourceType={job.sourceType} label={job.sourceLabel} />
        <Badge variant="secondary">{JOB_STATUS_LABELS[job.status]}</Badge>
        <span className="text-sm text-muted-foreground">
          Found {formatDate(job.dateFound)}
          {job.datePosted ? ` · Posted ${formatDate(job.datePosted)}` : ''}
        </span>
      </div>

      {job.status === 'interviewing' ? (
        <div className="mb-6">
          <InterviewPrepPanel
            ref={prepRef}
            job={job}
            profile={profile}
            company={trackedCompany}
          />
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Role overview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
              {job.department ? (
                <p>
                  <span className="font-medium text-foreground">Department:</span> {job.department}
                </p>
              ) : null}
              {job.employmentType ? (
                <p>
                  <span className="font-medium text-foreground">Employment:</span>{' '}
                  {job.employmentType}
                </p>
              ) : null}
              <Separator />
              <p className="whitespace-pre-wrap text-foreground/90">{job.description}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" />
                Why this might be worth applying
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-muted-foreground">
              <p>{job.insightSnippet ?? scored.insightSnippet}</p>
              <div>
                <p className="mb-2 font-medium text-foreground">Strengths</p>
                <ul className="list-inside list-disc space-y-1">
                  {(job.strengths.length ? job.strengths : scored.strengths).map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="mb-2 font-medium text-foreground">Concerns</p>
                <ul className="list-inside list-disc space-y-1">
                  {(job.concerns.length ? job.concerns : scored.concerns).map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>

          {(job.redFlags?.length || scored.redFlags.length) ? (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base text-amber-200">
                  <ShieldAlert className="h-4 w-4" />
                  Red flag hints
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="list-inside list-disc text-sm text-muted-foreground">
                  {[...new Set([...(job.redFlags ?? []), ...scored.redFlags])].map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <div className="space-y-6">
          <div className="space-y-4">
            <Card className="border-primary/25 bg-gradient-to-br from-primary/10 to-transparent">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Composite match</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-center">
                  <p className="font-display text-5xl font-bold text-primary">{job.score}</p>
                  <p className="text-xs text-muted-foreground">out of 100 · locally computed</p>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{job.fitSummary}</p>
              </CardContent>
            </Card>
            <ScoreExplanationPanel
              dimensions={scored.dimensions}
              total={scored.total}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Pipeline</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Select
                  value={job.status}
                  onValueChange={(v) => persistField({ status: v as JobStatus })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(JOB_STATUS_LABELS) as JobStatus[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {JOB_STATUS_LABELS[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {job.status !== 'interviewing' ? (
                  <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                    When a meeting is booked, set status to{' '}
                    <span className="font-medium text-foreground">Interview scheduled</span> — a prep
                    panel with links, JD excerpt, and a checklist appears on this page.
                  </p>
                ) : null}
              </div>
              <div>
                <Label htmlFor="notes" className="text-xs text-muted-foreground">
                  Notes
                </Label>
                <Textarea
                  id="notes"
                  className="mt-1"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={() => persistField({ notes })}
                />
              </div>
              <div>
                <Label htmlFor="tags" className="text-xs text-muted-foreground">
                  Tags (comma-separated)
                </Label>
                <Textarea
                  id="tags"
                  className="mt-1 min-h-[72px]"
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  onBlur={() =>
                    persistField({
                      tags: tagsText
                        .split(',')
                        .map((t) => t.trim())
                        .filter(Boolean),
                    })
                  }
                />
                {suggestions.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {suggestions.map((t) => (
                      <Button
                        key={t}
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => {
                          const next = [...job.tags, t]
                          setTagsText(next.join(', '))
                          persistField({ tags: next })
                        }}
                      >
                        + {t}
                      </Button>
                    ))}
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Source</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground break-all">
              <p>
                <span className="font-medium text-foreground">Label:</span> {job.sourceLabel}
              </p>
              <p>
                <span className="font-medium text-foreground">URL:</span>{' '}
                {job.sourceUrl || '—'}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  )
}

export function JobDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data, updateJob, deleteJob } = useAppState()
  const job = data.jobs.find((j) => j.id === id)

  const scored = useMemo(() => {
    if (!job) return null
    return scoreJobAgainstProfile(job, data.profile)
  }, [job, data.profile])

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
        <Button asChild variant="secondary">
          <Link to="/jobs">Back to feed</Link>
        </Button>
      </>
    )
  }

  return (
    <JobDetailBody
      key={job.id}
      job={job}
      scored={scored}
      profile={data.profile}
      trackedCompany={trackedCompany}
      updateJob={updateJob}
      deleteJob={deleteJob}
      navigate={navigate}
    />
  )
}
