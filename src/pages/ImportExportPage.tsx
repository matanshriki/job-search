import { useState } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { buildMockAppData } from '@/data/mockData'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useAppState } from '@/context/app-state'
import { useToast } from '@/hooks/use-toast'
import { exportAppDataJson } from '@/storage/appStorage'

export function ImportExportPage() {
  const { data, importJson, resetAll, setData } = useAppState()
  const { toast } = useToast()
  const [importText, setImportText] = useState('')

  const handleExport = () => {
    const json = exportAppDataJson(data)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `job-search-backup-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    toast({ title: 'Export complete', description: 'JSON file downloaded.', variant: 'success' })
  }

  const handleImport = () => {
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

  const loadDemo = () => {
    const mock = buildMockAppData()
    setData(mock)
    toast({ title: 'Demo dataset loaded', variant: 'success' })
  }

  return (
    <>
      <PageHeader
        title="Import / export"
        description="Your command center is local-only. Export regularly — browsers can clear storage."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Export backup</CardTitle>
            <CardDescription>Download all companies, jobs, profile, and scan history as JSON.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button type="button" onClick={handleExport}>
              Download JSON
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Import backup</CardTitle>
            <CardDescription>Paste a previously exported JSON payload to restore your workspace.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label htmlFor="imp">Backup JSON</Label>
              <Textarea
                id="imp"
                className="mt-1 min-h-[160px] font-mono text-xs"
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
                placeholder='{ "version": 1, ... }'
              />
            </div>
            <Button type="button" onClick={handleImport} disabled={!importText.trim()}>
              Import & replace local data
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2 border-destructive/30">
          <CardHeader>
            <CardTitle>Reset & demo</CardTitle>
            <CardDescription>
              Reset wipes local storage for this app. You can reload curated demo data afterward.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button type="button" variant="destructive" onClick={resetAll}>
              Reset local data
            </Button>
            <Button type="button" variant="secondary" onClick={loadDemo}>
              Load demo dataset
            </Button>
          </CardContent>
        </Card>
      </div>
    </>
  )
}
