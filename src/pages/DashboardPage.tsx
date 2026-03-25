import { formatDistanceToNow } from 'date-fns'
import {
  ArrowUpRight,
  BarChart3,
  Briefcase,
  Building2,
  Layers,
  Sparkles,
  Target,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { JobCard } from '@/components/job/JobCard'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { JOB_STATUS_LABELS, MIN_RELEVANT_MATCH_SCORE } from '@/domain/constants'
import type { JobStatus } from '@/domain/types'
import { useAppState } from '@/context/app-state'
import { startOfWeekIso } from '@/lib/utils'
import { findDuplicateGroups } from '@/services/duplicateDetection'

function StatTile({
  label,
  value,
  sub,
  icon: Icon,
  to,
}: {
  label: string
  value: string | number
  sub?: string
  icon: typeof Building2
  to?: string
}) {
  const inner = (
    <Card className="h-full border-border/70 bg-card/60 shadow-sm backdrop-blur-sm transition-colors hover:border-primary/25">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {label}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground/80" />
      </CardHeader>
      <CardContent>
        <p className="font-display text-3xl font-semibold tracking-tight">{value}</p>
        {sub ? <p className="mt-1.5 text-xs text-muted-foreground">{sub}</p> : null}
        {to ? (
          <span className="mt-2 inline-flex items-center gap-0.5 text-xs font-medium text-primary">
            Open <ArrowUpRight className="h-3 w-3" />
          </span>
        ) : null}
      </CardContent>
    </Card>
  )
  return to ? (
    <Link to={to} className="block h-full">
      {inner}
    </Link>
  ) : (
    inner
  )
}

export function DashboardPage() {
  const { data } = useAppState()
  const weekStart = startOfWeekIso()
  const relevantJobs = data.jobs.filter((j) => j.score >= MIN_RELEVANT_MATCH_SCORE)
  const newThisWeek = relevantJobs.filter((j) => j.dateFound >= weekStart).length
  const topMatches = [...relevantJobs].sort((a, b) => b.score - a.score).slice(0, 3)
  const statusCounts = relevantJobs.reduce(
    (acc, j) => {
      acc[j.status] = (acc[j.status] ?? 0) + 1
      return acc
    },
    {} as Partial<Record<JobStatus, number>>,
  )
  const dupes = findDuplicateGroups(relevantJobs)
  const recentScans = data.scanHistory.slice(0, 6)
  const appliedPlus = (statusCounts.applied ?? 0) + (statusCounts.interviewing ?? 0)
  const totalSaved = data.jobs.length
  const relevantCount = relevantJobs.length

  return (
    <div className="space-y-10">
      <PageHeader
        title="Command overview"
        description="A single executive view of pipeline health, highest-fit roles, and recent sourcing activity. Everything stays on this device."
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Companies"
          value={data.companies.length}
          sub="Tracked employers"
          icon={Building2}
          to="/companies"
        />
        <StatTile
          label="Profile-aligned roles"
          value={relevantCount}
          sub={
            totalSaved > relevantCount
              ? `${MIN_RELEVANT_MATCH_SCORE}+ match score · ${totalSaved} total saved (lower scores hidden from this tile)`
              : `${newThisWeek} new this week (${MIN_RELEVANT_MATCH_SCORE}+)`
          }
          icon={Briefcase}
          to="/jobs"
        />
        <StatTile
          label="In motion"
          value={appliedPlus}
          sub="Applied + interviewing"
          icon={Target}
        />
        <StatTile
          label="Duplicate groups"
          value={dupes.length}
          sub="Same role × company × location"
          icon={Layers}
          to="/jobs"
        />
      </section>

      <section>
        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight">Top matches</h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Roles scoring {MIN_RELEVANT_MATCH_SCORE}+ against your profile (best first). The jobs feed
              defaults to the same floor; clear Min score there to browse everything you have saved.
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link to="/jobs">Full pipeline</Link>
          </Button>
        </div>

        {topMatches.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title={data.jobs.length === 0 ? 'No jobs yet' : 'No strong dashboard matches yet'}
            description={
              data.jobs.length === 0
                ? 'Add companies, run scans, or use Manual Intake. Your profile drives the match score.'
                : `None of your saved roles reach ${MIN_RELEVANT_MATCH_SCORE}/100+ for your current profile. Open the full list to review everything, or tighten targets on Profile.`
            }
            action={
              <Link to={data.jobs.length === 0 ? '/intake' : '/jobs'} className="text-sm font-medium text-primary hover:underline">
                {data.jobs.length === 0 ? 'Manual intake' : 'Browse all jobs'}
              </Link>
            }
          />
        ) : (
          <div className="space-y-5">
            {topMatches.map((j, i) => (
              <JobCard key={j.id} job={j} variant="featured" rank={i + 1} />
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-5">
        <Card className="border-border/80 bg-card/50 lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <BarChart3 className="h-4 w-4 text-primary" />
              Pipeline by status
            </CardTitle>
            <CardDescription className="text-xs">
              Match score {MIN_RELEVANT_MATCH_SCORE}+ only — same default as the jobs feed.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(Object.keys(JOB_STATUS_LABELS) as JobStatus[]).map((s) => {
              const n = statusCounts[s] ?? 0
              const total = relevantJobs.length || 1
              const pct = Math.round((n / total) * 100)
              return (
                <div key={s} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{JOB_STATUS_LABELS[s]}</span>
                    <span className="tabular-nums font-medium">{n}</span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary/70"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        <Card className="border-border/80 bg-card/50 lg:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Recent scans</CardTitle>
            <p className="text-xs text-muted-foreground">
              Latest fetch attempts across tracked companies — includes failures for transparency.
            </p>
          </CardHeader>
          <CardContent>
            {recentScans.length === 0 ? (
              <p className="text-sm text-muted-foreground">No scans recorded yet.</p>
            ) : (
              <div className="max-h-[320px] space-y-3 overflow-y-auto pr-1">
                {recentScans.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-lg border border-border/60 bg-muted/10 p-3 text-sm"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <p className="font-medium">{r.companyName}</p>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(r.at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {r.method.replace(/_/g, ' ')} ·{' '}
                      <span className="font-medium text-foreground">{r.jobsFound}</span> jobs
                    </p>
                    <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{r.message}</p>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  )
}
