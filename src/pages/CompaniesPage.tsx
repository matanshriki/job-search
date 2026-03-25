import { formatDistanceToNow } from 'date-fns'
import { ChevronDown, Loader2, Plus, ScanSearch } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [editing, setEditing] = useState<TrackedCompany | null>(null)
  const [scanningId, setScanningId] = useState<string | null>(null)
  const [pasteOpenId, setPasteOpenId] = useState<string | null>(null)
  const [pasteHtml, setPasteHtml] = useState('')
  const [pasteBaseUrl, setPasteBaseUrl] = useState('')

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
                  <Input
                    id="co-career"
                    value={form.careerPageUrl}
                    onChange={(e) => setForm((f) => ({ ...f, careerPageUrl: e.target.value }))}
                    className="mt-1"
                    placeholder="https://boards.greenhouse.io/your-slug"
                  />
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
        }
      />

      {data.companies.length === 0 ? (
        <EmptyState
          icon={ScanSearch}
          title="No companies tracked"
          description="Add employers you care about. Use Greenhouse board URLs for the most reliable scans."
        />
      ) : (
        <div className="grid gap-4">
          {data.companies.map((c) => {
            const jCount = data.jobs.filter((j) => j.companyId === c.id).length
            const rel = relevantForCompany(c.id)
            return (
              <Card key={c.id}>
                <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="font-display text-lg">{c.name}</CardTitle>
                      <Badge variant="outline">{COMPANY_PRIORITY_LABEL[c.priority]}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground break-all">
                      {c.careerPageUrl}
                    </p>
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
