import cron from 'node-cron'
import prisma from '../db/client'
import { runScoutAgentForAllCompanies } from '../agents/scoutAgent'
import { runFitAnalystAgent } from '../agents/fitAnalystAgent'

const SCHEDULER_ENABLED = process.env.SCHEDULER_ENABLED !== 'false'
const SCAN_INTERVAL_HOURS = parseInt(process.env.SCAN_INTERVAL_HOURS ?? '6', 10)
const FIT_THRESHOLD = parseInt(process.env.FIT_ANALYSIS_THRESHOLD ?? '55', 10)

export function startScheduler() {
  if (!SCHEDULER_ENABLED) {
    console.log('[scheduler] Disabled via SCHEDULER_ENABLED=false')
    return
  }

  console.log(`[scheduler] Starting — scan interval: ${SCAN_INTERVAL_HOURS}h, fit threshold: ${FIT_THRESHOLD}`)

  // Periodic company scan
  const scanCronExpr = `0 */${SCAN_INTERVAL_HOURS} * * *`
  cron.schedule(scanCronExpr, async () => {
    console.log('[scheduler] Running scheduled scan for all active companies...')
    try {
      const results = await runScoutAgentForAllCompanies()
      const totalNew = results.reduce((s, r) => s + r.jobsCreated, 0)
      console.log(`[scheduler] Scan complete — ${totalNew} new jobs found across ${results.length} companies`)
    } catch (e) {
      console.error('[scheduler] Scan failed:', e)
    }
  })

  // Run fit analysis on new relevant jobs that don't have analysis yet (every 30 mins)
  cron.schedule('*/30 * * * *', async () => {
    try {
      const settings = await prisma.appSettings.findFirst()
      const threshold = settings?.fitAnalysisThreshold ?? FIT_THRESHOLD
      if (!(settings?.autoRunFitAnalysis ?? true)) return

      // Find jobs above threshold without a fit_analysis asset
      const jobsNeedingAnalysis = await prisma.jobPosting.findMany({
        where: {
          isActive: true,
          match: { fitScore: { gte: threshold } },
          generatedAssets: { none: { assetType: 'fit_analysis' } },
        },
        take: 5, // Process max 5 per run to avoid API overload
        orderBy: { discoveredAt: 'desc' },
      })

      if (jobsNeedingAnalysis.length === 0) return

      console.log(`[scheduler] Running fit analysis on ${jobsNeedingAnalysis.length} jobs...`)
      for (const job of jobsNeedingAnalysis) {
        try {
          await runFitAnalystAgent(job.id)
          console.log(`[scheduler] Fit analysis complete for job ${job.id}: ${job.title}`)
        } catch (e) {
          console.error(`[scheduler] Fit analysis failed for job ${job.id}:`, e)
        }
      }
    } catch (e) {
      console.error('[scheduler] Fit analysis queue failed:', e)
    }
  })

  console.log('[scheduler] All tasks scheduled')
}
