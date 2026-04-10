import {
  AlertCircle,
  CheckCircle2,
  Globe,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Settings2,
  Sparkles,
  Trash2,
  Linkedin,
  Info,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { jobBoardsApi, type ApiJobBoardSource, type ApiCrawlSourceResult } from '@/services/api'
import { useToast } from '@/hooks/use-toast'
import { formatDistanceToNow } from 'date-fns'

const BOARD_META: Record<string, { label: string; description: string; color: string }> = {
  remotive: {
    label: 'Remotive',
    description: 'Remote-first tech jobs — free API, no key required.',
    color: 'text-emerald-400',
  },
  arbeitnow: {
    label: 'Arbeitnow',
    description: 'International tech & startup jobs — free API, no key required.',
    color: 'text-blue-400',
  },
  adzuna: {
    label: 'Adzuna',
    description: 'Global job board — requires a free API key from adzuna.com.',
    color: 'text-purple-400',
  },
  wellfound: {
    label: 'Wellfound',
    description: 'Startup & growth-stage roles — manual config.',
    color: 'text-amber-400',
  },
}

const REMOTIVE_CATEGORIES = [
  'software-dev', 'design', 'data', 'devops-sysadmin', 'product',
  'marketing', 'finance-legal', 'hr', 'customer-support', 'sales',
  'business-exec', 'all-others',
]

interface SourceFormState {
  boardType: string
  search: string
  category: string
  location: string
  limit: string
}

// ─── Bootstrap banner (shown when no sources exist) ───────────────────────────

function BootstrapBanner({ onBootstrap, loading }: { onBootstrap: () => void; loading: boolean }) {
  return (
    <div className="rounded-xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] to-primary/[0.03] p-6 space-y-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary ring-1 ring-primary/20">
          <Sparkles className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-semibold text-base">Let agents hunt for you</h3>
          <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
            Your profile and resume are set up — agents just need one click to start scanning
            thousands of companies across job boards automatically, 24/7.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
        <div className="flex items-start gap-2.5 rounded-lg bg-background/40 border border-border/40 p-3">
          <CheckCircle2 className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-foreground/80">Remotive</p>
            <p className="text-xs text-muted-foreground">Remote-first tech jobs, updated hourly</p>
          </div>
        </div>
        <div className="flex items-start gap-2.5 rounded-lg bg-background/40 border border-border/40 p-3">
          <CheckCircle2 className="h-4 w-4 text-blue-400 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-foreground/80">Arbeitnow</p>
            <p className="text-xs text-muted-foreground">International tech & startup roles</p>
          </div>
        </div>
        <div className="flex items-start gap-2.5 rounded-lg bg-background/40 border border-border/40 p-3 opacity-50">
          <Linkedin className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-foreground/60">LinkedIn</p>
            <p className="text-xs text-muted-foreground">Requires logged-in session — not supported server-side</p>
          </div>
        </div>
        <div className="flex items-start gap-2.5 rounded-lg bg-background/40 border border-border/40 p-3 opacity-50">
          <Globe className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <p className="font-medium text-foreground/60">Indeed</p>
            <p className="text-xs text-muted-foreground">Aggressive bot detection — coming later</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button onClick={onBootstrap} disabled={loading} size="lg" className="gap-2">
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          {loading ? 'Setting up & crawling…' : 'Start Hunting From My Profile'}
        </Button>
        <p className="text-xs text-muted-foreground">
          Reads your target titles and keywords — no manual setup needed
        </p>
      </div>
    </div>
  )
}

// ─── LinkedIn info card ───────────────────────────────────────────────────────

function LinkedInInfoCard() {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-amber-500/20 bg-amber-500/[0.04] p-4 text-sm">
      <Info className="h-4 w-4 text-amber-400 mt-0.5 shrink-0" />
      <div className="space-y-1">
        <p className="font-medium text-foreground/80">Why isn't LinkedIn here?</p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          LinkedIn's Jobs API is not public — accessing it requires a logged-in browser session.
          A server-side agent can't authenticate as you without storing your credentials (a security risk).
          The best workaround is a browser extension that relays your LinkedIn feed, but that's a separate
          project. For now, Remotive + Arbeitnow cover thousands of companies including many that also post on LinkedIn.
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          You can still manually paste a LinkedIn job via{' '}
          <Link to="/intake" className="text-primary/80 hover:text-primary underline">Manual Intake</Link>.
        </p>
      </div>
    </div>
  )
}

// ─── Source card ──────────────────────────────────────────────────────────────

