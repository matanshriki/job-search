import { Building2, ClipboardCheck, ExternalLink, Lightbulb, ListChecks, UserRound } from 'lucide-react'
import * as React from 'react'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import type { Job, SearchProfile, TrackedCompany } from '@/domain/types'

function jdSnippet(description: string, maxChars = 400): string {
  const t = description.trim()
  if (!t) return 'No description stored — open the posting link and capture key responsibilities in your notes.'
  return t.length <= maxChars ? t : `${t.slice(0, maxChars).trim()}…`
}

export const InterviewPrepPanel = React.forwardRef<
  HTMLDivElement,
  {
    job: Job
    profile: SearchProfile
    company: TrackedCompany | null
  }
>(function InterviewPrepPanel({ job, profile, company }, ref) {
  const summaryExcerpt = profile.personalSummary.trim()
  const titleLine =
    profile.targetTitles.length > 0
      ? profile.targetTitles.slice(0, 6).join(' · ')
      : 'Add target titles on Profile to anchor your pitch.'

  const concerns = [...new Set([...job.concerns, ...(job.redFlags ?? [])])].filter(Boolean)

  return (
    <Card
      ref={ref}
      id="interview-prep"
      className="border-primary/35 bg-gradient-to-br from-primary/[0.12] via-card to-card shadow-md ring-1 ring-primary/15"
    >
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/20 text-primary">
              <ClipboardCheck className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-lg">Interview prep</CardTitle>
              <CardDescription className="mt-1 max-w-2xl">
                Local checklist and context from this app — verify facts on the company site and latest
                news before you go.
              </CardDescription>
            </div>
          </div>
          <Badge className="shrink-0 bg-primary/90">Interview stage</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6 text-sm">
        <section className="rounded-lg border border-border/60 bg-background/40 p-4">
          <h3 className="mb-3 flex items-center gap-2 font-semibold text-foreground">
            <Building2 className="h-4 w-4 text-primary" />
            Role & company snapshot
          </h3>
          <ul className="space-y-2 text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">Role:</span> {job.title}
            </li>
            <li>
              <span className="font-medium text-foreground">Company:</span> {job.company}
            </li>
            <li>
              <span className="font-medium text-foreground">Location / model:</span> {job.location}
            </li>
            {job.department ? (
              <li>
                <span className="font-medium text-foreground">Department:</span> {job.department}
              </li>
            ) : null}
            <li>
              <span className="font-medium text-foreground">Match score (local):</span> {job.score}/100
              — use as a hint, not a verdict.
            </li>
          </ul>
        </section>

        <section>
          <h3 className="mb-2 flex items-center gap-2 font-semibold text-foreground">
            <ExternalLink className="h-4 w-4 text-primary" />
            Links to open before the call
          </h3>
          <ul className="space-y-2">
            {job.sourceUrl ? (
              <li>
                <a
                  href={job.sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
                >
                  Original posting <ExternalLink className="h-3 w-3" />
                </a>
              </li>
            ) : (
              <li className="text-muted-foreground">No posting URL on file.</li>
            )}
            {company?.website ? (
              <li>
                <a
                  href={company.website}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
                >
                  Company website <ExternalLink className="h-3 w-3" />
                </a>
              </li>
            ) : null}
            {company?.careerPageUrl ? (
              <li>
                <a
                  href={company.careerPageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
                >
                  Careers / jobs page <ExternalLink className="h-3 w-3" />
                </a>
              </li>
            ) : null}
            {!company?.website && !company?.careerPageUrl ? (
              <li className="text-muted-foreground">
                Add website and careers URL on{' '}
                <span className="text-foreground">Companies</span> for this employer to surface here.
              </li>
            ) : null}
          </ul>
        </section>

        {company?.notes?.trim() ? (
          <section className="rounded-lg border border-amber-500/20 bg-amber-500/[0.06] p-4">
            <h3 className="mb-2 font-semibold text-foreground">Your notes on this company</h3>
            <p className="whitespace-pre-wrap text-muted-foreground">{company.notes.trim()}</p>
            {company.priority ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Priority in tracker: <span className="capitalize text-foreground">{company.priority}</span>
              </p>
            ) : null}
          </section>
        ) : null}

        <section>
          <h3 className="mb-2 flex items-center gap-2 font-semibold text-foreground">
            <Lightbulb className="h-4 w-4 text-primary" />
            Job description (excerpt)
          </h3>
          <p className="rounded-md border border-border/50 bg-muted/20 p-3 text-muted-foreground leading-relaxed">
            {jdSnippet(job.description)}
          </p>
        </section>

        <section>
          <h3 className="mb-2 flex items-center gap-2 font-semibold text-foreground">
            <UserRound className="h-4 w-4 text-primary" />
            Tie-in to your profile
          </h3>
          <ul className="space-y-2 text-muted-foreground">
            <li>
              <span className="font-medium text-foreground">Target titles you care about:</span>{' '}
              {titleLine}
            </li>
            <li>
              <span className="font-medium text-foreground">Personal summary:</span>{' '}
              {summaryExcerpt
                ? summaryExcerpt.length > 320
                  ? `${summaryExcerpt.slice(0, 320).trim()}…`
                  : summaryExcerpt
                : 'Empty — add a short summary on Profile so you can reuse themes in your intro.'}
            </li>
          </ul>
        </section>

        {concerns.length > 0 ? (
          <section className="rounded-lg border border-border/60 bg-muted/15 p-4">
            <h3 className="mb-2 font-semibold text-foreground">Angles to address</h3>
            <p className="mb-2 text-xs text-muted-foreground">
              From match scoring — prepare a sentence or example for each if they come up.
            </p>
            <ul className="list-inside list-disc space-y-1 text-muted-foreground">
              {concerns.slice(0, 8).map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <Separator />

        <section>
          <h3 className="mb-3 flex items-center gap-2 font-semibold text-foreground">
            <ListChecks className="h-4 w-4 text-primary" />
            Prep checklist
          </h3>
          <ol className="list-decimal space-y-3 pl-5 text-muted-foreground marker:font-semibold marker:text-foreground">
            <li>
              Re-read the posting and list <strong className="text-foreground">5 must-haves</strong>; for
              each, note one proof point from your experience (metric, scope, stakeholder type).
            </li>
            <li>
              <strong className="text-foreground">Company basics</strong> (15 min): what they sell, who
              buys it, how they make money. Skim About, Product, Customers, and one recent blog or press
              item.
            </li>
            <li>
              Prepare <strong className="text-foreground">3 STAR stories</strong> mapped to bullets in the
              JD (delivery, stakeholder management, scale, ambiguity, cross-functional work).
            </li>
            <li>
              Write <strong className="text-foreground">6 questions</strong> for them: team structure,
              success metrics first 90 days, biggest delivery risk, how PS/partners engage with product,
              interview loop, timeline.
            </li>
            <li>
              <strong className="text-foreground">Logistics:</strong> format (video / onsite), duration,
              who you meet, take-home or presentation expectations. Add details to your notes field on
              this job.
            </li>
            <li>
              <strong className="text-foreground">Close strong:</strong> restate interest in {job.company}{' '}
              and {job.title}, and confirm next steps.
            </li>
          </ol>
        </section>
      </CardContent>
    </Card>
  )
})

InterviewPrepPanel.displayName = 'InterviewPrepPanel'
