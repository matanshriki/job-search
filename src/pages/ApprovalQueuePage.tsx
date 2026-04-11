import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Inbox,
  Loader2,
  Pencil,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { EmptyState } from '@/components/ui/empty-state'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { queueApi, type ApiApprovalQueueItem, type ApiApprovalQueuePayload } from '@/services/api'
import { useToast } from '@/hooks/use-toast'
import { formatDistanceToNow } from 'date-fns'

function parsePayload(item: ApiApprovalQueueItem): ApiApprovalQueuePayload {
  try {
    return JSON.parse(item.payloadJson) as ApiApprovalQueuePayload
  } catch {
    return {
      fitScore: 0, fitSummary: '', jobTitle: '', company: '',
      jobUrl: '', outreachDraft: '', resumeBullets: '',
    }
  }
}

function tryParseOutreach(raw: string): { recruiterMessage?: string; linkedinNote?: string; coverNote?: string } {
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed as Record<string, string>
  } catch { /* string was not JSON */ }
  return { recruiterMessage: raw }
}

function tryParseResume(raw: string): { tailoredSummary?: string; prioritizedBullets?: string[] } {
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === 'object') return parsed as Record<string, unknown>
  } catch { /* string was not JSON */ }
  return {}
}

function FitScoreBadge({ score }: { score: number }) {
  const color =
    score >= 80 ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' :
    score >= 65 ? 'bg-amber-500/15 text-amber-400 border-amber-500/20' :
    'bg-muted text-muted-foreground border-border/50'
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${color}`}>
      {score}/100
    </span>
  )
}

function QueueItemCard({
  item,
  onApprove,
  onReject,
  actionLoading,
}: {
  item: ApiApprovalQueueItem
  onApprove: (id: number) => void
  onReject: (id: number) => void
  actionLoading: number | null
}) {
  const payload = parsePayload(item)
  const outreach = tryParseOutreach(payload.outreachDraft || '')
  const resume = tryParseResume(payload.resumeBullets || '')
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editDraft, setEditDraft] = useState(outreach.recruiterMessage ?? '')
  const { toast } = useToast()

  async function handleSaveEdit() {
    try {
      const updatedOutreach = { ...outreach, recruiterMessage: editDraft }
      const updatedPayload = { ...payload, outreachDraft: JSON.stringify(updatedOutreach) }
      await queueApi.update(item.id, updatedPayload)
      setEditing(false)
      toast({ title: 'Draft updated' })
    } catch (e) {
      toast({ title: 'Failed to save', description: String(e), variant: 'destructive' })
    }
  }

  const isPending = item.status === 'pending_review'
  const isLoading = actionLoading === item.id

  return (
    <Card className={`border-border/60 transition-colors ${
      item.status === 'approved' ? 'bg-emerald-500/[0.04] border-emerald-500/20' :
      item.status === 'rejected' ? 'bg-muted/30 opacity-60' :
      'bg-card/40'
    }`}>
      <CardHeader className="pb-3">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link
                to={`/jobs/${item.jobPostingId}`}
                className="text-base font-semibold hover:underline truncate"
              >
                {payload.jobTitle || item.jobPosting?.title || `Job #${item.jobPostingId}`}
              </Link>
              <FitScoreBadge score={payload.fitScore} />
              {item.status !== 'pending_review' && (
                <Badge
                  variant="secondary"
                  className={`text-[10px] capitalize ${
                    item.status === 'approved' ? 'text-emerald-400' :
                    item.status === 'rejected' ? 'text-red-400' : ''
                  }`}
                >
                  {item.status}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5">
              {payload.company || item.jobPosting?.company?.name}
              {payload.jobUrl && (
                <a
                  href={payload.jobUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-2 inline-flex items-center gap-0.5 text-xs text-primary/70 hover:text-primary"
                >
                  <ExternalLink className="h-3 w-3" />
                  View job
                </a>
              )}
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {isPending && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2.5 text-xs text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10"
                  onClick={() => onApprove(item.id)}
                  disabled={isLoading}
                >
                  {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ThumbsUp className="h-3.5 w-3.5 mr-1" />}
                  Approve
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2.5 text-xs text-muted-foreground hover:text-red-400 hover:bg-red-500/10"
                  onClick={() => onReject(item.id)}
                  disabled={isLoading}
                >
                  <ThumbsDown className="h-3.5 w-3.5 mr-1" />
                  Skip
                </Button>
              </>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="h-8 w-8 p-0 text-muted-foreground"
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
          </div>
        </div>

        {/* Fit summary */}
        {payload.fitSummary && (
          <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed border-l-2 border-primary/20 pl-3">
            {payload.fitSummary}
          </p>
        )}
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 space-y-4">
          {/* Outreach draft */}
          {(outreach.recruiterMessage || outreach.linkedinNote || outreach.coverNote) && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
                  Outreach Draft
                </p>
                {isPending && !editing && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs"
                    onClick={() => { setEditing(true); setEditDraft(outreach.recruiterMessage ?? '') }}
                  >
                    <Pencil className="h-3 w-3 mr-1" />
                    Edit
                  </Button>
                )}
              </div>
              {editing ? (
                <div className="space-y-2">
                  <Textarea
                    className="text-xs min-h-[120px] bg-background/50"
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                  />
                  <div className="flex justify-end gap-1.5">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(false)}>
                      <X className="h-3 w-3 mr-1" />Cancel
                    </Button>
                    <Button size="sm" className="h-7 text-xs" onClick={handleSaveEdit}>
                      <CheckCircle2 className="h-3 w-3 mr-1" />Save
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-md bg-background/40 border border-border/40 p-3 space-y-2.5">
                  {outreach.recruiterMessage && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-1">
                        Recruiter Message
                      </p>
                      <p className="text-xs leading-relaxed text-foreground/80 whitespace-pre-wrap">
                        {outreach.recruiterMessage}
                      </p>
                    </div>
                  )}
                  {outreach.linkedinNote && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-1">
                        LinkedIn Note
                      </p>
                      <p className="text-xs leading-relaxed text-foreground/80">
                        {outreach.linkedinNote}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Resume bullets */}
          {(resume.tailoredSummary || (resume.prioritizedBullets && resume.prioritizedBullets.length > 0)) && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/70">
                Resume Tailoring
              </p>
              <div className="rounded-md bg-background/40 border border-border/40 p-3 space-y-2.5">
                {resume.tailoredSummary && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-1">
                      Tailored Summary
                    </p>
                    <p className="text-xs leading-relaxed text-foreground/80">{resume.tailoredSummary}</p>
                  </div>
                )}
                {resume.prioritizedBullets && resume.prioritizedBullets.length > 0 && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 mb-1">
                      Priority Bullets
                    </p>
                    <ul className="space-y-1">
                      {resume.prioritizedBullets.map((bullet, i) => (
                        <li key={i} className="text-xs text-foreground/80 flex gap-1.5">
                          <span className="text-primary/50 shrink-0 mt-0.5">•</span>
                          {bullet}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="text-xs text-muted-foreground/60">
            Generated {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
            {item.reviewedAt && ` · reviewed ${formatDistanceToNow(new Date(item.reviewedAt), { addSuffix: true })}`}
          </div>
        </CardContent>
      )}
    </Card>
  )
}

export function ApprovalQueuePage() {
  const { toast } = useToast()
  const [items, setItems] = useState<ApiApprovalQueueItem[]>([])
  const [pendingCount, setPendingCount] = useState(0)
  const [totalCount, setTotalCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [clearLoading, setClearLoading] = useState(false)
  const [statusFilter, setStatusFilter] = useState('pending_review')
  const [actionLoading, setActionLoading] = useState<number | null>(null)

  async function loadItems(status: string) {
    setLoading(true)
    try {
      const data = await queueApi.list({ status: status === 'all' ? 'all' : status })
      setItems(data.items)
      setPendingCount(data.pendingCount)
      setTotalCount(data.totalCount ?? data.items.length)
    } catch {
      toast({ title: 'Failed to load inbox', variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadItems(statusFilter) }, [statusFilter])

  async function handleApprove(id: number) {
    setActionLoading(id)
    try {
      await queueApi.approve(id)
      setItems((prev) => prev.map((i) => i.id === id ? { ...i, status: 'approved', reviewedAt: new Date().toISOString() } : i))
      setPendingCount((c) => Math.max(0, c - 1))
      toast({ title: 'Application approved', description: 'Job moved to Applied status.' })
    } catch (e) {
      toast({ title: 'Failed to approve', description: String(e), variant: 'destructive' })
    } finally {
      setActionLoading(null)
    }
  }

  async function handleReject(id: number) {
    setActionLoading(id)
    try {
      await queueApi.reject(id)
      setItems((prev) => prev.map((i) => i.id === id ? { ...i, status: 'rejected', reviewedAt: new Date().toISOString() } : i))
      setPendingCount((c) => Math.max(0, c - 1))
      toast({ title: 'Application skipped' })
    } catch (e) {
      toast({ title: 'Failed to reject', description: String(e), variant: 'destructive' })
    } finally {
      setActionLoading(null)
    }
  }

  async function handleClearInbox() {
    if (
      !window.confirm(
        'Remove every item in your inbox (pending, approved, and skipped)? Jobs in your feed are not deleted — only these prepared packages. This cannot be undone.',
      )
    ) {
      return
    }
    setClearLoading(true)
    try {
      const r = await queueApi.clearAll()
      toast({
        title: 'Inbox cleared',
        description: r.deleted === 0 ? 'Nothing was in your inbox.' : `Removed ${r.deleted} item(s).`,
      })
      await loadItems(statusFilter)
    } catch (e) {
      toast({ title: 'Could not clear inbox', description: String(e), variant: 'destructive' })
    } finally {
      setClearLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inbox"
        description="Applications prepared by your agents, ready for your review and one-click approval."
        actions={
          <div className="flex items-center gap-2">
            {pendingCount > 0 ? (
              <Badge className="text-sm px-3 py-1">
                {pendingCount} pending
              </Badge>
            ) : null}
            {totalCount > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-destructive border-destructive/30 hover:bg-destructive/10"
                disabled={clearLoading || loading}
                onClick={handleClearInbox}
              >
                {clearLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5 mr-1.5" />}
                Clear entire inbox
              </Button>
            )}
          </div>
        }
      />

      <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v)}>
        <TabsList>
          <TabsTrigger value="pending_review">
            Pending {pendingCount > 0 && <Badge variant="secondary" className="ml-1.5 text-[10px] h-4 px-1">{pendingCount}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="approved">Approved</TabsTrigger>
          <TabsTrigger value="rejected">Skipped</TabsTrigger>
          <TabsTrigger value="all">All</TabsTrigger>
        </TabsList>
      </Tabs>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title={statusFilter === 'pending_review' ? 'Your inbox is empty' : 'No items here'}
          description={
            statusFilter === 'pending_review'
              ? 'When agents prepare application packages for high-scoring roles, they\'ll appear here for your approval.'
              : 'No items match this filter.'
          }
        />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <QueueItemCard
              key={item.id}
              item={item}
              onApprove={handleApprove}
              onReject={handleReject}
              actionLoading={actionLoading}
            />
          ))}
        </div>
      )}
    </div>
  )
}
