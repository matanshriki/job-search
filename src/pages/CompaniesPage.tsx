import { formatDistanceToNow } from 'date-fns'
import { ChevronDown, ExternalLink, Loader2, Plus, ScanSearch, Sparkles, Trash2, Wand2 } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { EmptyState } from '@/components/ui/empty-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { COMPANY_PRIORITY_LABEL } from '@/domain/constants'
import type { CompanyPriority, TrackedCompany } from '@/domain/types'
import { useAppState } from '@/context/app-state'
import { agentsApi, type ApiCompanySuggestion } from '@/services/api'
import { useToast } from '@/hooks/use-toast'
import { formatDate } from '@/lib/utils'

const emptyForm = {
  name: '',
  website: '',
  careerPageUrl: '',
  notes: '',
  priority: 'medium' as CompanyPriority,
}

export function CompaniesPage() {
  const { data, addCompany, updateCompany, deleteCompany, scanCompany, pasteHtmlForCompany } =
    useAppState()
  const { toast } = useToast()
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState<TrackedCompany | null>(null)
  const [scanningId, setScanningId] = useState<string | null>(null)
  const [pasteOpenId, setPasteOpenId] = useState<string | null>(null)
  const [pasteHtml, setPasteHtml] = useState('')
  const [pasteBaseUrl, setPasteBaseUrl] = useState('')

  // ── Bulk selection state ─────────────────────────────────────────────────────
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const selectAll = () => setSelectedIds(new Set(data.companies.map((c) => c.id)))
  const clearSelection = () => setSelectedIds(new Set())

  const bulkDelete = async () => {
    if (!selectedIds.size) return
    setBulkDeleting(true)
    try {
      for (const id of selectedIds) {
        await deleteCompany(id)
      }
      toast({
        title: `${selectedIds.size} ${selectedIds.size === 1 ? 'company' : 'companies'} removed`,
        variant: 'success',
      })
      clearSelection()
    } catch (e) {
      toast({ title: 'Delete failed', description: String(e), variant: 'destructive' })
    } finally {
      setBulkDeleting(false)
    }
  }

  const [inferringUrl, setInferringUrl] = useState(false)

  const handleInferUrl = async () => {
    if (!form.name.trim()) {
      toast({ title: 'Enter a company name first', variant: 'destructive' })
      return
    }
    setInferringUrl(true)
    try {
      const result = await agentsApi.inferCareersUrl(form.name.trim())
      setForm((f) => ({
        ...f,
        careerPageUrl: result.careersUrl,
        website: f.website || result.companyDomain,
      }))
      toast({
        title: `Found ${result.atsProvider !== 'other' ? result.atsProvider.charAt(0).toUpperCase() + result.atsProvider.slice(1) + ' board' : 'careers page'}`,
        description: `Confidence: ${result.confidence}. Review the URL before saving.`,
        variant: 'success',
      })
    } catch (e) {
      toast({ title: 'Could not infer URL', description: String(e), variant: 'destructive' })
    } finally {
      setInferringUrl(false)
    }
  }

  // ── Company Discovery state ──────────────────────────────────────────────────
  const [discoverOpen, setDiscoverOpen] = useState(false)
  const [discoverLoading, setDiscoverLoading] = useState(false)
  const [discoverSource, setDiscoverSource] = useState<'ai' | 'curated' | null>(null)
  const [discoverMessage, setDiscoverMessage] = useState('')
  const [suggestions, setSuggestions] = useState<ApiCompanySuggestion[]>([])
  const [selectedSuggestions, setSelectedSuggestions] = useState<Set<string>>(new Set())
  const [addingCompanies, setAddingCompanies] = useState(false)

  const trackedNames = new Set(data.companies.map((c) => c.name.toLowerCase()))

  const openDiscover = async () => {
    setDiscoverOpen(true)
    setDiscoverLoading(true)
    setSuggestions([])
    setSelectedSuggestions(new Set())
    setDiscoverSource(null)
    try {
      const result = await agentsApi.discoverCompanies()
      setSuggestions(result.suggestions)
      setDiscoverSource(result.source)
      setDiscoverMessage(result.message)
      // Pre-select all suggestions that aren't already tracked
      const preselected = new Set(
        result.suggestions
          .filter((s) => !trackedNames.has(s.name.toLowerCase()))
          .map((s) => s.name),
      )
      setSelectedSuggestions(preselected)
    } catch (e) {
      toast({ title: 'Discovery failed', description: String(e), variant: 'destructive' })
      setDiscoverOpen(false)
    } finally {
      setDiscoverLoading(false)
    }
  }

  const toggleSuggestion = (name: string) => {
    setSelectedSuggestions((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  const addSelectedCompanies = async () => {
    const toAdd = suggestions.filter((s) => selectedSuggestions.has(s.name))
    if (!toAdd.length) return
    setAddingCompanies(true)
    try {
      for (const s of toAdd) {
        await addCompany({
          name: s.name,
          website: s.companyDomain || s.careersUrl.replace(/^https?:\/\//, '').split('/')[0],
          careerPageUrl: s.careersUrl,
          notes: s.whyRelevant,
          priority: s.priority === 'high' ? 'high' : 'medium',
        })
      }
      toast({
        title: `${toAdd.length} companies added`,
        description: 'Go to each company card and click "Scan jobs" to fetch open roles.',
        variant: 'success',
      })
      setDiscoverOpen(false)
    } catch (e) {
      toast({ title: 'Failed to add companies', description: String(e), variant: 'destructive' })
    } finally {
      setAddingCompanies(false)
    }
  }

  const relevantForCompany = (companyId: string) =>
    data.jobs.filter((j) => j.companyId === companyId && j.score >= 65).length

  const submitCompany = () => {
    if (!form.name.trim() || !form.careerPageUrl.trim()) return
    if (editing) {
      updateCompany({
        ...editing,
        name: form.name.trim(),
        website: form.website.trim(),
        careerPageUrl: form.careerPageUrl.trim(),
        notes: form.notes.trim(),
        priority: form.priority,
      })
    } else {
      addCompany({
        name: form.name.trim(),
        website: form.website.trim(),
        careerPageUrl: form.careerPageUrl.trim(),
        notes: form.notes.trim(),
        priority: form.priority,
      })
    }
    setOpen(false)
    setEditing(null)
    setForm(emptyForm)
  }

  const openEdit = (c: TrackedCompany) => {
    setEditing(c)
    setForm({
      name: c.name,
      website: c.website,
      careerPageUrl: c.careerPageUrl,
      notes: c.notes,
      priority: c.priority,
    })
    setOpen(true)
  }

  const runScan = async (id: string) => {
    setScanningId(id)
    try {
      await scanCompany(id)
    } finally {
      setScanningId(null)
    }
  }

  const runPaste = async (companyId: string) => {
    setScanningId(companyId)
    try {
      await pasteHtmlForCompany(companyId, pasteHtml, pasteBaseUrl)
      setPasteOpenId(null)
      setPasteHtml('')
      setPasteBaseUrl('')
    } finally {
      setScanningId(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Companies tracker"
        description="Track employers, store career URLs, and run scans. On GitHub Pages, scans use a public CORS relay when the browser is blocked; dev uses the local Vite proxy. Paste HTML still works everywhere."
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={openDiscover}>
              <Sparkles className="h-4 w-4" />
              Discover companies
            </Button>
          <Dialog
            open={open}
            onOpenChange={(v) => {
              setOpen(v)
              if (!v) {
                setEditing(null)
                setForm(emptyForm)
              }
            }}
          >
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" />
                Add company
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
              <DialogHeader>
                <DialogTitle>{editing ? 'Edit company' : 'Add company'}</DialogTitle>
                <DialogDescription>
                  Store the public career or Greenhouse board URL. No LinkedIn automation — ever.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-3 py-2">
                <div>
                  <Label htmlFor="co-name">Company name</Label>
                  <Input
                    id="co-name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="co-web">Website</Label>
                  <Input
                    id="co-web"
                    value={form.website}
                    onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))}
                    className="mt-1"
                    placeholder="https://"
                  />
                </div>
                <div>
                  <Label htmlFor="co-career">Career page URL</Label>
                  <div className="flex gap-2 mt-1">
                    <Input
                      id="co-career"
                      value={form.careerPageUrl}
                      onChange={(e) => setForm((f) => ({ ...f, careerPageUrl: e.target.value }))}
                      placeholder="https://boards.greenhouse.io/your-slug"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="shrink-0"
                      title="Auto-detect careers URL from company name"
                      onClick={() => void handleInferUrl()}
                      disabled={inferringUrl}
                    >
                      {inferringUrl ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                    </Button>
                  </div>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    {import.meta.env.DEV ? (
                      <>
                        With <span className="font-mono text-[10px]">npm run dev</span>, HTML is loaded
                        through the dev server (avoids CORS for most public career pages).{' '}
                      </>
                    ) : null}
                    For Greenhouse, the slug must be real (the path after{' '}
                    <span className="font-mono text-[10px]">boards.greenhouse.io/</span>
                    ). Fake slugs return API 404. On the live site, scans may use a public CORS relay;
                    use <strong className="text-foreground">Paste HTML</strong> if a site blocks that too.
                  </p>
                </div>
                <div>
                  <Label>Priority</Label>
                  <Select
                    value={form.priority}
                    onValueChange={(v) =>
                      setForm((f) => ({ ...f, priority: v as CompanyPriority }))
                    }
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.keys(COMPANY_PRIORITY_LABEL) as CompanyPriority[]).map((p) => (
                        <SelectItem key={p} value={p}>
                          {COMPANY_PRIORITY_LABEL[p]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="co-notes">Notes</Label>
                  <Textarea
                    id="co-notes"
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    className="mt-1"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="button" onClick={submitCompany}>
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          </div>
        }
      />

      {/* ── Company Discovery modal ─────────────────────────────────────────── */}
      <Dialog open={discoverOpen} onOpenChange={setDiscoverOpen}>
        <DialogContent className="flex max-h-[90vh] flex-col gap-0 p-0 sm:max-w-2xl">
          <DialogHeader className="border-b border-border/60 px-6 py-4">
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-primary" />
              Discover relevant companies
            </DialogTitle>
            <DialogDescription>
              {discoverLoading
                ? 'Analyzing your profile and finding relevant companies…'
                : discoverSource === 'ai'
                  ? `AI-personalized · ${discoverMessage}`
                  : discoverSource === 'curated'
                    ? `Curated list · ${discoverMessage}`
                    : 'Select companies to add to your tracker.'}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {discoverLoading ? (
              <div className="flex flex-col items-center gap-3 py-12 text-muted-foreground">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <p className="text-sm">Fetching company suggestions…</p>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Select / deselect all */}
                <div className="flex items-center justify-between pb-2 text-xs text-muted-foreground">
                  <span>
                    {selectedSuggestions.size} of {suggestions.filter((s) => !trackedNames.has(s.name.toLowerCase())).length} new companies selected
                  </span>
                  <div className="flex gap-3">
                    <button
                      className="underline underline-offset-2 hover:text-foreground"
                      onClick={() =>
                        setSelectedSuggestions(
                          new Set(
                            suggestions
                              .filter((s) => !trackedNames.has(s.name.toLowerCase()))
                              .map((s) => s.name),
                          ),
                        )
                      }
                    >
                      Select all new
                    </button>
                    <button
                      className="underline underline-offset-2 hover:text-foreground"
                      onClick={() => setSelectedSuggestions(new Set())}
                    >
                      Deselect all
                    </button>
                  </div>
                </div>

                {suggestions.map((s) => {
                  const alreadyTracked = trackedNames.has(s.name.toLowerCase())
                  const isSelected = selectedSuggestions.has(s.name)
                  return (
                    <div
                      key={s.name}
                      className={`flex items-start gap-3 rounded-lg border px-4 py-3 transition-colors ${
                        alreadyTracked
                          ? 'border-border/40 bg-muted/20 opacity-60'
                          : isSelected
                            ? 'border-primary/40 bg-primary/5'
                            : 'border-border/60 hover:border-border'
                      }`}
                    >
                      <Checkbox
                        checked={isSelected}
                        disabled={alreadyTracked}
                        onCheckedChange={() => !alreadyTracked && toggleSuggestion(s.name)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium leading-tight">{s.name}</span>
                          <Badge
                            variant={s.priority === 'high' ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {s.priority}
                          </Badge>
                          {alreadyTracked && (
                            <Badge variant="outline" className="text-xs">
                              already tracked
                            </Badge>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">
                          {s.whyRelevant}
                        </p>
                        <div className="mt-1 flex items-center gap-2">
                          {s.atsProvider && s.atsProvider !== 'other' && (
                            <Badge variant="secondary" className="text-xs capitalize py-0">
                              {s.atsProvider}
                            </Badge>
                          )}
                          <a
                            href={s.careersUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {s.careersUrl.replace(/^https?:\/\//, '').slice(0, 50)}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <DialogFooter className="border-t border-border/60 px-6 py-4">
            <Button variant="outline" onClick={() => setDiscoverOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={addSelectedCompanies}
              disabled={selectedSuggestions.size === 0 || addingCompanies || discoverLoading}
            >
              {addingCompanies ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Adding…
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4" />
                  Add {selectedSuggestions.size} {selectedSuggestions.size === 1 ? 'company' : 'companies'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Bulk action bar (appears when ≥1 company selected) ──────────────── */}
      {selectedIds.size > 0 && (
        <div className="sticky top-4 z-20 flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-lg">
          <div className="flex items-center gap-3">
            <Checkbox
              checked={selectedIds.size === data.companies.length}
              onCheckedChange={(v) => (v ? selectAll() : clearSelection())}
            />
            <span className="text-sm font-medium">
              {selectedIds.size} of {data.companies.length} selected
            </span>
            <button
              className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              onClick={clearSelection}
            >
              Clear
            </button>
          </div>
          <Button
            variant="destructive"
            size="sm"
            onClick={bulkDelete}
            disabled={bulkDeleting}
          >
            {bulkDeleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Delete {selectedIds.size} {selectedIds.size === 1 ? 'company' : 'companies'}
          </Button>
        </div>
      )}

      {data.companies.length === 0 ? (
        <EmptyState
          icon={ScanSearch}
          title="No companies tracked"
          description='Add employers you care about, or click "Discover companies" to get AI-powered suggestions based on your profile.'
        />
      ) : (
        <div className="grid gap-4">
          {/* Select-all row */}
          <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
            <Checkbox
              checked={selectedIds.size > 0 && selectedIds.size === data.companies.length}
              onCheckedChange={(v) => (v ? selectAll() : clearSelection())}
            />
            <span
              className="cursor-pointer select-none hover:text-foreground"
              onClick={() => (selectedIds.size === data.companies.length ? clearSelection() : selectAll())}
            >
              {selectedIds.size === data.companies.length && data.companies.length > 0
                ? 'Deselect all'
                : 'Select all'}
            </span>
          </div>
          {data.companies.map((c) => {
            const jCount = data.jobs.filter((j) => j.companyId === c.id).length
            const rel = relevantForCompany(c.id)
            return (
              <Card
                key={c.id}
                className={selectedIds.has(c.id) ? 'border-primary/50 bg-primary/[0.03]' : ''}
              >
                <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <Checkbox
                      checked={selectedIds.has(c.id)}
                      onCheckedChange={() => toggleSelect(c.id)}
                      className="mt-1 shrink-0"
                    />
                    <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="font-display text-lg">{c.name}</CardTitle>
                      <Badge variant="outline">{COMPANY_PRIORITY_LABEL[c.priority]}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground break-all">
                      {c.careerPageUrl}
                    </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      onClick={() => runScan(c.id)}
                      disabled={scanningId === c.id}
                    >
                      {scanningId === c.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ScanSearch className="h-4 w-4" />
                      )}
                      Scan jobs
                    </Button>
                    <Dialog
                      open={pasteOpenId === c.id}
                      onOpenChange={(v) => {
                        setPasteOpenId(v ? c.id : null)
                        if (!v) {
                          setPasteHtml('')
                          setPasteBaseUrl('')
                        }
                      }}
                    >
                      <DialogTrigger asChild>
                        <Button size="sm" variant="secondary">
                          Paste HTML
                        </Button>
                      </DialogTrigger>
                      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
                        <DialogHeader>
                          <DialogTitle>Paste career page HTML</DialogTitle>
                          <DialogDescription>
                            When the browser cannot fetch the page (CORS), paste “View Source” HTML
                            here. Optional base URL helps resolve relative links.
                          </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-3">
                          <div>
                            <Label htmlFor="paste-base">Base URL (optional)</Label>
                            <Input
                              id="paste-base"
                              value={pasteBaseUrl}
                              onChange={(e) => setPasteBaseUrl(e.target.value)}
                              placeholder={c.careerPageUrl}
                              className="mt-1"
                            />
                          </div>
                          <div>
                            <Label htmlFor="paste-html">HTML</Label>
                            <Textarea
                              id="paste-html"
                              className="mt-1 min-h-[200px] font-mono text-xs"
                              value={pasteHtml}
                              onChange={(e) => setPasteHtml(e.target.value)}
                            />
                          </div>
                        </div>
                        <DialogFooter>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setPasteOpenId(null)}
                          >
                            Cancel
                          </Button>
                          <Button
                            type="button"
                            disabled={!pasteHtml.trim() || scanningId === c.id}
                            onClick={() => runPaste(c.id)}
                          >
                            {scanningId === c.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : null}
                            Import
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                    <Button size="sm" variant="outline" onClick={() => openEdit(c)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => deleteCompany(c.id)}>
                      Remove
                    </Button>
                  </div>
                </CardHeader>

                <CardContent className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground/80">
                      Last scan
                    </p>
                    <p className="font-medium text-foreground">{formatDate(c.lastScanAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground/80">
                      Jobs found
                    </p>
                    <p className="font-medium text-foreground">{jCount}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground/80">
                      Strong matches (65+)
                    </p>
                    <p className="font-medium text-foreground">{rel}</p>
                  </div>
                  {c.notes ? (
                    <div className="sm:col-span-3">
                      <p className="text-xs uppercase tracking-wide text-muted-foreground/80">
                        Notes
                      </p>
                      <p className="text-foreground/90">{c.notes}</p>
                    </div>
                  ) : null}
                  {(() => {
                    const logs = data.scanHistory
                      .filter((s) => s.companyId === c.id)
                      .sort((a, b) => b.at.localeCompare(a.at))
                    if (logs.length === 0) return null
                    return (
                      <div className="sm:col-span-3">
                        <details className="group rounded-lg border border-border/70 bg-muted/15">
                          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground [&::-webkit-details-marker]:hidden">
                            <span>Scan history · {logs.length} run(s)</span>
                            <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" />
                          </summary>
                          <ul className="space-y-3 border-t border-border/50 px-3 py-3">
                            {logs.map((log) => (
                              <li
                                key={log.id}
                                className="rounded-md border border-border/40 bg-background/30 p-2.5 text-xs"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <span className="font-medium text-foreground">
                                    {formatDistanceToNow(new Date(log.at), { addSuffix: true })}
                                  </span>
                                  <span
                                    className={
                                      log.outcome === 'success'
                                        ? 'text-emerald-400'
                                        : log.outcome === 'partial'
                                          ? 'text-amber-400'
                                          : 'text-destructive'
                                    }
                                  >
                                    {log.outcome}
                                  </span>
                                </div>
                                <p className="mt-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                                  {log.method.replace(/_/g, ' ')} · {log.jobsFound} jobs
                                </p>
                                <p className="mt-1 leading-relaxed text-muted-foreground">
                                  {log.message}
                                </p>
                              </li>
                            ))}
                          </ul>
                        </details>
                      </div>
                    )
                  })()}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </>
  )
}
