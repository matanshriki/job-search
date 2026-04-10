/**
 * Job Board Crawler Agent
 * Loops over a user's configured JobBoardSources, fetches jobs from each
 * board's API, dedupes, scores, inserts into JobPosting + JobMatch, and
 * emits job.created events so the pipeline orchestrator can chain agents.
 *
 * Auto-creates stub TargetCompany records (active:false) for unknown employers
 * so the company scanner doesn't re-scan them, but jobs are still linkable.
 */

import prisma from '../db/client'
import { scoreJobAgainstProfile, fitLabel } from '../services/scoring/matchEngine'
import { buildProfileFromDb } from '../utils/profileHelpers'
import { jobDuplicateKey, NormalizedJobDraft } from '../services/parsing/careerScanner'
import { fetchRemotiveJobs, RemotiveSearchConfig } from '../services/jobBoardParsers/remotive'
import { fetchArbeitnowJobs, ArbeitnowSearchConfig } from '../services/jobBoardParsers/arbeitnow'
import { eventBus } from '../services/eventBus'

export interface CrawlSourceResult {
  sourceId: number
  boardType: string
  jobsFound: number
  jobsCreated: number
  jobsSkipped: number
  success: boolean
  message: string
}

export interface CrawlAllResult {
  results: CrawlSourceResult[]
  totalCreated: number
  totalFound: number
}

// ─── Company auto-creation ────────────────────────────────────────────────────

async function getOrCreateCompany(userId: number, companyName: string): Promise<number> {
  const name = companyName.trim()

  const existing = await prisma.targetCompany.findFirst({
    where: { userId, name: { equals: name, mode: 'insensitive' } },
    select: { id: true },
  })
  if (existing) return existing.id

  const created = await prisma.targetCompany.create({
    data: {
      userId,
      name,
      // active:false so the company scanner won't try to re-scrape their career page
      active: false,
      notes: 'Auto-created from job board crawl',
      priority: 'medium',
    },
  })
  return created.id
}

// ─── Single source crawl ──────────────────────────────────────────────────────

