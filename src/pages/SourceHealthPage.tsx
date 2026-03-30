import { Building2, CheckCircle, RefreshCw, Server, XCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { companiesApi, agentsApi, type ApiCompany, type ApiScanRun } from '@/services/api'
import { useToast } from '@/hooks/use-toast'
import { formatDistanceToNow } from 'date-fns'

interface CompanyHealth {
  company: ApiCompany
  lastScan: ApiScanRun | null
  status: 'healthy' | 'warning' | 'error' | 'never_scanned'
}

function getHealthStatus(c: ApiCompany): CompanyHealth['status'] {
  const lastScan = c.lastScan
  if (!lastScan) return 'never_scanned'
  if (lastScan.status === 'failed') return 'error'
  const hoursSince = (Date.now() - new Date(lastScan.startedAt).getTime()) / (1000 * 60 * 60)
  if (hoursSince > 24) return 'warning'
  return 'healthy'
}

const STATUS_BADGE: Record<CompanyHealth['status'], { label: string; color: string }> = {
  healthy: { label: 'Healthy', color: 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10' },
  warning: { label: 'Stale (24h+)', color: 'border-amber-500/30 text-amber-400 bg-amber-500/10' },
  error: { label: 'Error', color: 'border-red-500/30 text-red-400 bg-red-500/10' },
  never_scanned: { label: 'Never scanned', color: 'border-border/60 text-muted-foreground bg-muted/10' },
}

export function SourceHealthPage() {
  const { toast } = useToast()
  const [companies, setCompanies] = useState<CompanyHealth[]>([])
  const [loading, setLoading] = useState(true)
  const [scanning, setScanning] = useState<number | null>(null)

  const load = async () => {
    try {
      const res = await companiesApi.list()
      const health: CompanyHealth[] = res.companies.map((c) => ({
        company: c,
        lastScan: c.lastScan ?? null,
        status: getHealthStatus(c),
      }))
      // Sort: errors first, then warning, never, healthy
      const order: CompanyHealth['status'][] = ['error', 'never_scanned', 'warning', 'healthy']
      health.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status))
      setCompanies(health)
    } catch (e) {
      toast({ title: 'Failed to load', description: String(e), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const handleScanCompany = async (id: number, name: string) => {
    setScanning(id)
    try {
      const res = await companiesApi.scan(id)
      toast({
        title: res.ok ? 'Scan complete' : 'Scan finished with issues',
        description: `${name}: ${res.message}`,
        variant: res.ok ? 'success' : 'destructive',
      })
      await load()
    } catch (e) {
      toast({ title: 'Scan failed', description: String(e), variant: 'destructive' })
    } finally {
      setScanning(null)
    }
  }

  const handleScanAll = async () => {
    setScanning(-1)
    try {
      const res = await agentsApi.scanAll()
      const total = res.results.reduce((s, r) => s + r.jobsCreated, 0)
      toast({
        title: 'Scan complete',
        description: `${total} new jobs across ${res.results.length} companies`,
        variant: 'success',
      })
      await load()
    } catch (e) {
      toast({ title: 'Scan failed', description: String(e), variant: 'destructive' })
    } finally {
      setScanning(null)
    }
  }

  const healthy = companies.filter((c) => c.status === 'healthy').length
  const issues = companies.filter((c) => c.status !== 'healthy').length

  return (
    <div className="space-y-8">
      <PageHeader
        title="Source Health"
        description="Monitor the health of your career page sources — last scan timestamps, error states, and job discovery rates."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()}>
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
            <Button size="sm" onClick={() => void handleScanAll()} disabled={scanning !== null}>
              {scanning === -1 ? 'Scanning all…' : 'Scan All'}
            </Button>
          </div>
        }
      />

      {/* Summary */}
      {companies.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card className="border-border/70 bg-card/60">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Tracked companies</p>
              <p className="mt-1 font-display text-2xl font-semibold">{companies.length}</p>
            </CardContent>
          </Card>
          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Healthy</p>
              <p className="mt-1 font-display text-2xl font-semibold text-emerald-400">{healthy}</p>
            </CardContent>
          </Card>
          <Card className={issues > 0 ? 'border-amber-500/20 bg-amber-500/5' : 'border-border/70 bg-card/60'}>
            <CardContent className="p-4">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Needs attention</p>
              <p className={`mt-1 font-display text-2xl font-semibold ${issues > 0 ? 'text-amber-400' : ''}`}>{issues}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : companies.length === 0 ? (
        <EmptyState icon={Server} title="No companies tracked" description="Add companies to start monitoring source health." />
      ) : (
        <div className="space-y-3">
          {companies.map(({ company, lastScan, status }) => {
            const badge = STATUS_BADGE[status]
            return (
              <Card key={company.id} className="border-border/70 bg-card/60">
                <CardContent className="p-4">
                  <div className="flex flex-wrap items-center gap-3">
                    <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link to={`/companies`} className="text-sm font-medium hover:text-primary">{company.name}</Link>
                        <Badge variant="outline" className={`text-[10px] ${badge.color}`}>{badge.label}</Badge>
                        <Badge variant="secondary" className="text-[10px]">{company.priority}</Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        {company.careersUrl ? (
                          <a href={company.careersUrl} target="_blank" rel="noreferrer" className="hover:text-primary truncate max-w-[240px]">
                            {company.careersUrl}
                          </a>
                        ) : (
                          <span className="text-destructive">No career URL — set one on the Companies page</span>
                        )}
                        {lastScan ? (
                          <span>Last scanned {formatDistanceToNow(new Date(lastScan.startedAt), { addSuffix: true })}</span>
                        ) : (
                          <span>Never scanned</span>
                        )}
                        <span>{company.jobsFoundCount ?? 0} active jobs</span>
                      </div>
                      {lastScan?.errorMessage && (
                        <p className="mt-1 text-xs text-destructive line-clamp-2">{lastScan.errorMessage || lastScan.message}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {status === 'healthy' ? (
                        <CheckCircle className="h-4 w-4 text-emerald-500" />
                      ) : status === 'error' ? (
                        <XCircle className="h-4 w-4 text-red-500" />
                      ) : null}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleScanCompany(company.id, company.name)}
                        disabled={scanning !== null}
                      >
                        {scanning === company.id ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                        <span className="ml-1.5">{scanning === company.id ? 'Scanning…' : 'Scan'}</span>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
