import { BookmarkPlus, Briefcase, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { JobCard } from '@/components/job/JobCard'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { DEFAULT_JOBS_FEED, JOB_STATUS_LABELS, MIN_RELEVANT_MATCH_SCORE } from '@/domain/constants'
import { JOB_SOURCE_LABELS } from '@/domain/types'
import type { JobSourceType, JobStatus, JobsFeedSort, SavedJobsView } from '@/domain/types'
import { useAppState } from '@/context/app-state'
import { jobMatchesPreferredGeographies } from '@/services/scoring/matchEngine'
import { Link } from 'react-router-dom'

function filtersFromView(v: SavedJobsView) {
  return {
    q: v.q,
    source: v.source,
    status: v.status,
    company: v.company,
    location: v.location,
    minScore: v.minScore,
    sort: v.sort,
    hideOutsideProfileGeos: v.hideOutsideProfileGeos ?? DEFAULT_JOBS_FEED.hideOutsideProfileGeos,
  }
}

export function JobsFeedPage() {
  const { data, updateJobsFeed, saveJobView, deleteJobView } = useAppState()
  const hydrated = useRef(false)

  const [q, setQ] = useState('')
  const [source, setSource] = useState<string>('all')
  const [status, setStatus] = useState<string>('all')
  const [company, setCompany] = useState('')
  const [location, setLocation] = useState('')
  const [minScore, setMinScore] = useState('')
  const [sort, setSort] = useState<JobsFeedSort>('score')
  const [hideOutsideProfileGeos, setHideOutsideProfileGeos] = useState(
    DEFAULT_JOBS_FEED.hideOutsideProfileGeos,
  )
  const [activeViewId, setActiveViewId] = useState<string | null>(null)
  const [newViewName, setNewViewName] = useState('')

  useEffect(() => {
    if (hydrated.current) return
    hydrated.current = true
    const f = data.jobsFeed ?? DEFAULT_JOBS_FEED
    queueMicrotask(() => {
      setQ(f.q)
      setSource(f.source)
      setStatus(f.status)
      setCompany(f.company)
      setLocation(f.location)
      setMinScore(f.minScore)
      setSort(f.sort)
      setHideOutsideProfileGeos(
        f.hideOutsideProfileGeos ?? DEFAULT_JOBS_FEED.hideOutsideProfileGeos,
      )
      setActiveViewId(f.activeViewId ?? null)
    })
  }, [data.jobsFeed])

  useEffect(() => {
    if (!hydrated.current) return
    const t = window.setTimeout(() => {
      updateJobsFeed({
        q,
        source,
        status,
        company,
        location,
        minScore,
        sort,
        hideOutsideProfileGeos,
        activeViewId,
      })
    }, 320)
    return () => window.clearTimeout(t)
  }, [
    q,
    source,
    status,
    company,
    location,
    minScore,
    sort,
    hideOutsideProfileGeos,
    activeViewId,
    updateJobsFeed,
  ])

  const applyView = useCallback(
    (v: SavedJobsView) => {
      const f = filtersFromView(v)
      setQ(f.q)
      setSource(f.source)
      setStatus(f.status)
      setCompany(f.company)
      setLocation(f.location)
      setMinScore(f.minScore)
      setSort(f.sort)
      setHideOutsideProfileGeos(f.hideOutsideProfileGeos)
      setActiveViewId(v.id)
    },
    [],
  )

  const clearActiveView = useCallback(() => {
    setActiveViewId(null)
  }, [])

  const snapshotForSave = useCallback(
    (): Omit<SavedJobsView, 'id' | 'name'> => ({
      q,
      source,
      status,
      company,
      location,
      minScore,
      sort,
      hideOutsideProfileGeos,
    }),
    [q, source, status, company, location, minScore, sort, hideOutsideProfileGeos],
  )

  const handleSaveView = () => {
    const name = newViewName.trim()
    if (!name) return
    saveJobView({ name, ...snapshotForSave() })
    setNewViewName('')
  }

  const savedViews = data.savedJobViews ?? []

  const filtered = useMemo(() => {
    let list = [...data.jobs]
    const qq = q.trim().toLowerCase()
    if (qq) {
      list = list.filter(
        (j) =>
          j.title.toLowerCase().includes(qq) ||
          j.company.toLowerCase().includes(qq) ||
          j.description.toLowerCase().includes(qq) ||
          j.tags.some((t) => t.toLowerCase().includes(qq)),
      )
    }
    if (source !== 'all') {
      list = list.filter((j) => j.sourceType === source)
    }
    if (status !== 'all') {
      list = list.filter((j) => j.status === status)
    }
    const c = company.trim().toLowerCase()
    if (c) list = list.filter((j) => j.company.toLowerCase().includes(c))
    const loc = location.trim().toLowerCase()
    if (loc) list = list.filter((j) => j.location.toLowerCase().includes(loc))
    if (
      hideOutsideProfileGeos &&
      data.profile.preferredGeographies.filter((g) => g.trim()).length > 0
    ) {
      list = list.filter((j) => jobMatchesPreferredGeographies(j, data.profile))
    }
    const ms = Number(minScore)
    if (!Number.isNaN(ms) && minScore !== '') {
      list = list.filter((j) => j.score >= ms)
    }
    list.sort((a, b) => {
      if (sort === 'score') return b.score - a.score
      if (sort === 'dateFound') return b.dateFound.localeCompare(a.dateFound)
      const ap = a.datePosted ?? ''
      const bp = b.datePosted ?? ''
      return bp.localeCompare(ap)
    })
    return list
  }, [
    data.jobs,
    data.profile,
    q,
    source,
    status,
    company,
    location,
    minScore,
    sort,
    hideOutsideProfileGeos,
  ])

  const resetFilters = () => {
    setQ('')
    setSource('all')
    setStatus('all')
    setCompany('')
    setLocation('')
    setMinScore(String(MIN_RELEVANT_MATCH_SCORE))
    setSort('score')
    setHideOutsideProfileGeos(DEFAULT_JOBS_FEED.hideOutsideProfileGeos)
    setActiveViewId(null)
  }

  /** Surface newly scanned jobs that fall below Min score or geo filter. */
  const showAllSavedJobs = useCallback(() => {
    setQ('')
    setSource('all')
    setStatus('all')
    setCompany('')
    setLocation('')
    setMinScore('')
    setSort('dateFound')
    setHideOutsideProfileGeos(false)
    setActiveViewId(null)
  }, [])

  return (
    <>
      <PageHeader
        title="Jobs feed"
        description={`By default only roles scoring ${MIN_RELEVANT_MATCH_SCORE}+ are shown. Clear Min score to list every saved job (e.g. bulk review). Filters persist in this browser.`}
      />

      {data.jobs.length > 0 &&
      (minScore === '' ||
        Number.isNaN(Number(minScore)) ||
        Number(minScore) < MIN_RELEVANT_MATCH_SCORE) ? (
        <div className="mb-4 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-4 py-3 text-sm text-muted-foreground">
          <span className="font-medium text-amber-200/90">Tip:</span> You are seeing low-fit roles too.
          Set <strong className="text-foreground">Min score</strong> to at least {MIN_RELEVANT_MATCH_SCORE}{' '}
          (or use <strong className="text-foreground">Reset filters</strong>) to match the dashboard.
          Scores use your saved profile — update on{' '}
          <Link to="/profile" className="text-primary underline-offset-4 hover:underline">
            Profile
          </Link>{' '}
          and <strong className="text-foreground">Save &amp; re-score all jobs</strong>.
        </div>
      ) : null}

      <div className="mb-4 flex flex-col gap-3 rounded-xl border border-border/80 bg-card/50 p-4 shadow-sm backdrop-blur-sm sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:max-w-md">
          <Label className="text-xs text-muted-foreground">Saved views</Label>
          <div className="flex flex-wrap gap-2">
            <Select
              value={activeViewId ?? '__custom__'}
              onValueChange={(val) => {
                if (val === '__custom__') {
                  clearActiveView()
                  return
                }
                const v = savedViews.find((x) => x.id === val)
                if (v) applyView(v)
              }}
            >
              <SelectTrigger className="h-9 w-[220px]">
                <SelectValue placeholder="Custom filters" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__custom__">Custom (ad-hoc)</SelectItem>
                {savedViews.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeViewId ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9"
                onClick={() => {
                  const id = activeViewId
                  setActiveViewId(null)
                  deleteJobView(id)
                }}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Delete view
              </Button>
            ) : null}
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-2 sm:max-w-sm">
          <Label htmlFor="save-view-name" className="text-xs text-muted-foreground">
            Save current filters as…
          </Label>
          <div className="flex gap-2">
            <Input
              id="save-view-name"
              placeholder="e.g. Remote staff+ only"
              value={newViewName}
              onChange={(e) => setNewViewName(e.target.value)}
              className="h-9"
            />
            <Button type="button" size="sm" className="h-9 shrink-0" onClick={handleSaveView}>
              <BookmarkPlus className="mr-1 h-4 w-4" />
              Save
            </Button>
          </div>
        </div>
      </div>

      <div className="mb-6 grid gap-4 rounded-xl border border-border/80 bg-card/30 p-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        <div className="flex items-start gap-3 rounded-md border border-border/50 bg-muted/15 px-3 py-2.5 sm:col-span-2 lg:col-span-4 xl:col-span-6">
          <Checkbox
            id="geo-profile-filter"
            checked={hideOutsideProfileGeos}
            onCheckedChange={(c) => {
              setHideOutsideProfileGeos(c === true)
              if (activeViewId) setActiveViewId(null)
            }}
            className="mt-0.5"
          />
          <label
            htmlFor="geo-profile-filter"
            className="cursor-pointer text-sm leading-snug text-muted-foreground"
          >
            <span className="font-medium text-foreground">Match profile geographies</span>
            {' — '}
            When your Profile lists preferred regions, hide jobs that never mention any of them in the
            role’s <strong className="text-foreground">title or location line</strong> (not buried in
            full-page HTML). Turn off to see every saved role.
          </label>
        </div>
        <div className="sm:col-span-2 lg:col-span-2">
          <Label htmlFor="job-q" className="text-xs text-muted-foreground">
            Search
          </Label>
          <Input
            id="job-q"
            placeholder="Title, company, tags…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              if (activeViewId) setActiveViewId(null)
            }}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Source</Label>
          <Select
            value={source}
            onValueChange={(v) => {
              setSource(v)
              if (activeViewId) setActiveViewId(null)
            }}
          >
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All sources</SelectItem>
              {(Object.keys(JOB_SOURCE_LABELS) as JobSourceType[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {JOB_SOURCE_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Status</Label>
          <Select
            value={status}
            onValueChange={(v) => {
              setStatus(v)
              if (activeViewId) setActiveViewId(null)
            }}
          >
            <SelectTrigger className="mt-1">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {(Object.keys(JOB_STATUS_LABELS) as JobStatus[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {JOB_STATUS_LABELS[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="job-co" className="text-xs text-muted-foreground">
            Company contains
          </Label>
          <Input
            id="job-co"
            value={company}
            onChange={(e) => {
              setCompany(e.target.value)
              if (activeViewId) setActiveViewId(null)
            }}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="job-loc" className="text-xs text-muted-foreground">
            Location contains
          </Label>
          <Input
            id="job-loc"
            value={location}
            onChange={(e) => {
              setLocation(e.target.value)
              if (activeViewId) setActiveViewId(null)
            }}
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="job-min" className="text-xs text-muted-foreground">
            Min score (default {MIN_RELEVANT_MATCH_SCORE})
          </Label>
          <Input
            id="job-min"
            type="number"
            min={0}
            max={100}
            placeholder={String(MIN_RELEVANT_MATCH_SCORE)}
            value={minScore}
            onChange={(e) => {
              setMinScore(e.target.value)
              if (activeViewId) setActiveViewId(null)
            }}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs text-muted-foreground">Sort by</Label>
          <Select
            value={sort}
            onValueChange={(v) => {
              setSort(v as JobsFeedSort)
              if (activeViewId) setActiveViewId(null)
            }}
          >
            <SelectTrigger className="mt-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="score">Match score</SelectItem>
              <SelectItem value="dateFound">Date found</SelectItem>
              <SelectItem value="datePosted">Date posted</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end">
          <Button type="button" variant="ghost" className="w-full" onClick={resetFilters}>
            Reset filters
          </Button>
        </div>
      </div>

      <p className="mb-4 text-sm text-muted-foreground">
        Showing <span className="font-medium text-foreground">{filtered.length}</span> of{' '}
        {data.jobs.length} jobs
        {activeViewId ? (
          <span className="ml-2 text-primary">
            · View: {savedViews.find((v) => v.id === activeViewId)?.name ?? '—'}
          </span>
        ) : null}
      </p>

      {filtered.length === 0 ? (
        data.jobs.length > 0 ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/[0.08] px-4 py-5 text-sm text-muted-foreground">
            <p className="font-display text-base font-semibold text-foreground">
              You have {data.jobs.length} saved job(s), but none match the current filters
            </p>
            <p className="mt-2 leading-relaxed">
              After a scan, new roles are often hidden because: (1){' '}
              <strong className="text-foreground">Min score</strong> defaults to {MIN_RELEVANT_MATCH_SCORE}
              + while fresh matches can score lower; (2){' '}
              <strong className="text-foreground">Match profile geographies</strong> hides roles whose
              title/location line doesn’t include your keywords (e.g. Israel).
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={showAllSavedJobs}>
                Show all saved jobs
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={resetFilters}>
                Reset filters (defaults)
              </Button>
            </div>
          </div>
        ) : (
          <EmptyState
            icon={Briefcase}
            title="No jobs match"
            description="Relax filters or add roles from Companies / Manual Intake."
          />
        )
      ) : (
        <div className="space-y-4">
          {filtered.map((j) => (
            <JobCard key={j.id} job={j} />
          ))}
        </div>
      )}
    </>
  )
}