function SourceCard({
  source, onDelete, onToggle, onCrawl, crawling,
}: {
  source: ApiJobBoardSource
  onDelete: (id: number) => void
  onToggle: (id: number, active: boolean) => void
  onCrawl: (id: number) => void
  crawling: boolean
}) {
  const meta = BOARD_META[source.boardType]
  const config = JSON.parse(source.searchConfigJson) as Record<string, string>

  return (
    <Card className="border-border/60 bg-card/40">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary ring-1 ring-primary/20">
              <Globe className="h-4 w-4" />
            </div>
            <div>
              <CardTitle className="text-base">{meta?.label ?? source.boardType}</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {config.search ? `"${config.search}"` : 'All jobs'}
                {config.category ? ` · ${config.category}` : ''}
                {config.location ? ` · ${config.location}` : ''}
              </CardDescription>
            </div>
          </div>
          <Badge variant={source.active ? 'default' : 'secondary'} className="text-[10px] shrink-0">
            {source.active ? 'Active' : 'Paused'}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <p className="text-xs text-muted-foreground">
            {source.lastCheckedAt
              ? `Last crawled ${formatDistanceToNow(new Date(source.lastCheckedAt), { addSuffix: true })} · ${source.lastJobsFound} jobs found`
              : 'Never crawled'}
          </p>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => onToggle(source.id, !source.active)}>
              <Settings2 className="h-3.5 w-3.5 mr-1" />
              {source.active ? 'Pause' : 'Resume'}
            </Button>
            <Button
              variant="ghost" size="sm"
              className="h-7 px-2 text-xs text-emerald-500 hover:text-emerald-400"
              onClick={() => onCrawl(source.id)} disabled={crawling}
            >
              {crawling ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Play className="h-3.5 w-3.5 mr-1" />}
              Crawl now
            </Button>
            <Button
              variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
              onClick={() => onDelete(source.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// ─── Crawl result banner ──────────────────────────────────────────────────────

function CrawlResultBanner({ results, message }: { results: ApiCrawlSourceResult[]; message?: string }) {
  const total = results.reduce((s, r) => s + r.jobsCreated, 0)
  const failed = results.filter((r) => !r.success)
  const isGood = failed.length === 0

  return (
    <div className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${isGood ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-amber-500/30 bg-amber-500/5'}`}>
      {isGood
        ? <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
        : <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />}
      <div>
        <p className="font-medium">
          {message ?? `Crawl complete — ${total} new job${total !== 1 ? 's' : ''} found`}
        </p>
        {total > 0 && (
          <Link to="/jobs" className="text-xs text-primary/70 hover:text-primary underline">
            View new jobs in your feed →
          </Link>
        )}
        {failed.length > 0 && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {failed.length} source{failed.length !== 1 ? 's' : ''} failed: {failed.map((r) => r.boardType).join(', ')}
          </p>
        )}
      </div>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export function JobBoardsPage() {
  const { toast } = useToast()
  const [sources, setSources] = useState<ApiJobBoardSource[]>([])
  const [loading, setLoading] = useState(true)
  const [bootstrapping, setBootstrapping] = useState(false)
  const [crawlingAll, setCrawlingAll] = useState(false)
  const [crawlingId, setCrawlingId] = useState<number | null>(null)
  const [crawlResults, setCrawlResults] = useState<{ results: ApiCrawlSourceResult[]; message?: string } | null>(null)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [addLoading, setAddLoading] = useState(false)
  const [form, setForm] = useState<SourceFormState>({ boardType: 'remotive', search: '', category: '', location: '', limit: '50' })

  async function loadSources() {
    try {
      const data = await jobBoardsApi.getSources()
      setSources(data.sources)
    } catch {
      toast({ title: 'Failed to load job board sources', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadSources() }, [])

  async function handleBootstrap() {
    setBootstrapping(true)
    setCrawlResults(null)
    try {
      const result = await jobBoardsApi.bootstrap()
      await loadSources()
      const crawlResult = result.crawlResult as { results?: ApiCrawlSourceResult[] } | null
      if (crawlResult?.results) {
        const total = crawlResult.results.reduce((s: number, r: ApiCrawlSourceResult) => s + r.jobsCreated, 0)
        setCrawlResults({ results: crawlResult.results, message: `${result.message} Found ${total} new job${total !== 1 ? 's' : ''}.` })
      } else {
        toast({ title: result.message })
      }
    } catch (e) {
      toast({ title: 'Bootstrap failed', description: String(e), variant: 'destructive' })
    } finally {
      setBootstrapping(false)
    }
  }

  async function handleCrawlAll() {
    setCrawlingAll(true)
    setCrawlResults(null)
    try {
      const result = await jobBoardsApi.crawlAll()
      setCrawlResults({ results: result.results })
      await loadSources()
    } catch (e) {
      toast({ title: 'Crawl failed', description: String(e), variant: 'destructive' })
    } finally {
      setCrawlingAll(false)
    }
  }

  async function handleCrawlSource(id: number) {
    setCrawlingId(id)
    try {
      const result = await jobBoardsApi.crawlSource(id)
      setCrawlResults({ results: [result.result] })
      await loadSources()
    } catch (e) {
      toast({ title: 'Crawl failed', description: String(e), variant: 'destructive' })
    } finally {
      setCrawlingId(null)
    }
  }

  async function handleToggle(id: number, active: boolean) {
    try {
      await jobBoardsApi.updateSource(id, { active })
      setSources((prev) => prev.map((s) => (s.id === id ? { ...s, active } : s)))
    } catch (e) {
      toast({ title: 'Failed to update', description: String(e), variant: 'destructive' })
    }
  }

  async function handleDelete(id: number) {
    try {
      await jobBoardsApi.deleteSource(id)
      setSources((prev) => prev.filter((s) => s.id !== id))
      toast({ title: 'Source removed' })
    } catch (e) {
      toast({ title: 'Failed to delete', description: String(e), variant: 'destructive' })
    }
  }

  async function handleAddSource() {
    setAddLoading(true)
    try {
      const config: Record<string, unknown> = {}
      if (form.search.trim()) config.search = form.search.trim()
      if (form.category.trim()) config.category = form.category.trim()
      if (form.location.trim()) config.location = form.location.trim()
      if (form.limit) config.limit = parseInt(form.limit, 10)
      const data = await jobBoardsApi.createSource({ boardType: form.boardType, searchConfig: config })
      setSources((prev) => [data.source, ...prev])
      setShowAddDialog(false)
      setForm({ boardType: 'remotive', search: '', category: '', location: '', limit: '50' })
      toast({ title: 'Job board source added' })
    } catch (e) {
      toast({ title: 'Failed to add source', description: String(e), variant: 'destructive' })
    } finally {
      setAddLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Job Boards"
        description="Agents automatically crawl job boards every 6 hours based on your profile — no manual company adding needed."
        actions={
          <div className="flex items-center gap-2">
            {sources.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleCrawlAll} disabled={crawlingAll}>
                {crawlingAll ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
                Crawl All
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => setShowAddDialog(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add Custom
            </Button>
          </div>
        }
      />

      {crawlResults && (
        <CrawlResultBanner results={crawlResults.results} message={crawlResults.message} />
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* Bootstrap banner — always show if no sources, or as a secondary action */}
          {sources.length === 0 && (
            <BootstrapBanner onBootstrap={handleBootstrap} loading={bootstrapping} />
          )}

          {/* Active sources */}
          {sources.length > 0 && (
            <div className="space-y-3">
              {sources.map((source) => (
                <SourceCard
                  key={source.id}
                  source={source}
                  onDelete={handleDelete}
                  onToggle={handleToggle}
                  onCrawl={handleCrawlSource}
                  crawling={crawlingId === source.id}
                />
              ))}
            </div>
          )}

          {/* How it works — compact when sources exist */}
          {sources.length > 0 && (
            <div className="flex items-start gap-3 rounded-lg border border-border/40 bg-card/20 p-4 text-sm">
              <Globe className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                Sources crawl every <span className="text-foreground/70">6 hours</span> automatically.
                Jobs above your fit threshold trigger the full pipeline: fit analysis → resume tailoring
                → outreach draft, landing in your <Link to="/queue" className="text-primary/70 hover:text-primary underline">Inbox</Link> for approval.
                New jobs appear in your <Link to="/jobs" className="text-primary/70 hover:text-primary underline">Jobs Feed</Link>.
              </p>
            </div>
          )}

          <LinkedInInfoCard />
        </>
      )}

      {/* Add Custom Source Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Job Board Source</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Board</Label>
              <Select value={form.boardType} onValueChange={(v) => setForm((f) => ({ ...f, boardType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(BOARD_META).map(([key, meta]) => (
                    <SelectItem key={key} value={key}>{meta.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {BOARD_META[form.boardType] && (
                <p className="text-xs text-muted-foreground">{BOARD_META[form.boardType].description}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Search Keywords</Label>
              <Input
                placeholder='e.g. "engineering manager", "product designer"'
                value={form.search}
                onChange={(e) => setForm((f) => ({ ...f, search: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">Leave blank to fetch all available jobs from that board</p>
            </div>
            {form.boardType === 'remotive' && (
              <div className="space-y-1.5">
                <Label>Category (optional)</Label>
                <Select
                  value={form.category || '__all'}
                  onValueChange={(v) => setForm((f) => ({ ...f, category: v === '__all' ? '' : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="All categories" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">All categories</SelectItem>
                    {REMOTIVE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Max results per crawl</Label>
              <Input type="number" min={10} max={200} value={form.limit}
                onChange={(e) => setForm((f) => ({ ...f, limit: e.target.value }))} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
              <Button onClick={handleAddSource} disabled={addLoading}>
                {addLoading && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                Add Source
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
