import { Activity, AlertCircle, CheckCircle, Clock, RefreshCw } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { agentsApi, type ApiAgentRun, type ApiScanRun, type ApiAgentsStatus } from '@/services/api'
import { useToast } from '@/hooks/use-toast'
import { formatDistanceToNow } from 'date-fns'

const AGENT_LABELS: Record<string, string> = {
  fit_analyst: 'Fit Analysis',
  resume_tailor: 'Resume Tailoring',
  outreach: 'Outreach',
  interview_prep: 'Interview Prep',
  scout: 'Scout (Scan)',
}

const STATUS_ICON: Record<string, typeof CheckCircle> = {
  completed: CheckCircle,
  failed: AlertCircle,
  running: Clock,
}

const STATUS_COLOR: Record<string, string> = {
  completed: 'text-emerald-500',
  failed: 'text-red-500',
  running: 'text-amber-500',
}

function AgentRunRow({ run }: { run: ApiAgentRun }) {
  const StatusIcon = STATUS_ICON[run.status] ?? Clock
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-card/40 p-3">
      <StatusIcon className={`mt-0.5 h-4 w-4 shrink-0 ${STATUS_COLOR[run.status] ?? 'text-muted-foreground'}`} />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{AGENT_LABELS[run.agentType] ?? run.agentType}</span>
          {run.jobPosting && (
            <Link to={`/jobs/${run.jobPosting.id}`} className="text-xs text-primary hover:underline truncate max-w-[200px]">
              {run.jobPosting.title}
            </Link>
          )}
          <Badge variant={run.status === 'completed' ? 'default' : 'secondary'} className="text-[10px]">
            {run.status}
          </Badge>
        </div>
        {run.errorMessage && (
          <p className="mt-1 text-xs text-destructive line-clamp-2">{run.errorMessage}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(run.startedAt), { addSuffix: true })}
          {run.completedAt && ` · ${Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)}s`}
        </p>
      </div>
    </div>
  )
}

function ScanRunRow({ run }: { run: ApiScanRun }) {
  const isOk = run.status === 'completed' && !run.errorMessage
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-card/40 p-3">
      <div className={`mt-0.5 h-2 w-2 shrink-0 rounded-full mt-2 ${isOk ? 'bg-emerald-500' : run.status === 'failed' ? 'bg-red-500' : 'bg-amber-500'}`} />
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{run.company?.name ?? `Company ${run.companyId}`}</span>
          <Badge variant="secondary" className="text-[10px]">{run.method?.replace('_', ' ')}</Badge>
          <span className="text-xs text-muted-foreground">{run.jobsFound} found · {run.jobsCreated} new</span>
        </div>
        {run.message && <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{run.message}</p>}
        {run.errorMessage && <p className="mt-1 text-xs text-destructive line-clamp-1">{run.errorMessage}</p>}
        <p className="mt-1 text-xs text-muted-foreground">
          {formatDistanceToNow(new Date(run.startedAt), { addSuffix: true })}
        </p>
      </div>
    </div>
  )
}

export function AgentRunsPage() {
  const { toast } = useToast()
  const [agentRuns, setAgentRuns] = useState<ApiAgentRun[]>([])
  const [scanRuns, setScanRuns] = useState<ApiScanRun[]>([])
  const [status, setStatus] = useState<ApiAgentsStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState(false)

  const load = async () => {
    try {
      const [runsRes, scanRes, statusRes] = await Promise.all([
        agentsApi.getRuns({ limit: '50' }),
        agentsApi.getScanRuns({ limit: '50' }),
        agentsApi.getStatus(),
      ])
      setAgentRuns(runsRes.runs)
      setScanRuns(scanRes.runs)
      setStatus(statusRes)
    } catch (e) {
      toast({ title: 'Failed to load runs', description: String(e), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const handleScanAll = async () => {
    setScanning(true)
    try {
      const res = await agentsApi.scanAll()
      const total = res.results.reduce((s, r) => s + r.jobsCreated, 0)
      toast({ title: 'Scan complete', description: `${total} new jobs across ${res.results.length} companies`, variant: 'success' })
      await load()
    } catch (e) {
      toast({ title: 'Scan failed', description: String(e), variant: 'destructive' })
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Agent Run History"
        description="Track all background agent executions — scans, fit analysis, resume tailoring, outreach, and interview prep."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
            <Button size="sm" onClick={() => void handleScanAll()} disabled={scanning}>
              {scanning ? 'Scanning…' : 'Scan All Companies'}
            </Button>
          </div>
        }
      />

      {/* Status overview */}
      {status && (
        <div className="grid gap-3 sm:grid-cols-4">
          {[
            { label: 'Total runs', value: status.totalRuns },
            { label: 'Failed', value: status.failedRuns },
            { label: 'Running', value: status.pendingRuns },
            { label: 'AI enabled', value: status.aiEnabled ? 'Yes' : 'Mock mode' },
          ].map(({ label, value }) => (
            <Card key={label} className="border-border/70 bg-card/60">
              <CardHeader className="pb-1 pt-4 px-4">
                <CardDescription className="text-xs uppercase tracking-wide">{label}</CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <p className="font-display text-2xl font-semibold">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {!status?.aiEnabled && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4">
            <p className="text-sm text-amber-200">
              <strong>AI is in mock mode.</strong> Agent outputs will be placeholder text. Set{' '}
              <code className="rounded bg-amber-500/10 px-1 text-xs">OPENAI_API_KEY</code> in{' '}
              <code className="rounded bg-amber-500/10 px-1 text-xs">backend/.env</code> to enable real AI responses.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        {/* Agent runs */}
        <div>
          <h2 className="mb-4 font-display text-lg font-semibold">Agent Runs</h2>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : agentRuns.length === 0 ? (
            <EmptyState icon={Activity} title="No agent runs yet" description="Run fit analysis or other agents from a job detail page." />
          ) : (
            <div className="space-y-2">
              {agentRuns.map((r) => <AgentRunRow key={r.id} run={r} />)}
            </div>
          )}
        </div>

        {/* Scan runs */}
        <div>
          <h2 className="mb-4 font-display text-lg font-semibold">Scan History</h2>
          {loading ? (
            <div className="text-sm text-muted-foreground">Loading…</div>
          ) : scanRuns.length === 0 ? (
            <EmptyState icon={RefreshCw} title="No scans yet" description="Scans run automatically on a schedule or when triggered manually from Companies." />
          ) : (
            <div className="space-y-2">
              {scanRuns.map((r) => <ScanRunRow key={r.id} run={r} />)}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
