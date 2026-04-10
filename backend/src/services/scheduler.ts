import cron from 'node-cron'
import prisma from '../db/client'
import { runScoutAgentForAllCompanies } from '../agents/scoutAgent'
import { runFitAnalystAgent } from '../agents/fitAnalystAgent'
import { runJobBoardCrawlerForAllUsers } from '../agents/jobBoardCrawlerAgent'
import { generateWeeklyDigest } from './weeklyDigest'

const SCHEDULER_ENABLED = process.env.SCHEDULER_ENABLED !== 'false'
const SCAN_INTERVAL_HOURS = parseInt(process.env.SCAN_INTERVAL_HOURS ?? '6', 10)
const FIT_THRESHOLD = parseInt(process.env.FIT_ANALYSIS_THRESHOLD ?? '55', 10)

export function startScheduler() {
  if (!SCHEDULER_ENABLED) {
    console.log('[scheduler] Disabled via SCHEDULER_ENABLED=false')
    return
  }

  console.log(`[scheduler] Starting — scan interval: ${SCAN_INTERVAL_HOURS}h, fit threshold: ${FIT_THRESHOLD}`)

  // Periodic company career-page scan
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

  // Periodic job board crawl — staggered by 30 minutes from company scans
  const crawlCronExpr = `30 */${SCAN_INTERVAL_HOURS} * * *`
  cron.schedule(crawlCronExpr, async () => {
    console.log('[scheduler] Running scheduled job board crawl for all users...')
    try {
      await runJobBoardCrawlerForAllUsers()
      console.log('[scheduler] Job board crawl complete')
    } catch (e) {
      console.error('[scheduler] Job board crawl failed:', e)
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

  // Weekly digest email — every Monday at 8am (lazy-load email module so nodemailer is not in startup path)
  cron.schedule('0 8 * * 1', async () => {
    const { isEmailEnabled, sendWeeklyDigestEmail } = await import('./emailService')
    if (!isEmailEnabled()) return
    console.log('[scheduler] Sending weekly digest emails...')
    try {
      const users = await prisma.user.findMany({ select: { id: true, email: true, name: true } })
      for (const user of users) {
        try {
          const profile = await prisma.profile.findFirst({ where: { userId: user.id } })
          const recipientEmail = profile?.email || user.email
          const recipientName = profile?.fullName?.split(' ')[0] || user.name?.split(' ')[0] || 'there'
          if (!recipientEmail) continue
          const digest = await generateWeeklyDigest(user.id)
          const result = await sendWeeklyDigestEmail(digest, recipientEmail, recipientName)
          console.log(`[scheduler] Digest for user ${user.id}: ${result.message}`)
        } catch (e) {
          console.error(`[scheduler] Digest failed for user ${user.id}:`, e)
        }
      }
    } catch (e) {
      console.error('[scheduler] Weekly digest run failed:', e)
    }
  })

  console.log('[scheduler] All tasks scheduled')
}
