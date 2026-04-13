import cron from 'node-cron'
import prisma from '../db/client'
import { runScoutAgentForAllCompanies } from '../agents/scoutAgent'
import { runFitAnalystAgent } from '../agents/fitAnalystAgent'
import { runJobBoardCrawlerForAllUsers } from '../agents/jobBoardCrawlerAgent'
import { generateWeeklyDigest } from './weeklyDigest'

const SCHEDULER_ENABLED = process.env.SCHEDULER_ENABLED !== 'false'
const SCAN_INTERVAL_HOURS = parseInt(process.env.SCAN_INTERVAL_HOURS ?? '6', 10)
const FIT_THRESHOLD = parseInt(process.env.FIT_ANALYSIS_THRESHOLD ?? '55', 10)
/** SQL pre-filter only; each tenant's AppSettings.fitAnalysisThreshold is applied per job below. */
const FIT_SCHEDULER_MIN_SCORE = parseInt(process.env.FIT_ANALYSIS_SCHEDULER_MIN_SCORE ?? '40', 10)

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
      const candidates = await prisma.jobPosting.findMany({
        where: {
          isActive: true,
          companyId: { not: null },
          match: { fitScore: { gte: FIT_SCHEDULER_MIN_SCORE } },
          generatedAssets: { none: { assetType: 'fit_analysis' } },
        },
        include: {
          match: true,
          company: { select: { userId: true } },
        },
        take: 40,
        orderBy: { discoveredAt: 'desc' },
      })

      let processed = 0
      for (const job of candidates) {
        if (processed >= 5) break
        const userId = job.company?.userId
        if (!userId) continue

        const settings = await prisma.appSettings.findUnique({ where: { userId } })
        if (!(settings?.autoRunFitAnalysis ?? true)) continue

        const threshold = settings?.fitAnalysisThreshold ?? FIT_THRESHOLD
        if ((job.match?.fitScore ?? 0) < threshold) continue

        try {
          await runFitAnalystAgent(job.id, userId)
          processed++
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
          // Prefer OAuth sign-in email; fall back to profile if ever missing
          const recipientEmail = user.email || profile?.email || ''
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
