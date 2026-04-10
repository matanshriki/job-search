import {
  ArrowUpRight,
  Bot,
  Briefcase,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Inbox,
  Loader2,
  Mail,
  RefreshCw,
  Send,
  TrendingUp,
  Users,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { digestApi, type ApiWeeklyDigest, type ApiDigestJob } from '@/services/api'
import { useToast } from '@/hooks/use-toast'
import { formatDistanceToNow } from 'date-fns'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 80) return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
  if (score >= 65) return 'text-amber-400 bg-amber-500/10 border-amber-500/20'
  return 'text-muted-foreground bg-muted/30 border-border/40'
}

function statusLabel(s: string) {
  const labels: Record<string, string> = {
    new: 'New', considering: 'Considering', applied: 'Applied',
    interviewing: 'Interviewing', offered: 'Offered', rejected: 'Rejected', archived: 'Archived',
  }
  return labels[s] ?? s
}

function statusColor(s: string) {
  if (s === 'applied') return 'text-blue-400 bg-blue-500/10 border-blue-500/20'
  if (s === 'interviewing') return 'text-purple-400 bg-purple-500/10 border-purple-500/20'
  if (s === 'offered') return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
  if (s === 'rejected') return 'text-red-400 bg-red-500/10 border-red-500/20'
  return 'text-muted-foreground bg-muted/30 border-border/40'
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }: {
  label: string; value: number; icon: React.FC<{ className?: string }>; color: string
}) {
  return (
    <Card className="border-border/60 bg-card/40">
      <CardContent className="pt-5 pb-4">
        <div className={`inline-flex h-9 w-9 items-center justify-center rounded-lg mb-3 ${color}`}>
          <Icon className="h-4.5 w-4.5" />
        </div>
        <div className="text-3xl font-bold tabular-nums">{value}</div>
        <div className="text-xs text-muted-foreground mt-1 font-medium">{label}</div>
      </CardContent>
    </Card>
  )
}

function JobRow({ job }: { job: ApiDigestJob }) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-border/40 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            to={`/jobs/${job.id}`}
            className="text-sm font-semibold hover:text-primary transition-colors truncate"
          >
            {job.title}
          </Link>
          {job.jobUrl && (
            <a
              href={job.jobUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {job.company} · {job.location}
          <span className="ml-2 opacity-60">
            {formatDistanceToNow(new Date(job.discoveredAt), { addSuffix: true })}
          </span>
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-bold ${scoreColor(job.fitScore)}`}>
          {job.fitScore}
        </span>
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${statusColor(job.status)}`}>
          {statusLabel(job.status)}
        </span>
      </div>
    </div>
  )
}

function PipelineBar({ snapshot }: { snapshot: Array<{ status: string; count: number }> }) {
  const total = snapshot.reduce((s, p) => s + p.count, 0)
  if (total === 0) return <p className="text-sm text-muted-foreground">No pipeline data yet.</p>

  const colors: Record<string, string> = {
    new: 'bg-slate-500',
    considering: 'bg-blue-500',
    applied: 'bg-indigo-500',
    interviewing: 'bg-purple-500',
    offered: 'bg-emerald-500',
    rejected: 'bg-red-500/60',
    archived: 'bg-muted',
  }

  return (
    <div className="space-y-2.5">
      {snapshot.map((p) => (
        <div key={p.status} className="flex items-center gap-3">
          <div className="w-24 text-xs text-right text-muted-foreground shrink-0">{statusLabel(p.status)}</div>
          <div className="flex-1 bg-muted/30 rounded-full h-2 overflow-hidden">
            <div
              className={`h-2 rounded-full transition-all ${colors[p.status] ?? 'bg-primary'}`}
              style={{ width: `${Math.max(4, (p.count / total) * 100)}%` }}
            />
          </div>
          <div className="w-6 text-xs font-bold text-foreground/80 shrink-0">{p.count}</div>
        </div>
      ))}
      <div className="flex items-center gap-3">
        <div className="w-24 text-right text-xs text-muted-foreground/60 shrink-0">Total</div>
        <div className="flex-1" />
        <div className="w-6 text-xs font-bold text-muted-foreground shrink-0">{total}</div>
      </div>
    </div>
  )
}

// ─── Email panel ──────────────────────────────────────────────────────────────

