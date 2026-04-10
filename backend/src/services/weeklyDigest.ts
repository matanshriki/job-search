/**
 * Weekly Digest Service
 * Aggregates the past 7 days of job search activity into a structured
 * summary used by both the in-app digest page and the email sender.
 */

import prisma from '../db/client'

export interface DigestJob {
  id: number
  title: string
  company: string
  location: string
  fitScore: number
  fitLabel: string
  status: string
  jobUrl: string
  discoveredAt: string
}

export interface DigestStats {
  jobsFound: number
  highMatchJobs: number      // fitScore >= 70
  appliedCount: number
  interviewingCount: number
  queueItemsCreated: number
  fitAnalysesRun: number
  boardCrawlsRun: number
  companiesScanned: number
}

export interface WeeklyDigestData {
  period: { from: string; to: string; label: string }
  stats: DigestStats
  topMatches: DigestJob[]      // top 8 by fitScore discovered this week
  appliedThisWeek: DigestJob[] // jobs moved to applied this week
  pipelineSnapshot: Array<{ status: string; count: number }>
  dashboardUrl: string
}

function startOfWeek(): Date {
  const d = new Date()
  d.setDate(d.getDate() - 7)
  d.setHours(0, 0, 0, 0)
  return d
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export async function generateWeeklyDigest(userId: number): Promise<WeeklyDigestData> {
  const from = startOfWeek()
  const to = new Date()

  const userCompanies = await prisma.targetCompany.findMany({
    where: { userId },
    select: { id: true },
  })
  const companyIds = userCompanies.map((c) => c.id)

  const jobsWhere = { companyId: { in: companyIds.length > 0 ? companyIds : [-1] }, isActive: true }

  // ── Stats ──────────────────────────────────────────────────────────────────

  const [
    jobsFound,
    highMatchJobs,
    appliedCount,
    interviewingCount,
    queueItemsCreated,
    fitAnalysesRun,
    boardCrawlsRun,
    companiesScanned,
  ] = await Promise.all([
    prisma.jobPosting.count({
      where: { ...jobsWhere, discoveredAt: { gte: from } },
    }),
    prisma.jobPosting.count({
      where: { ...jobsWhere, discoveredAt: { gte: from }, match: { fitScore: { gte: 70 } } },
    }),
    prisma.jobPosting.count({
      where: { ...jobsWhere, status: 'applied', updatedAt: { gte: from } },
    }),
    prisma.jobPosting.count({
      where: { ...jobsWhere, status: 'interviewing' },
    }),
    prisma.approvalQueueItem.count({
      where: { userId, createdAt: { gte: from } },
    }),
    prisma.agentRun.count({
      where: {
        agentType: 'fit_analyst',
        status: 'completed',
        startedAt: { gte: from },
        jobPosting: { company: { userId } },
      },
    }),
    prisma.jobBoardSource.count({ where: { userId } }),
    prisma.scanRun.count({
      where: { companyId: { in: companyIds.length > 0 ? companyIds : [-1] }, startedAt: { gte: from } },
    }),
  ])

  // ── Top matches found this week ────────────────────────────────────────────

  const topMatchRows = await prisma.jobPosting.findMany({
    where: { ...jobsWhere, discoveredAt: { gte: from }, match: { fitScore: { gte: 50 } } },
    include: {
      match: true,
      company: { select: { name: true } },
    },
    orderBy: { match: { fitScore: 'desc' } },
    take: 8,
  })

  const topMatches: DigestJob[] = topMatchRows.map((j) => ({
    id: j.id,
    title: j.title,
    company: j.company?.name ?? '',
    location: j.location,
    fitScore: j.match?.fitScore ?? 0,
    fitLabel: j.match?.fitLabel ?? 'unknown',
    status: j.status,
    jobUrl: j.jobUrl,
    discoveredAt: j.discoveredAt.toISOString(),
  }))

  // ── Applied this week ──────────────────────────────────────────────────────

  const appliedRows = await prisma.jobPosting.findMany({
    where: { ...jobsWhere, status: 'applied', updatedAt: { gte: from } },
    include: {
      match: true,
      company: { select: { name: true } },
    },
    orderBy: { updatedAt: 'desc' },
    take: 10,
  })

  const appliedThisWeek: DigestJob[] = appliedRows.map((j) => ({
    id: j.id,
    title: j.title,
    company: j.company?.name ?? '',
    location: j.location,
    fitScore: j.match?.fitScore ?? 0,
    fitLabel: j.match?.fitLabel ?? 'unknown',
    status: j.status,
    jobUrl: j.jobUrl,
    discoveredAt: j.discoveredAt.toISOString(),
  }))

  // ── Pipeline snapshot ──────────────────────────────────────────────────────

  const grouped = await prisma.jobPosting.groupBy({
    by: ['status'],
    where: { companyId: { in: companyIds.length > 0 ? companyIds : [-1] }, isActive: true },
    _count: { id: true },
  })

  const pipelineSnapshot = grouped
    .map((g) => ({ status: g.status, count: g._count.id }))
    .sort((a, b) => b.count - a.count)

  // ── Dashboard URL ──────────────────────────────────────────────────────────

  const frontendUrl = process.env.FRONTEND_URL ?? 'https://matanshriki.github.io/job-search'
  const dashboardUrl = `${frontendUrl}/#/`

  return {
    period: {
      from: from.toISOString(),
      to: to.toISOString(),
      label: `${formatDate(from)} – ${formatDate(to)}`,
    },
    stats: {
      jobsFound,
      highMatchJobs,
      appliedCount,
      interviewingCount,
      queueItemsCreated,
      fitAnalysesRun,
      boardCrawlsRun,
      companiesScanned,
    },
    topMatches,
    appliedThisWeek,
    pipelineSnapshot,
    dashboardUrl,
  }
}
