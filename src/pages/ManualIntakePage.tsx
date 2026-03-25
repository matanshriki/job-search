import { Sparkles } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { JOB_SOURCE_LABELS } from '@/domain/types'
import type { JobSourceType } from '@/domain/types'
import { useAppState } from '@/context/app-state'
import {
  extractFieldsFromPastedJobText,
  parseLinkedInJobUrl,
} from '@/services/parsing/manualIntake'

export function ManualIntakePage() {
  const { addManualJob } = useAppState()
  const [title, setTitle] = useState('')
  const [company, setCompany] = useState('')
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState('')
  const [sourceType, setSourceType] = useState<JobSourceType>('manual_entry')
  const [sourceUrl, setSourceUrl] = useState('')
  const [linkedInUrl, setLinkedInUrl] = useState('')
  const [liHint, setLiHint] = useState<string | null>(null)
  const [autoSuggestWhileTyping, setAutoSuggestWhileTyping] = useState(false)

  const applyExtracted = useCallback(
    (opts?: { onlyEmpty: boolean }) => {
      const onlyEmpty = opts?.onlyEmpty ?? false
      const x = extractFieldsFromPastedJobText(description)
      if (x.title && (!onlyEmpty || !title.trim())) setTitle(x.title)
      if (x.company && (!onlyEmpty || !company.trim())) setCompany(x.company)
      if (x.location && (!onlyEmpty || !location.trim())) setLocation(x.location)
      const found = [x.title && 'title', x.company && 'company', x.location && 'location'].filter(
        Boolean,
      )
      setLiHint(
        found.length
          ? `Filled: ${found.join(', ')}. Review and edit before saving.`
          : 'No strong patterns found — try a line with "Title at Company" or "Company · City · …".',
      )
    },
    [description, title, company, location],
  )

  useEffect(() => {
    if (!autoSuggestWhileTyping) return
    if (description.trim().length < 40) return
    const t = window.setTimeout(() => applyExtracted({ onlyEmpty: true }), 550)
    return () => window.clearTimeout(t)
  }, [description, autoSuggestWhileTyping, applyExtracted])

  const submitManual = () => {
    if (!description.trim()) return
    if (!company.trim() && !extractFieldsFromPastedJobText(description).company) return
    addManualJob({
      title: title.trim() || undefined,
      company: company.trim() || undefined,
      location: location.trim() || undefined,
      description: description.trim(),
      sourceType,
      sourceUrl: sourceUrl.trim() || undefined,
    })
    setTitle('')
    setCompany('')
    setLocation('')
    setDescription('')
    setSourceUrl('')
  }

  const submitLinkedIn = () => {
    if (!description.trim()) return
    const { clean } = parseLinkedInJobUrl(linkedInUrl)
    addManualJob({
      title: title.trim() || undefined,
      company: company.trim() || undefined,
      location: location.trim() || undefined,
      description: description.trim(),
      sourceType: 'linkedin_manual',
      linkedInUrl: clean || undefined,
    })
    setTitle('')
    setCompany('')
    setLocation('')
    setDescription('')
    setLinkedInUrl('')
    setLiHint(null)
  }

  const canSaveLinkedIn = description.trim().length > 0

  return (
    <>
      <PageHeader
        title="Manual job intake"
        description="LinkedIn is manual-only: paste URL and description. Field extraction runs locally — nothing is sent to a server."
      />

      <Card className="mb-6 border-primary/20 bg-primary/5">
        <CardHeader>
          <CardTitle className="text-base">Source policy</CardTitle>
          <CardDescription>
            Every job shows a clear source badge. We never log into LinkedIn or crawl listings.
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs
        defaultValue="manual"
        className="w-full"
        onValueChange={(v) => {
          setLiHint(null)
          if (v !== 'linkedin') setAutoSuggestWhileTyping(false)
        }}
      >
        <TabsList>
          <TabsTrigger value="manual">Manual entry</TabsTrigger>
          <TabsTrigger value="linkedin">LinkedIn (manual paste)</TabsTrigger>
        </TabsList>
        <TabsContent value="manual" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Add a job</CardTitle>
              <CardDescription>
                Recruiter outreach, referrals, career pages — label the source honestly.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="m-title">Title (optional if in description)</Label>
                <Input
                  id="m-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="m-co">Company</Label>
                <Input
                  id="m-co"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="m-loc">Location</Label>
                <Input
                  id="m-loc"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div className="sm:col-span-2">
                <Label>Source type</Label>
                <Select
                  value={sourceType}
                  onValueChange={(v) => setSourceType(v as JobSourceType)}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(JOB_SOURCE_LABELS) as JobSourceType[]).map((k) => (
                      <SelectItem key={k} value={k}>
                        {JOB_SOURCE_LABELS[k]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="m-url">Source URL (optional)</Label>
                <Input
                  id="m-url"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  className="mt-1"
                  placeholder="https://"
                />
              </div>
              <div className="sm:col-span-2">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor="m-desc">Job description</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => applyExtracted({ onlyEmpty: false })}
                  >
                    <Sparkles className="mr-1 h-3 w-3" />
                    Auto-fill from text
                  </Button>
                </div>
                <Textarea
                  id="m-desc"
                  className="mt-1 min-h-[200px]"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Paste the full description text…"
                />
              </div>
              <div className="sm:col-span-2">
                <Button
                  type="button"
                  onClick={submitManual}
                  disabled={!description.trim() || (!company.trim() && !extractFieldsFromPastedJobText(description).company)}
                >
                  Create structured job
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="linkedin" className="mt-6">
          <Card className="border-[#0a66c2]/20">
            <CardHeader>
              <CardTitle>LinkedIn manual</CardTitle>
              <CardDescription>
                Step 1: paste the job URL. Step 2: paste the full job description. Use auto-fill, then
                refine title, company, and location before saving.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-5">
              <div>
                <Label htmlFor="li-url">LinkedIn job URL</Label>
                <Input
                  id="li-url"
                  value={linkedInUrl}
                  onChange={(e) => setLinkedInUrl(e.target.value)}
                  className="mt-1"
                  placeholder="https://www.linkedin.com/jobs/view/…"
                />
              </div>

              <div>
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <Label htmlFor="li-desc">Pasted job description</Label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => applyExtracted({ onlyEmpty: false })}
                    >
                      <Sparkles className="mr-1 h-3.5 w-3.5" />
                      Extract fields
                    </Button>
                    <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                      <input
                        type="checkbox"
                        className="rounded border-input"
                        checked={autoSuggestWhileTyping}
                        onChange={(e) => setAutoSuggestWhileTyping(e.target.checked)}
                      />
                      Auto-suggest while typing
                    </label>
                  </div>
                </div>
                <Textarea
                  id="li-desc"
                  className="mt-1 min-h-[240px] font-mono text-[13px] leading-relaxed"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Paste everything from the posting (overview, responsibilities, qualifications)…"
                />
                {liHint ? (
                  <p className="mt-2 text-xs text-muted-foreground">{liHint}</p>
                ) : null}
              </div>

              <div className="grid gap-4 rounded-lg border border-border/80 bg-muted/20 p-4 sm:grid-cols-3">
                <div className="sm:col-span-3">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Structured fields (edit after extraction)
                  </p>
                </div>
                <div className="sm:col-span-3">
                  <Label htmlFor="li-title">Title</Label>
                  <Input
                    id="li-title"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="li-co">Company</Label>
                  <Input
                    id="li-co"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div className="sm:col-span-2">
                  <Label htmlFor="li-loc">Location</Label>
                  <Input
                    id="li-loc"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>

              <Button type="button" onClick={submitLinkedIn} disabled={!canSaveLinkedIn}>
                Save LinkedIn manual job
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  )
}
