import { ChevronRight, MapPin } from 'lucide-react'
import { Link } from 'react-router-dom'
import { SourceBadge } from '@/components/job/SourceBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Job } from '@/domain/types'
import { JOB_STATUS_LABELS } from '@/domain/constants'
import { cn } from '@/lib/utils'

function scoreTone(score: number) {
  if (score >= 75) return 'text-emerald-400'
  if (score >= 55) return 'text-primary'
  return 'text-muted-foreground'
}

export function JobCard({
  job,
  variant = 'default',
  rank,
  className,
}: {
  job: Job
  variant?: 'default' | 'featured'
  rank?: number
  className?: string
}) {
  const featured = variant === 'featured'

  return (
    <Card
      className={cn(
        'overflow-hidden transition-all duration-300',
        featured
          ? 'border-primary/35 bg-gradient-to-br from-primary/[0.12] via-card to-card shadow-xl shadow-primary/5 ring-1 ring-primary/25 hover:ring-primary/40'
          : 'border-border/80 hover:border-border hover:shadow-md',
        className,
      )}
    >
      {featured && rank != null ? (
        <div className="flex items-center justify-between border-b border-primary/20 bg-primary/10 px-4 py-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-primary">
            Top match · #{rank}
          </span>
          <span className="rounded-full bg-primary/20 px-2 py-0.5 font-display text-sm font-bold tabular-nums text-primary">
            {job.score}
          </span>
        </div>
      ) : null}
      <CardContent className="p-0">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <SourceBadge sourceType={job.sourceType} label={job.sourceLabel} />
              <Badge variant="secondary" className="font-normal">
                {JOB_STATUS_LABELS[job.status]}
              </Badge>
            </div>
            <Link
              to={`/jobs/${job.id}`}
              className={cn(
                'group block font-display font-semibold leading-snug hover:text-primary',
                featured ? 'text-xl' : 'text-lg',
              )}
            >
              <span className="inline-flex items-center gap-1">
                {job.title}
                <ChevronRight className="h-4 w-4 opacity-0 transition-opacity group-hover:opacity-100" />
              </span>
            </Link>
            <p className="text-sm text-muted-foreground">{job.company}</p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {job.location}
              </span>
            </div>
            <p className="line-clamp-2 text-sm text-muted-foreground">{job.fitSummary}</p>
          </div>
          <div className="flex shrink-0 flex-row items-center gap-3 sm:flex-col sm:items-end">
            {!featured ? (
              <div className="text-right">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Match</p>
                <p
                  className={cn(
                    'font-display text-3xl font-bold tabular-nums',
                    scoreTone(job.score),
                  )}
                >
                  {job.score}
                </p>
              </div>
            ) : null}
            <Button asChild size="sm" variant={featured ? 'default' : 'secondary'}>
              <Link to={`/jobs/${job.id}`}>Open briefing</Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
