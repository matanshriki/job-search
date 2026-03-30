import { Router } from 'express'
import prisma from '../db/client'

const router = Router()

// GET /api/dashboard/stats
router.get('/stats', async (_req, res) => {
  try {
    const settings = await prisma.appSettings.findFirst()
    const minScore = settings?.minRelevantScore ?? 55

    const [
      totalJobs,
      relevantJobs,
      companiesCount,
      newJobsCount,
      highMatchCount,
      awaitingReviewCount,
      appliedCount,
      interviewingCount,
      withGeneratedPrepCount,
      recentScans,
      unreadNotifications,
      recentAgentRuns,
      statusBreakdown,
    ] = await Promise.all([
      prisma.jobPosting.count({ where: { isActive: true } }),
      prisma.jobPosting.count({
        where: { isActive: true, match: { fitScore: { gte: minScore } } },
      }),
      prisma.targetCompany.count({ where: { active: true } }),
      // New jobs this week
      prisma.jobPosting.count({
        where: {
          isActive: true,
          status: 'new',
          match: { fitScore: { gte: minScore } },
          discoveredAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      // High match (>= 70)
      prisma.jobPosting.count({
        where: { isActive: true, match: { fitScore: { gte: 70 } } },
      }),
      // Awaiting review = new + considering status, relevant score
      prisma.jobPosting.count({
        where: {
          isActive: true,
          status: { in: ['new', 'considering'] },
          match: { fitScore: { gte: minScore } },
        },
      }),
      prisma.jobPosting.count({ where: { isActive: true, status: 'applied' } }),
      prisma.jobPosting.count({ where: { isActive: true, status: 'interviewing' } }),
      // Jobs with interview_prep or fit_analysis generated
      prisma.jobPosting.count({
        where: { isActive: true, generatedAssets: { some: { assetType: { in: ['interview_prep', 'fit_analysis'] } } } },
      }),
      // Recent scans
      prisma.scanRun.findMany({
        include: { company: { select: { name: true } } },
        orderBy: { startedAt: 'desc' },
        take: 8,
      }),
      prisma.notification.count({ where: { status: 'unread' } }),
      prisma.agentRun.findMany({
        orderBy: { startedAt: 'desc' },
        take: 5,
        include: { jobPosting: { select: { id: true, title: true } } },
      }),
      // Status breakdown for relevant jobs
      prisma.jobPosting.groupBy({
        by: ['status'],
        where: { isActive: true, match: { fitScore: { gte: minScore } } },
        _count: { id: true },
      }),
    ])

    const topMatches = await prisma.jobPosting.findMany({
      where: { isActive: true, match: { fitScore: { gte: minScore } } },
      include: { match: true, company: { select: { id: true, name: true } } },
      orderBy: { match: { fitScore: 'desc' } },
      take: 5,
    })

    // Failed scans
    const failedScans = await prisma.scanRun.findMany({
      where: { status: 'failed', completedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
      include: { company: { select: { name: true } } },
    })

    res.json({
      ok: true,
      stats: {
        totalJobs,
        relevantJobs,
        companiesCount,
        newJobsThisWeek: newJobsCount,
        highMatchCount,
        awaitingReviewCount,
        appliedCount,
        interviewingCount,
        withGeneratedPrepCount,
        unreadNotifications,
        minScore,
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
router.get('/notifications', async (_req, res) => {
  try {
    const notifications = await prisma.notification.findMany({
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
    await prisma.notification.update({ where: { id }, data: { status: 'read' } })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// POST /api/dashboard/notifications/read-all
router.post('/notifications/read-all', async (_req, res) => {
  try {
    await prisma.notification.updateMany({ where: { status: 'unread' }, data: { status: 'read' } })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

export default router
