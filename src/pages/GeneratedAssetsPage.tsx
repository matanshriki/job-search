import { Copy, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { agentsApi, type ApiGeneratedAsset } from '@/services/api'
import { useToast } from '@/hooks/use-toast'
import { formatDate } from '@/lib/utils'

const ASSET_LABELS: Record<string, string> = {
  fit_analysis: 'Fit Analysis',
  resume_tailoring: 'Resume Tailoring',
  outreach_message: 'Outreach Message',
  cover_note: 'Cover Note',
  interview_prep: 'Interview Prep',
  company_brief: 'Company Brief',
}

const ASSET_COLORS: Record<string, string> = {
  fit_analysis: 'bg-blue-500/10 text-blue-300 border-blue-500/20',
  resume_tailoring: 'bg-violet-500/10 text-violet-300 border-violet-500/20',
  outreach_message: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  cover_note: 'bg-teal-500/10 text-teal-300 border-teal-500/20',
  interview_prep: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
  company_brief: 'bg-pink-500/10 text-pink-300 border-pink-500/20',
}

function AssetCard({ asset }: { asset: ApiGeneratedAsset }) {
  const { toast } = useToast()
  const [expanded, setExpanded] = useState(false)

  let parsed: Record<string, unknown> | null = null
  try { parsed = JSON.parse(asset.content) } catch { /* raw content */ }

  const handleCopy = () => {
    void navigator.clipboard.writeText(asset.content)
    toast({ title: 'Copied to clipboard', variant: 'success' })
  }

  return (
    <Card className="border-border/70 bg-card/60">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <Badge
                variant="outline"
                className={`text-[10px] uppercase tracking-wide ${ASSET_COLORS[asset.assetType] ?? ''}`}
              >
                {ASSET_LABELS[asset.assetType] ?? asset.assetType}
              </Badge>
              {asset.version > 1 && <Badge variant="secondary" className="text-[10px]">v{asset.version}</Badge>}
              {asset.modelName === 'mock' && <Badge variant="secondary" className="text-[10px]">Mock</Badge>}
            </div>
            {asset.jobPosting && (
              <CardTitle className="text-sm font-medium">
                <Link to={`/jobs/${asset.jobPosting.id}`} className="hover:text-primary transition-colors">
                  {asset.jobPosting.title}
                </Link>
              </CardTitle>
            )}
          </div>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={handleCopy}>
              <Copy className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
        <CardDescription className="text-xs">{formatDate(asset.createdAt)}</CardDescription>
      </CardHeader>
      <CardContent>
        {parsed ? (
          <div className="space-y-2">
            {Object.entries(parsed).slice(0, expanded ? undefined : 3).map(([k, v]) => (
              <div key={k}>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                  {k.replace(/([A-Z])/g, ' $1').trim()}
                </p>
                {Array.isArray(v) ? (
                  <ul className="list-disc list-inside space-y-0.5">
                    {(v as string[]).slice(0, 3).map((item, i) => (
                      <li key={i} className="text-xs text-muted-foreground">{item}</li>
                    ))}
                    {(v as string[]).length > 3 && <li className="text-xs text-muted-foreground">+{(v as string[]).length - 3} more…</li>}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground line-clamp-3">{String(v)}</p>
                )}
              </div>
            ))}
            {Object.keys(parsed).length > 3 && (
              <Button variant="ghost" size="sm" className="h-6 text-xs px-0 text-primary" onClick={() => setExpanded(!expanded)}>
                {expanded ? 'Show less' : `Show ${Object.keys(parsed).length - 3} more fields`}
              </Button>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground whitespace-pre-wrap line-clamp-6">{asset.content}</p>
        )}
      </CardContent>
    </Card>
  )
}

export function GeneratedAssetsPage() {
  const { toast } = useToast()
  const [assets, setAssets] = useState<ApiGeneratedAsset[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')

  const load = async (type?: string) => {
    try {
      const res = await agentsApi.getAllAssets({ assetType: type !== 'all' ? type : undefined, limit: '100' })
      setAssets(res.assets)
    } catch (e) {
      toast({ title: 'Failed to load assets', description: String(e), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load(filter) }, [filter])

  return (
    <div className="space-y-8">
      <PageHeader
        title="Generated Assets"
        description="All AI-generated content — fit analyses, resume tailoring suggestions, outreach messages, and interview prep materials."
        actions={
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {Object.entries(ASSET_LABELS).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : assets.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No generated assets yet"
          description="Open a job detail page and run an agent (Fit Analysis, Resume Tailoring, Outreach, or Interview Prep) to generate content."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {assets.map((a) => <AssetCard key={a.id} asset={a} />)}
        </div>
      )}
    </div>
  )
}
