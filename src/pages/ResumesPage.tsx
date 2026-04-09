import { CheckCircle2, FileText, Loader2, Plus, Sparkles, Star, Trash2, Upload } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { resumesApi, profileApi, type ApiResume, type ApiExtractedProfile } from '@/services/api'
import { useToast } from '@/hooks/use-toast'
import { formatDate } from '@/lib/utils'

// ─── Profile Extraction Preview Dialog ───────────────────────────────────────

function ExtractProfileDialog({
  open,
  onOpenChange,
  resumeId,
  resumeTitle,
  onApplied,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  resumeId: number
  resumeTitle: string
  onApplied: () => void
}) {
  const { toast } = useToast()
  const [extracting, setExtracting] = useState(false)
  const [applying, setApplying] = useState(false)
  const [extracted, setExtracted] = useState<ApiExtractedProfile | null>(null)

  useEffect(() => {
    if (!open) { setExtracted(null); return }
    setExtracting(true)
    resumesApi.extractProfile(resumeId)
      .then((r) => setExtracted(r.extracted))
      .catch((e: unknown) => {
        toast({ title: 'Extraction failed', description: String(e), variant: 'destructive' })
        onOpenChange(false)
      })
      .finally(() => setExtracting(false))
  }, [open, resumeId])

  const applyToProfile = async () => {
    if (!extracted) return
    setApplying(true)
    try {
      await profileApi.update({
        fullName: extracted.fullName || undefined,
        email: extracted.email || undefined,
        linkedinUrl: extracted.linkedinUrl || undefined,
        personalSummary: extracted.personalSummary,
        targetTitles: extracted.targetTitles,
        targetSeniority: extracted.targetSeniority as never,
        preferredFunctions: extracted.preferredFunctions,
        preferredIndustries: extracted.preferredIndustries,
        preferredGeographies: extracted.preferredGeographies,
        keywordsBoost: extracted.keywordsBoost,
        keywordsPenalize: [],
        remotePreference: extracted.remotePreference,
        idealCompanyStage: extracted.idealCompanyStage,
        compensationNotes: '',
      } as never)
      toast({ title: 'Profile updated from CV', description: 'All match scores have been recalculated.', variant: 'success' })
      onApplied()
      onOpenChange(false)
    } catch (e) {
      toast({ title: 'Failed to apply', description: String(e), variant: 'destructive' })
    } finally {
      setApplying(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Extract Profile from CV
          </DialogTitle>
          <DialogDescription>
            AI will read <strong>{resumeTitle}</strong> and pre-fill your job search profile.
            Review the results before applying.
          </DialogDescription>
        </DialogHeader>

        {extracting ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm text-muted-foreground">Reading your CV…</p>
          </div>
        ) : extracted ? (
          <div className="space-y-4 mt-2">
            {extracted.fullName && (
              <Field label="Name" value={extracted.fullName} />
            )}
            {extracted.personalSummary && (
              <Field label="Summary" value={extracted.personalSummary} />
            )}
            <ListField label="Target titles" items={extracted.targetTitles} />
            <ListField label="Target seniority" items={extracted.targetSeniority} />
            <ListField label="Preferred functions" items={extracted.preferredFunctions} />
            <ListField label="Industries" items={extracted.preferredIndustries} />
            {extracted.preferredGeographies.length > 0 && (
              <ListField label="Locations" items={extracted.preferredGeographies} />
            )}
            <ListField label="Key skills / keywords" items={extracted.keywordsBoost} />
            <Field label="Remote preference" value={extracted.remotePreference.replace(/_/g, ' ')} />
            {extracted.idealCompanyStage.length > 0 && (
              <ListField label="Ideal company stage" items={extracted.idealCompanyStage} />
            )}

            <div className="flex justify-end gap-2 pt-4 border-t">
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={() => void applyToProfile()} disabled={applying}>
                {applying ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Apply to Profile
              </Button>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">{label}</p>
      <p className="text-sm">{value}</p>
    </div>
  )
}

function ListField({ label, items }: { label: string; items: string[] }) {
  if (!items.length) return null
  return (
    <div>
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1.5">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((item) => (
          <Badge key={item} variant="secondary" className="text-xs">{item}</Badge>
        ))}
      </div>
    </div>
  )
}

// ─── Upload Drop Zone ─────────────────────────────────────────────────────────

function UploadZone({ onUploaded }: { onUploaded: (resume: ApiResume) => void }) {
  const { toast } = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)

  const handleFile = async (file: File) => {
    if (!file.name.match(/\.(pdf|docx)$/i)) {
      toast({ title: 'Unsupported file', description: 'Only PDF and DOCX files are supported.', variant: 'destructive' })
      return
    }
    setUploading(true)
    try {
      const result = await resumesApi.upload(file, file.name.replace(/\.(pdf|docx)$/i, ''), true)
      toast({
        title: 'CV uploaded',
        description: `Extracted ${result.charCount.toLocaleString()} characters.`,
        variant: 'success',
      })
      onUploaded(result.resume)
    } catch (e) {
      toast({ title: 'Upload failed', description: String(e), variant: 'destructive' })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div
      className={`relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-10 transition-colors cursor-pointer
        ${dragging ? 'border-primary bg-primary/5' : 'border-border/60 hover:border-primary/50 hover:bg-muted/30'}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const file = e.dataTransfer.files[0]
        if (file) void handleFile(file)
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.docx"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f) }}
      />
      {uploading ? (
        <>
          <Loader2 className="h-10 w-10 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Uploading and parsing…</p>
        </>
      ) : (
        <>
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Upload className="h-7 w-7 text-primary" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium">Drop your CV here or click to browse</p>
            <p className="text-xs text-muted-foreground mt-1">PDF or DOCX · up to 10 MB</p>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Resume Form Dialog (manual paste) ───────────────────────────────────────

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
          <DialogTitle>{initial ? 'Edit Resume' : 'Paste Resume Text'}</DialogTitle>
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
              placeholder="Paste your resume text here…"
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export function ResumesPage() {
  const { toast } = useToast()
  const [resumes, setResumes] = useState<ApiResume[]>([])
  const [loading, setLoading] = useState(true)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ApiResume | undefined>()
  const [extractOpen, setExtractOpen] = useState(false)
  const [extractTarget, setExtractTarget] = useState<ApiResume | null>(null)

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

  const handleUploaded = async (resume: ApiResume) => {
    await load()
    // Automatically offer profile extraction for newly uploaded CV
    setExtractTarget(resume)
    setExtractOpen(true)
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Resume Library"
        description="Upload your CV or paste text. The base resume is used in all AI agent workflows."
        actions={
          <Button variant="outline" onClick={() => { setEditing(undefined); setDialogOpen(true) }}>
            <Plus className="mr-2 h-4 w-4" /> Paste Text
          </Button>
        }
      />

      <ResumeDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSaved={() => void load()}
        initial={editing}
      />

      {extractTarget && (
        <ExtractProfileDialog
          open={extractOpen}
          onOpenChange={setExtractOpen}
          resumeId={extractTarget.id}
          resumeTitle={extractTarget.title}
          onApplied={() => void load()}
        />
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : resumes.length === 0 ? (
        <div className="space-y-6">
          <Card className="border-primary/20 bg-primary/[0.03]">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Upload your CV to get started</CardTitle>
              <CardDescription>
                Drop your PDF or DOCX and the app will parse it, then offer to auto-fill your profile.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <UploadZone onUploaded={(r) => void handleUploaded(r)} />
            </CardContent>
          </Card>
          <EmptyState
            icon={FileText}
            title="No resumes yet"
            description="Upload your CV above or paste text manually."
            action={
              <Button variant="outline" onClick={() => { setEditing(undefined); setDialogOpen(true) }}>
                <Plus className="mr-2 h-4 w-4" /> Paste Text Instead
              </Button>
            }
          />
        </div>
      ) : (
        <div className="space-y-6">
          <Card className="border-border/60 bg-muted/20">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">Upload another CV</CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <UploadZone onUploaded={(r) => void handleUploaded(r)} />
            </CardContent>
          </Card>

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
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setEditing(r); setDialogOpen(true) }}>
                      Edit
                    </Button>
                    {r.rawText && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => { setExtractTarget(r); setExtractOpen(true) }}
                      >
                        <Sparkles className="h-3.5 w-3.5 text-primary" />
                        Extract Profile
                      </Button>
                    )}
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
        </div>
      )}
    </div>
  )
}