async function crawlSource(
  sourceId: number,
  userId: number,
): Promise<CrawlSourceResult> {
  const source = await prisma.jobBoardSource.findUnique({ where: { id: sourceId } })
  if (!source) throw new Error(`JobBoardSource ${sourceId} not found`)

  const config = JSON.parse(source.searchConfigJson) as Record<string, unknown>

  let drafts: NormalizedJobDraft[] = []
  let fetchMessage = ''

  try {
    switch (source.boardType) {
      case 'remotive': {
        const searchCfg: RemotiveSearchConfig = {
          search: typeof config.search === 'string' ? config.search : undefined,
          category: typeof config.category === 'string' ? config.category : undefined,
          limit: typeof config.limit === 'number' ? config.limit : 50,
        }
        drafts = await fetchRemotiveJobs(searchCfg)
        fetchMessage = `Fetched ${drafts.length} jobs from Remotive`
        break
      }
      case 'arbeitnow': {
        const searchCfg: ArbeitnowSearchConfig = {
          search: typeof config.search === 'string' ? config.search : undefined,
          limit: typeof config.limit === 'number' ? config.limit : 100,
        }
        drafts = await fetchArbeitnowJobs(searchCfg)
        fetchMessage = `Fetched ${drafts.length} jobs from Arbeitnow`
        break
      }
      default:
        return {
          sourceId,
          boardType: source.boardType,
          jobsFound: 0,
          jobsCreated: 0,
          jobsSkipped: 0,
          success: false,
          message: `Unknown board type: ${source.boardType}`,
        }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    await prisma.jobBoardSource.update({
      where: { id: sourceId },
      data: { lastCheckedAt: new Date() },
    })
    return {
      sourceId,
      boardType: source.boardType,
      jobsFound: 0,
      jobsCreated: 0,
      jobsSkipped: 0,
      success: false,
      message: msg,
    }
  }

  // Load profile for scoring
  const profileRow = await prisma.profile.findFirst({ where: { userId } })
  const profile = profileRow ? buildProfileFromDb(profileRow) : null

  let jobsCreated = 0
  let jobsSkipped = 0

  for (const draft of drafts) {
    const key = draft.normalizedKey || jobDuplicateKey(draft.company, draft.title, draft.location)

    // Check for existing job across ALL companies for this user (board jobs are global)
    const userCompanyIds = await prisma.targetCompany
      .findMany({ where: { userId }, select: { id: true } })
      .then((rows) => rows.map((r) => r.id))

    const existing = await prisma.jobPosting.findFirst({
      where: { normalizedKey: key, companyId: { in: userCompanyIds } },
      select: { id: true },
    })

    if (existing) {
      jobsSkipped++
      continue
    }

    const companyId = await getOrCreateCompany(userId, draft.company)

    const scoreResult = profile
      ? scoreJobAgainstProfile(
          { title: draft.title, company: draft.company, location: draft.location, description: draft.description },
          profile,
        )
      : { total: 0, breakdown: {}, strengths: [], concerns: [], redFlags: [], fitSummary: '', insightSnippet: '' }

    const newJob = await prisma.jobPosting.create({
      data: {
        companyId,
        title: draft.title,
        location: draft.location,
        department: draft.department ?? '',
        employmentType: draft.employmentType ?? '',
        descriptionRaw: draft.description,
        descriptionClean: draft.description,
        jobUrl: draft.sourceUrl,
        sourceType: draft.sourceType,
        sourceProvider: source.boardType,
        sourceLabel: draft.sourceLabel,
        postedAt: draft.datePosted ? new Date(draft.datePosted) : null,
        normalizedKey: key,
        hashSignature: key,
        isActive: true,
        status: 'new',
      },
    })

    await prisma.jobMatch.create({
      data: {
        jobPostingId: newJob.id,
        fitScore: scoreResult.total,
        fitLabel: fitLabel(scoreResult.total),
        scoreBreakdownJson: JSON.stringify(scoreResult.breakdown),
        matchingReasonsJson: JSON.stringify(scoreResult.strengths),
        concernsJson: JSON.stringify(scoreResult.concerns),
        redFlagsJson: JSON.stringify(scoreResult.redFlags),
        fitSummary: scoreResult.fitSummary,
        insightSnippet: scoreResult.insightSnippet,
        strengthsJson: JSON.stringify(scoreResult.strengths),
      },
    })

    await prisma.activityLog.create({
      data: {
        entityType: 'job_posting',
        entityId: String(newJob.id),
        action: 'created',
        metadataJson: JSON.stringify({ source: 'job_board_crawler', boardType: source.boardType, sourceId }),
        jobPostingId: newJob.id,
      },
    })

    if (scoreResult.total >= 70) {
      await prisma.notification.create({
        data: {
          jobPostingId: newJob.id,
          channel: 'in_app',
          message: `New high-fit role from ${draft.sourceLabel} (${scoreResult.total}/100): ${draft.title} at ${draft.company}`,
          status: 'unread',
        },
      })
    }

    // Emit event so the pipeline orchestrator can chain fit analysis + queue creation
    eventBus.emit('job.created', {
      jobPostingId: newJob.id,
      fitScore: scoreResult.total,
      userId,
      source: 'job_board',
    })

    jobsCreated++
  }

  await prisma.jobBoardSource.update({
    where: { id: sourceId },
    data: { lastCheckedAt: new Date(), lastJobsFound: drafts.length },
  })

  eventBus.emit('crawl.completed', {
    sourceId,
    boardType: source.boardType,
    userId,
    jobsFound: drafts.length,
    jobsCreated,
  })

  return {
    sourceId,
    boardType: source.boardType,
    jobsFound: drafts.length,
    jobsCreated,
    jobsSkipped,
    success: true,
    message: fetchMessage,
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function runJobBoardCrawlerForSource(
  sourceId: number,
  userId: number,
): Promise<CrawlSourceResult> {
  return crawlSource(sourceId, userId)
}

export async function runJobBoardCrawlerForUser(userId: number): Promise<CrawlAllResult> {
  const sources = await prisma.jobBoardSource.findMany({
    where: { userId, active: true },
  })

  const results: CrawlSourceResult[] = []
  for (const source of sources) {
    try {
      const result = await crawlSource(source.id, userId)
      results.push(result)
    } catch (err) {
      results.push({
        sourceId: source.id,
        boardType: source.boardType,
        jobsFound: 0,
        jobsCreated: 0,
        jobsSkipped: 0,
        success: false,
        message: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return {
    results,
    totalCreated: results.reduce((s, r) => s + r.jobsCreated, 0),
    totalFound: results.reduce((s, r) => s + r.jobsFound, 0),
  }
}

export async function runJobBoardCrawlerForAllUsers(): Promise<void> {
  const users = await prisma.user.findMany({ select: { id: true } })
  for (const user of users) {
    try {
      await runJobBoardCrawlerForUser(user.id)
    } catch (err) {
      console.error(`[jobBoardCrawler] Failed for user ${user.id}:`, err)
    }
  }
}
