import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAppState } from '@/context/app-state'
import { useToast } from '@/hooks/use-toast'
import { dataApi } from '@/services/api'

export function ImportExportPage() {
  const { importJson, resetAll } = useAppState()
  const { toast } = useToast()
  const [importText, setImportText] = useState('')
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    try {
      const data = await dataApi.export()
      const json = JSON.stringify({ ...data, exportedAt: new Date().toISOString() }, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `job-search-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      toast({ title: 'Export complete', description: 'Full database snapshot downloaded.', variant: 'success' })
    } catch (e) {
      toast({ title: 'Export failed', description: String(e), variant: 'destructive' })
    } finally {
      setExporting(false)
    }
  }

  const handleImport = () => {
    if (!importText.trim()) return
    try {
      importJson(importText)
      setImportText('')
    } catch {
      toast({
        title: 'Import failed',
        description: 'Could not parse JSON. Check the file and try again.',
        variant: 'destructive',
      })
    }
  }

  return (
    <>
      <PageHeader
        title="Import / export"
        description="Export a full database snapshot at any time. Import to restore or migrate from the old localStorage format."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Export backup</CardTitle>
            <CardDescription>
              Downloads all companies, jobs, profile, resumes, notes, and agent history as a single
              JSON file. Use this for backups or to migrate between machines.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleExport} disabled={exporting}>
              {exporting ? 'Exporting…' : 'Download JSON backup'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Import backup</CardTitle>
            <CardDescription>
              Paste a previously exported JSON payload (new format) or a legacy localStorage export
              (version 1 or 2) to restore your workspace. Existing data is preserved unless you
              check "clear first" — that option is available in the CLI migration tool.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="imp">Backup JSON</Label>
              <Textarea
                id="imp"
                className="mt-1 min-h-[160px] font-mono text-xs"
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder='{ "version": 2, ... } or paste full backup JSON'
              />
            </div>
            <Button type="button" onClick={handleImport} disabled={!importText.trim()}>
              Import & merge into database
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 border-amber-500/30 bg-amber-500/[0.04]">
          <CardHeader>
            <CardTitle>Demo data</CardTitle>
            <CardDescription>
              To load the curated demo dataset, run this command in your terminal — it seeds the
              backend database directly and then refresh the page.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <pre className="rounded-md bg-muted px-4 py-3 font-mono text-sm">npm run db:seed</pre>
            <p className="text-xs text-muted-foreground">
              This runs <code className="font-mono">backend/src/utils/seed.ts</code> via{' '}
              <code className="font-mono">tsx</code> and populates the SQLite database with a sample
              profile, companies, sources, and jobs pre-scored for leadership roles.
            </p>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 border-destructive/30">
          <CardHeader>
            <CardTitle>Reset all data</CardTitle>
            <CardDescription>
              Permanently deletes all jobs, companies, assets, notes, and agent history from the
              database. Your profile is also wiped. This cannot be undone — export first.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button type="button" variant="destructive" onClick={resetAll}>
              Reset all data
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
