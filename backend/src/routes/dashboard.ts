import { Router } from 'express'
import prisma from '../db/client'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

async function getUserCompanyIds(userId: number): Promise<number[]> {
  const companies = await prisma.targetCompany.findMany({ where: { userId }, select: { id: true } })
  return companies.map((c) => c.id)
}

// GET /api/dashboard/stats
router.get('/stats', async (req, res) => {
  try {
    const userCompanyIds = await getUserCompanyIds(req.userId)
    const settings = await prisma.appSettings.findUnique({ where: { userId: req.userId } })
    const minScore = settings?.minRelevantScore ?? 55

    const jobsWhere = { isActive: true, companyId: { in: userCompanyIds } }

    const [
      totalJobs, relevantJobs, companiesCount, newJobsCount, highMatchCount,
      awaitingReviewCount, appliedCount, interviewingCount, withGeneratedPrepCount,
      recentScans, unreadNotifications, recentAgentRuns, statusBreakdown,
    ] = await Promise.all([
      prisma.jobPosting.count({ where: jobsWhere }),
      prisma.jobPosting.count({ where: { ...jobsWhere, match: { fitScore: { gte: minScore } } } }),
      prisma.targetCompany.count({ where: { userId: req.userId, active: true } }),
      prisma.jobPosting.count({
        where: { ...jobsWhere, status: 'new', match: { fitScore: { gte: minScore } },
          discoveredAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } },
      }),
      prisma.jobPosting.count({ where: { ...jobsWhere, match: { fitScore: { gte: 70 } } } }),
      prisma.jobPosting.count({
        where: { ...jobsWhere, status: { in: ['new', 'considering'] }, match: { fitScore: { gte: minScore } } },
      }),
      prisma.jobPosting.count({ where: { ...jobsWhere, status: 'applied' } }),
      prisma.jobPosting.count({ where: { ...jobsWhere, status: 'interviewing' } }),
      prisma.jobPosting.count({
        where: { ...jobsWhere, generatedAssets: { some: { assetType: { in: ['interview_prep', 'fit_analysis'] } } } },
      }),
      prisma.scanRun.findMany({
        where: { companyId: { in: userCompanyIds } },
        include: { company: { select: { name: true } } },
        orderBy: { startedAt: 'desc' },
        take: 8,
      }),
      prisma.notification.count({
        where: { jobPosting: { companyId: { in: userCompanyIds } }, status: 'unread' },
      }),
      prisma.agentRun.findMany({
        where: { jobPosting: { companyId: { in: userCompanyIds } } },
        orderBy: { startedAt: 'desc' },
        take: 5,
        include: { jobPosting: { select: { id: true, title: true } } },
      }),
      prisma.jobPosting.groupBy({
        by: ['status'],
        where: { ...jobsWhere, match: { fitScore: { gte: minScore } } },
        _count: { id: true },
      }),
    ])

    const topMatches = await prisma.jobPosting.findMany({
      where: { ...jobsWhere, match: { fitScore: { gte: minScore } } },
      include: { match: true, company: { select: { id: true, name: true } } },
      orderBy: { match: { fitScore: 'desc' } },
      take: 5,
    })

    const failedScans = await prisma.scanRun.findMany({
      where: {
        companyId: { in: userCompanyIds },
        status: 'failed',
        completedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
      include: { company: { select: { name: true } } },
    })

    res.json({
      ok: true,
      stats: {
        totalJobs, relevantJobs, companiesCount, newJobsThisWeek: newJobsCount,
        highMatchCount, awaitingReviewCount, appliedCount, interviewingCount,
        withGeneratedPrepCount, unreadNotifications, minScore,
      },
      topMatches,
      recentScans,
      failedScans,
      recentAgentRuns,
      statusBreakdown: statusBreakdown.map((s) => ({ status: s.status, count: s._count.id })),
    })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// GET /api/dashboard/notifications
router.get('/notifications', async (req, res) => {
  try {
    const userCompanyIds = await getUserCompanyIds(req.userId)
    const notifications = await prisma.notification.findMany({
      where: { jobPosting: { companyId: { in: userCompanyIds } } },
      include: { jobPosting: { select: { id: true, title: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
    res.json({ ok: true, notifications })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// POST /api/dashboard/notifications/:id/read
router.post('/notifications/:id/read', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    const userCompanyIds = await getUserCompanyIds(req.userId)
    const notif = await prisma.notification.findFirst({
      where: { id, jobPosting: { companyId: { in: userCompanyIds } } },
    })
    if (!notif) return res.status(404).json({ ok: false, error: 'Not found' })
    await prisma.notification.update({ where: { id }, data: { status: 'read' } })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// POST /api/dashboard/notifications/read-all
router.post('/notifications/read-all', async (req, res) => {
  try {
    const userCompanyIds = await getUserCompanyIds(req.userId)
    await prisma.notification.updateMany({
      where: { status: 'unread', jobPosting: { companyId: { in: userCompanyIds } } },
      data: { status: 'read' },
    })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

export default router
