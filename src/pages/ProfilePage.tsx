import { RefreshCw } from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Textarea } from '@/components/ui/textarea'
import { SENIORITY_LABELS } from '@/domain/constants'
import type { SearchProfile, SeniorityLevel } from '@/domain/types'
import { useAppState } from '@/context/app-state'

function linesToList(s: string): string[] {
  return s
    .split(/[\n,]/)
    .map((x) => x.trim())
    .filter(Boolean)
}

export function ProfilePage() {
  const { data, updateProfile, recalculateAllMatchScores } = useAppState()
  const p = data.profile

  const [targetTitles, setTargetTitles] = useState(p.targetTitles.join('\n'))
  const [excludedTitles, setExcludedTitles] = useState(p.excludedTitles.join('\n'))
  const [preferredFunctions, setPreferredFunctions] = useState(p.preferredFunctions.join('\n'))
  const [preferredIndustries, setPreferredIndustries] = useState(
    p.preferredIndustries.join('\n'),
  )
  const [preferredGeographies, setPreferredGeographies] = useState(
    p.preferredGeographies.join('\n'),
  )
  const [idealCompanyStage, setIdealCompanyStage] = useState(p.idealCompanyStage.join('\n'))
  const [keywordsBoost, setKeywordsBoost] = useState(p.keywordsBoost.join('\n'))
  const [keywordsPenalize, setKeywordsPenalize] = useState(p.keywordsPenalize.join('\n'))
  const [compensationNotes, setCompensationNotes] = useState(p.compensationNotes)
  const [personalSummary, setPersonalSummary] = useState(p.personalSummary)
  const [remotePreference, setRemotePreference] = useState(p.remotePreference)

  const seniorityLevels = useMemo(() => Object.keys(SENIORITY_LABELS) as SeniorityLevel[], [])
  const [seniority, setSeniority] = useState<Record<SeniorityLevel, boolean>>(() => {
    const m = {} as Record<SeniorityLevel, boolean>
    for (const s of seniorityLevels) m[s] = p.targetSeniority.includes(s)
    return m
  })

  const toggleSeniority = (s: SeniorityLevel, checked: boolean) => {
    setSeniority((prev) => ({ ...prev, [s]: checked }))
  }

  const save = () => {
    const next: SearchProfile = {
      targetTitles: linesToList(targetTitles),
      excludedTitles: linesToList(excludedTitles),
      targetSeniority: seniorityLevels.filter((s) => seniority[s]),
      preferredFunctions: linesToList(preferredFunctions),
      preferredIndustries: linesToList(preferredIndustries),
      preferredGeographies: linesToList(preferredGeographies),
      remotePreference,
      idealCompanyStage: linesToList(idealCompanyStage),
      keywordsBoost: linesToList(keywordsBoost),
      keywordsPenalize: linesToList(keywordsPenalize),
      compensationNotes: compensationNotes.trim(),
      personalSummary: personalSummary.trim(),
    }
    updateProfile(next)
  }

  return (
    <>
      <PageHeader
        title="Profile & matching"
        description="Changing fields below does nothing until you save. After save, every job’s match score is recalculated. To hide weak roles, use Min score on Jobs feed."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={save}>
              Save & re-score all jobs
            </Button>
            <Button type="button" variant="outline" onClick={recalculateAllMatchScores}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Re-score only
            </Button>
          </div>
        }
      />

      <Card className="mb-6 border-primary/25 bg-primary/[0.06]">
        <CardHeader className="pb-2">
          <CardTitle className="text-base">See only strong matches</CardTitle>
          <CardDescription className="text-muted-foreground">
            Scores update when you click <strong className="text-foreground">Save &amp; re-score</strong>.
            The Jobs feed still lists every role until you filter it.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            Open{' '}
            <Link to="/jobs" className="font-medium text-primary underline-offset-4 hover:underline">
              Jobs feed
            </Link>{' '}
            → set <strong className="text-foreground">Min score</strong> (e.g. 70–80) or choose a{' '}
            <strong className="text-foreground">saved view</strong> like “Strong matches”.
          </p>
          <p className="text-xs">
            <strong className="text-foreground">Re-score only</strong> runs the engine again on your
            already-saved profile (useful after import or if scores look stale). It does not apply
            unsaved edits in the form — use Save for that.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Role targets</CardTitle>
            <CardDescription>Title fit uses overlaps with these phrases.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Target titles (one per line or comma-separated)</Label>
              <Textarea
                className="mt-1 min-h-[100px] font-mono text-xs"
                value={targetTitles}
                onChange={(e) => setTargetTitles(e.target.value)}
              />
            </div>
            <div>
              <Label>Excluded titles</Label>
              <Textarea
                className="mt-1 min-h-[72px] font-mono text-xs"
                value={excludedTitles}
                onChange={(e) => setExcludedTitles(e.target.value)}
              />
            </div>
            <div>
              <Label className="mb-2 block">Target seniority</Label>
              <div className="grid gap-2 sm:grid-cols-2">
                {seniorityLevels.map((s) => (
                  <label key={s} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={seniority[s]}
                      onCheckedChange={(v) => toggleSeniority(s, v === true)}
                    />
                    {SENIORITY_LABELS[s]}
                  </label>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Domain & place</CardTitle>
            <CardDescription>Shapes domain and location dimensions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Preferred functions</Label>
              <Textarea
                className="mt-1 min-h-[80px] font-mono text-xs"
                value={preferredFunctions}
                onChange={(e) => setPreferredFunctions(e.target.value)}
              />
            </div>
            <div>
              <Label>Preferred industries</Label>
              <Textarea
                className="mt-1 min-h-[80px] font-mono text-xs"
                value={preferredIndustries}
                onChange={(e) => setPreferredIndustries(e.target.value)}
              />
            </div>
            <div>
              <Label>Preferred geographies / locations</Label>
              <Textarea
                className="mt-1 min-h-[80px] font-mono text-xs"
                value={preferredGeographies}
                onChange={(e) => setPreferredGeographies(e.target.value)}
              />
            </div>
            <div>
              <Label>Remote / hybrid posture</Label>
              <Select
                value={remotePreference}
                onValueChange={(v) => setRemotePreference(v as SearchProfile['remotePreference'])}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="remote_first">Remote-first</SelectItem>
                  <SelectItem value="hybrid_ok">Hybrid OK</SelectItem>
                  <SelectItem value="onsite_ok">Onsite OK</SelectItem>
                  <SelectItem value="flexible">Flexible</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Ideal company stage keywords</Label>
              <Textarea
                className="mt-1 min-h-[72px] font-mono text-xs"
                value={idealCompanyStage}
                onChange={(e) => setIdealCompanyStage(e.target.value)}
                placeholder="Series B, Growth, Public…"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Keywords & narrative</CardTitle>
            <CardDescription>Boost / penalize terms and optional narrative for strategic fit.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>Keywords to boost</Label>
              <Textarea
                className="mt-1 min-h-[100px] font-mono text-xs"
                value={keywordsBoost}
                onChange={(e) => setKeywordsBoost(e.target.value)}
              />
            </div>
            <div>
              <Label>Keywords to penalize</Label>
              <Textarea
                className="mt-1 min-h-[100px] font-mono text-xs"
                value={keywordsPenalize}
                onChange={(e) => setKeywordsPenalize(e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <Separator className="mb-4" />
            </div>
            <div className="md:col-span-2">
              <Label>Compensation notes (private, local only)</Label>
              <Textarea
                className="mt-1 min-h-[72px]"
                value={compensationNotes}
                onChange={(e) => setCompensationNotes(e.target.value)}
              />
            </div>
            <div className="md:col-span-2">
              <Label>Personal summary (improves strategic fit heuristic)</Label>
              <Textarea
                className="mt-1 min-h-[120px]"
                value={personalSummary}
                onChange={(e) => setPersonalSummary(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
