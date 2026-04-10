import {
  AlertCircle,
  CheckCircle2,
  Globe,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Settings2,
  Trash2,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { jobBoardsApi, type ApiJobBoardSource, type ApiCrawlSourceResult } from '@/services/api'
import { useToast } from '@/hooks/use-toast'
import { formatDistanceToNow } from 'date-fns'

const BOARD_META: Record<string, { label: string; description: string; configFields: string[] }> = {
  remotive: {
    label: 'Remotive',
    description: 'Free remote jobs API — no API key required. Great for tech, design, and marketing roles.',
    configFields: ['search', 'category'],
  },
  adzuna: {
    label: 'Adzuna',
    description: 'Global job board API. Requires a free API key from adzuna.com.',
    configFields: ['search', 'location'],
  },
  wellfound: {
    label: 'Wellfound (AngelList)',
    description: 'Startup-focused job board. Best for early-stage and growth-stage company roles.',
    configFields: ['search'],
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

function SourceCard({
  source,
  onDelete,
  onToggle,
  onCrawl,
  crawling,
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
          <div className="flex items-center gap-1.5">
            <Badge variant={source.active ? 'default' : 'secondary'} className="text-[10px]">
              {source.active ? 'Active' : 'Paused'}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="flex items-center justify-between">
          <div className="text-xs text-muted-foreground">
            {source.lastCheckedAt ? (
              <span>
                Last crawled {formatDistanceToNow(new Date(source.lastCheckedAt), { addSuffix: true })}
                {' · '}{source.lastJobsFound} jobs found
              </span>
            ) : (
              <span>Never crawled</span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => onToggle(source.id, !source.active)}
            >
              <Settings2 className="h-3.5 w-3.5 mr-1" />
              {source.active ? 'Pause' : 'Resume'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-emerald-500 hover:text-emerald-400"
              onClick={() => onCrawl(source.id)}
              disabled={crawling}
            >
              {crawling ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5 mr-1" />
              )}
              Crawl now
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-muted-foreground hover:text-red-400"
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

function CrawlResultBanner({ results }: { results: ApiCrawlSourceResult[] }) {
  const total = results.reduce((s, r) => s + r.jobsCreated, 0)
  const failed = results.filter((r) => !r.success)
  return (
    <div className={`flex items-start gap-3 rounded-lg border p-3 text-sm ${failed.length ? 'border-amber-500/30 bg-amber-500/5' : 'border-emerald-500/30 bg-emerald-500/5'}`}>
      {failed.length ? (
        <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
      ) : (
        <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 shrink-0" />
      )}
      <div>
        <p className="font-medium">
          Crawl complete — {total} new job{total !== 1 ? 's' : ''} found
        </p>
        {failed.length > 0 && (
          <p className="text-xs text-muted-foreground mt-0.5">
            {failed.length} source{failed.length !== 1 ? 's' : ''} failed: {failed.map((r) => r.boardType).join(', ')}
          </p>
        )}
      </div>
    </div>
  )
}

export function JobBoardsPage() {
  const { toast } = useToast()
  const [sources, setSources] = useState<ApiJobBoardSource[]>([])
  const [loading, setLoading] = useState(true)
  const [crawlingAll, setCrawlingAll] = useState(false)
  const [crawlingId, setCrawlingId] = useState<number | null>(null)
  const [crawlResults, setCrawlResults] = useState<ApiCrawlSourceResult[] | null>(null)
  const [showAddDialog, setShowAddDialog] = useState(false)
  const [addLoading, setAddLoading] = useState(false)

  const [form, setForm] = useState<SourceFormState>({
    boardType: 'remotive',
    search: '',
    category: '',
    location: '',
    limit: '50',
  })

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

  async function handleCrawlAll() {
    setCrawlingAll(true)
    setCrawlResults(null)
    try {
      const result = await jobBoardsApi.crawlAll()
      setCrawlResults(result.results)
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
      setCrawlResults([result.result])
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
      toast({ title: 'Failed to update source', description: String(e), variant: 'destructive' })
    }
  }

  async function handleDelete(id: number) {
    try {
      await jobBoardsApi.deleteSource(id)
      setSources((prev) => prev.filter((s) => s.id !== id))
      toast({ title: 'Source removed' })
    } catch (e) {
      toast({ title: 'Failed to delete source', description: String(e), variant: 'destructive' })
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

      const data = await jobBoardsApi.createSource({
        boardType: form.boardType,
        searchConfig: config,
      })
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
        description="Configure job board crawlers that automatically hunt for matching roles across the web."
        actions={
          <div className="flex items-center gap-2">
            {sources.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleCrawlAll}
                disabled={crawlingAll}
              >
                {crawlingAll ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                )}
                Crawl All
              </Button>
            )}
            <Button size="sm" onClick={() => setShowAddDialog(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add Board
            </Button>
          </div>
        }
      />

      {crawlResults && (
        <CrawlResultBanner results={crawlResults} />
      )}

      {/* How it works info */}
      <Card className="border-dashed border-primary/20 bg-primary/[0.03]">
        <CardContent className="pt-4 pb-4">
          <div className="flex gap-3 text-sm">
            <Globe className="h-4 w-4 text-primary/60 mt-0.5 shrink-0" />
            <div className="space-y-1">
              <p className="font-medium text-foreground/80">How job board crawling works</p>
              <p className="text-muted-foreground text-xs leading-relaxed">
                Each source you configure will be crawled automatically every {' '}
                <span className="text-foreground/70">6 hours</span>. New jobs are scored against
                your profile, and high-scoring matches (above your pipeline threshold) will automatically
                trigger fit analysis, resume tailoring, and outreach drafting — landing in your
                <span className="text-foreground/70"> Inbox</span> for one-click approval.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : sources.length === 0 ? (
        <EmptyState
          icon={Globe}
          title="No job board sources yet"
          description="Add a job board source to start automatically discovering roles across the web."
          action={
            <Button size="sm" onClick={() => setShowAddDialog(true)}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add Your First Board
            </Button>
          }
        />
      ) : (
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

      {/* Add Source Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Job Board Source</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="space-y-1.5">
              <Label>Board</Label>
              <Select
                value={form.boardType}
                onValueChange={(v) => setForm((f) => ({ ...f, boardType: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
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
              <p className="text-xs text-muted-foreground">Leave blank to fetch all available jobs</p>
            </div>

            {form.boardType === 'remotive' && (
              <div className="space-y-1.5">
                <Label>Category (optional)</Label>
                <Select
                  value={form.category || '__all'}
                  onValueChange={(v) => setForm((f) => ({ ...f, category: v === '__all' ? '' : v }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">All categories</SelectItem>
                    {REMOTIVE_CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {(form.boardType === 'adzuna') && (
              <div className="space-y-1.5">
                <Label>Location (optional)</Label>
                <Input
                  placeholder="e.g. New York, London, Remote"
                  value={form.location}
                  onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Max results per crawl</Label>
              <Input
                type="number"
                min={10}
                max={200}
                value={form.limit}
                onChange={(e) => setForm((f) => ({ ...f, limit: e.target.value }))}
              />
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
