import { FileText, Plus, Star, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { resumesApi, type ApiResume } from '@/services/api'
import { useToast } from '@/hooks/use-toast'
import { formatDate } from '@/lib/utils'

function ResumeDialog({
  open,
  onOpenChange,
  onSaved,
  initial,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onSaved: () => void
  initial?: ApiResume
}) {
  const { toast } = useToast()
  const [title, setTitle] = useState(initial?.title ?? '')
  const [rawText, setRawText] = useState(initial?.rawText ?? '')
  const [isBase, setIsBase] = useState(initial?.isBaseResume ?? false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (initial) { setTitle(initial.title); setRawText(initial.rawText); setIsBase(initial.isBaseResume) }
    else { setTitle(''); setRawText(''); setIsBase(false) }
  }, [initial, open])

  const handleSave = async () => {
    if (!title.trim()) { toast({ title: 'Title required', variant: 'destructive' }); return }
    setSaving(true)
    try {
      if (initial) {
        await resumesApi.update(initial.id, { title, rawText, isBaseResume: isBase })
      } else {
        await resumesApi.create({ title, rawText, isBaseResume: isBase })
      }
      onSaved()
      onOpenChange(false)
      toast({ title: initial ? 'Resume updated' : 'Resume added', variant: 'success' })
    } catch (e) {
      toast({ title: 'Failed to save', description: String(e), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit Resume' : 'Add Resume'}</DialogTitle>
          <DialogDescription>
            Paste your resume text. This is used by AI agents to generate tailored suggestions.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div>
            <Label htmlFor="resume-title">Title</Label>
            <Input id="resume-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Base Resume, PS Leadership Variant" className="mt-1" />
          </div>
          <div>
            <Label htmlFor="resume-text">Resume Text</Label>
            <Textarea
              id="resume-text"
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Paste your resume text here..."
              className="mt-1 min-h-[300px] font-mono text-xs"
            />
          </div>
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="is-base"
              checked={isBase}
              onChange={(e) => setIsBase(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            <Label htmlFor="is-base" className="text-sm">Set as base resume (used by default in agent workflows)</Label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={() => void handleSave()} disabled={saving}>
              {saving ? 'Saving…' : 'Save Resume'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function ResumesPage() {
  const { toast } = useToast()
  const [resumes, setResumes] = useState<ApiResume[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ApiResume | undefined>()

  const load = async () => {
    try {
      const res = await resumesApi.list()
      setResumes(res.resumes)
    } catch (e) {
      toast({ title: 'Failed to load resumes', description: String(e), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [])

  const handleDelete = async (id: number) => {
    try {
      await resumesApi.delete(id)
      setResumes((prev) => prev.filter((r) => r.id !== id))
      toast({ title: 'Resume removed', variant: 'default' })
    } catch (e) {
      toast({ title: 'Cannot delete', description: String(e), variant: 'destructive' })
    }
  }

  const handleSetBase = async (id: number) => {
    try {
      await resumesApi.update(id, { isBaseResume: true })
      await load()
      toast({ title: 'Base resume updated', variant: 'success' })
    } catch (e) {
      toast({ title: 'Failed', description: String(e), variant: 'destructive' })
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Resume Library"
        description="Store and manage your resume variants. The base resume is used by default in all agent workflows."
        actions={
          <Button onClick={() => { setEditing(undefined); setDialogOpen(true) }}>
            <Plus className="mr-2 h-4 w-4" /> Add Resume
          </Button>
        }
      />

      <ResumeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={() => void load()}
        initial={editing}
      />

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : resumes.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No resumes yet"
          description="Add your base resume to enable AI-powered tailoring, outreach, and interview prep."
          action={
            <Button onClick={() => { setEditing(undefined); setDialogOpen(true) }}>
              <Plus className="mr-2 h-4 w-4" /> Add Resume
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {resumes.map((r) => (
            <Card key={r.id} className={r.isBaseResume ? 'border-primary/30 bg-primary/5' : 'border-border/70 bg-card/60'}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 shrink-0 text-primary" />
                    <CardTitle className="text-base truncate">{r.title}</CardTitle>
                  </div>
                  {r.isBaseResume && (
                    <Badge className="shrink-0 bg-primary/20 text-primary border-primary/30">
                      <Star className="mr-1 h-3 w-3" /> Base
                    </Badge>
                  )}
                </div>
                <CardDescription className="text-xs">
                  Updated {formatDate(r.updatedAt)} · {r.rawText.split(/\s+/).length.toLocaleString()} words
                </CardDescription>
              </CardHeader>
              <CardContent>
                {r.rawText ? (
                  <p className="text-xs text-muted-foreground line-clamp-3 leading-relaxed">{r.rawText}</p>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No text — paste resume content to enable agent workflows.</p>
                )}
                <div className="mt-4 flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => { setEditing(r); setDialogOpen(true) }}>
                    Edit
                  </Button>
                  {!r.isBaseResume && (
                    <Button size="sm" variant="outline" onClick={() => void handleSetBase(r.id)}>
                      <Star className="mr-1 h-3.5 w-3.5" /> Set as Base
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto text-destructive hover:text-destructive"
                    onClick={() => void handleDelete(r.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