function EmailPanel({ emailEnabled, onSend, sending }: {
  emailEnabled: boolean
  onSend: (email?: string) => void
  sending: boolean
}) {
  const [customEmail, setCustomEmail] = useState('')

  return (
    <Card className="border-border/60 bg-card/40">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Mail className="h-4 w-4 text-primary/70" />
          Email This Digest
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {emailEnabled ? (
          <>
            <p className="text-xs text-muted-foreground leading-relaxed">
              SMTP is configured. Enter an address below or leave blank to use your profile email.
              Digests also send automatically <strong className="text-foreground/70">every Monday at 8am</strong>.
            </p>
            <div className="flex gap-2">
              <Input
                placeholder="override@email.com (optional)"
                value={customEmail}
                onChange={(e) => setCustomEmail(e.target.value)}
                className="text-xs h-8"
              />
              <Button size="sm" className="h-8 shrink-0" onClick={() => onSend(customEmail || undefined)} disabled={sending}>
                {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1" />}
                Send
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Email is not configured yet. Add these to <code className="bg-muted px-1 rounded text-[11px]">backend/.env</code> to enable weekly emails:
            </p>
            <div className="rounded-md bg-muted/30 border border-border/40 p-3 font-mono text-[11px] text-muted-foreground leading-relaxed space-y-0.5">
              <p>SMTP_HOST=smtp.gmail.com</p>
              <p>SMTP_PORT=587</p>
              <p>SMTP_USER=you@gmail.com</p>
              <p className="text-amber-400/80">SMTP_PASS=your-app-password</p>
              <p>DIGEST_TO=you@gmail.com</p>
            </div>
            <p className="text-[11px] text-muted-foreground/60">
              Gmail: go to myaccount.google.com → Security → 2-Step Verification → App Passwords
            </p>
            <Button size="sm" variant="outline" className="h-8 w-full text-xs" disabled>
              <Mail className="h-3.5 w-3.5 mr-1.5" />
              Configure SMTP to send
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function WeeklyDigestPage() {
  const { toast } = useToast()
  const [digest, setDigest] = useState<ApiWeeklyDigest | null>(null)
  const [emailEnabled, setEmailEnabled] = useState(false)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const data = await digestApi.get()
      setDigest(data.digest)
      setEmailEnabled(data.emailEnabled)
    } catch {
      toast({ title: 'Failed to load digest', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleSend(email?: string) {
    setSending(true)
    try {
      const result = await digestApi.send(email)
      if (result.sent) {
        toast({ title: 'Digest sent!', description: result.message })
      } else {
        toast({ title: 'Could not send', description: result.message, variant: 'destructive' })
      }
    } catch (e) {
      toast({ title: 'Send failed', description: String(e), variant: 'destructive' })
    } finally {
      setSending(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!digest) return null

  const { stats, topMatches, appliedThisWeek, pipelineSnapshot, period } = digest

  return (
    <div className="space-y-6">
      <PageHeader
        title="Weekly Summary"
        description={`Your job search activity — ${period.label}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
              Refresh
            </Button>
            <Link to="/">
              <Button size="sm" variant="outline">
                <ArrowUpRight className="h-3.5 w-3.5 mr-1.5" />
                Dashboard
              </Button>
            </Link>
          </div>
        }
      />

      {/* Stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Jobs Found" value={stats.jobsFound} icon={Briefcase} color="bg-blue-500/10 text-blue-400" />
        <StatCard label="High Match (≥70)" value={stats.highMatchJobs} icon={TrendingUp} color="bg-emerald-500/10 text-emerald-400" />
        <StatCard label="Applied" value={stats.appliedCount} icon={Send} color="bg-indigo-500/10 text-indigo-400" />
        <StatCard label="Inbox Prepared" value={stats.queueItemsCreated} icon={Inbox} color="bg-amber-500/10 text-amber-400" />
      </div>

      {/* Agent activity row */}
      <Card className="border-border/60 bg-card/40">
        <CardContent className="pt-4 pb-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-3">Agent Activity This Week</p>
          <div className="flex flex-wrap gap-6">
            {[
              { icon: Users, label: 'Companies scanned', value: stats.companiesScanned },
              { icon: Bot, label: 'Fit analyses run', value: stats.fitAnalysesRun },
              { icon: Briefcase, label: 'Board sources active', value: stats.boardCrawlsRun },
              { icon: Inbox, label: 'Interviewing', value: stats.interviewingCount },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5 text-muted-foreground/60" />
                <span className="text-sm font-bold">{value}</span>
                <span className="text-xs text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column — job lists */}
        <div className="lg:col-span-2 space-y-6">

          {/* Top matches */}
          <Card className="border-border/60 bg-card/40">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">Top Matches This Week</CardTitle>
                <Link to="/jobs" className="flex items-center gap-1 text-xs text-primary/70 hover:text-primary">
                  View all <ChevronRight className="h-3 w-3" />
                </Link>
              </div>
            </CardHeader>
            <CardContent className="pt-0">
              {topMatches.length > 0 ? (
                topMatches.map((job) => <JobRow key={job.id} job={job} />)
              ) : (
                <p className="text-sm text-muted-foreground py-4">No matches found this week. Check your job boards are set up.</p>
              )}
            </CardContent>
          </Card>

          {/* Applied */}
          <Card className="border-border/60 bg-card/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                Applied This Week
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              {appliedThisWeek.length > 0 ? (
                appliedThisWeek.map((job) => <JobRow key={job.id} job={job} />)
              ) : (
                <p className="text-sm text-muted-foreground py-4">
                  No applications this week. Approve items in your{' '}
                  <Link to="/queue" className="text-primary/70 hover:text-primary underline">Inbox</Link> to apply.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column — pipeline + email */}
        <div className="space-y-4">
          <Card className="border-border/60 bg-card/40">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Pipeline Snapshot</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <PipelineBar snapshot={pipelineSnapshot} />
            </CardContent>
          </Card>

          <EmailPanel emailEnabled={emailEnabled} onSend={handleSend} sending={sending} />
        </div>
      </div>
    </div>
  )
}
