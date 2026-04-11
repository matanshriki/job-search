import { Router } from 'express'
import prisma from '../db/client'
import { requireAuth } from '../middleware/auth'

const router = Router()
router.use(requireAuth)

const jobPostingInclude = {
  select: { id: true, title: true, jobUrl: true, company: { select: { name: true } } },
} as const

// GET /api/queue — list queue items (defaults to pending_review)
router.get('/', async (req, res) => {
  try {
    const { status, limit = '50' } = req.query as Record<string, string>
    const where: Record<string, unknown> = { userId: req.userId }
    if (status && status !== 'all') {
      where.status = status
    } else if (!status) {
      // Default: only pending items
      where.status = 'pending_review'
    }

    const items = await prisma.approvalQueueItem.findMany({
      where: where as never,
      include: { jobPosting: jobPostingInclude },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit, 10),
    })

    const pendingCount = await prisma.approvalQueueItem.count({
      where: { userId: req.userId, status: 'pending_review' },
    })

    const totalCount = await prisma.approvalQueueItem.count({
      where: { userId: req.userId },
    })

    res.json({ ok: true, items, pendingCount, totalCount })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// POST /api/queue/clear — remove all inbox items for the current user (any status)
router.post('/clear', async (req, res) => {
  try {
    const result = await prisma.approvalQueueItem.deleteMany({
      where: { userId: req.userId },
    })
    res.json({ ok: true, deleted: result.count })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// GET /api/queue/:id
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    const item = await prisma.approvalQueueItem.findFirst({
      where: { id, userId: req.userId },
      include: { jobPosting: jobPostingInclude },
    })
    if (!item) return res.status(404).json({ ok: false, error: 'Not found' })
    res.json({ ok: true, item })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// PUT /api/queue/:id — edit payload (outreach draft, resume bullets, etc.)
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    const existing = await prisma.approvalQueueItem.findFirst({ where: { id, userId: req.userId } })
    if (!existing) return res.status(404).json({ ok: false, error: 'Not found' })
    if (existing.status !== 'pending_review') {
      return res.status(409).json({ ok: false, error: `Cannot edit item with status: ${existing.status}` })
    }

    const { payload } = req.body as { payload?: Record<string, unknown> }
    if (!payload) return res.status(400).json({ ok: false, error: 'payload is required' })

    const item = await prisma.approvalQueueItem.update({
      where: { id },
      data: { payloadJson: JSON.stringify(payload) },
      include: { jobPosting: jobPostingInclude },
    })
    res.json({ ok: true, item })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// POST /api/queue/:id/approve
router.post('/:id/approve', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    const existing = await prisma.approvalQueueItem.findFirst({ where: { id, userId: req.userId } })
    if (!existing) return res.status(404).json({ ok: false, error: 'Not found' })
    if (existing.status !== 'pending_review') {
      return res.status(409).json({ ok: false, error: `Item already ${existing.status}` })
    }

    const item = await prisma.approvalQueueItem.update({
      where: { id },
      data: { status: 'approved', reviewedAt: new Date() },
      include: { jobPosting: jobPostingInclude },
    })

    // Log the approval as an activity so it shows up in the job's timeline
    await prisma.activityLog.create({
      data: {
        entityType: 'job_posting',
        entityId: String(existing.jobPostingId),
        action: 'application_approved',
        metadataJson: JSON.stringify({ queueItemId: id }),
        jobPostingId: existing.jobPostingId,
      },
    })

    // Move the job to "applied" pipeline status
    await prisma.jobPosting.update({
      where: { id: existing.jobPostingId },
      data: { status: 'applied' },
    })

    res.json({ ok: true, item })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// POST /api/queue/:id/reject
router.post('/:id/reject', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    const existing = await prisma.approvalQueueItem.findFirst({ where: { id, userId: req.userId } })
    if (!existing) return res.status(404).json({ ok: false, error: 'Not found' })
    if (existing.status !== 'pending_review') {
      return res.status(409).json({ ok: false, error: `Item already ${existing.status}` })
    }

    const item = await prisma.approvalQueueItem.update({
      where: { id },
      data: { status: 'rejected', reviewedAt: new Date() },
      include: { jobPosting: jobPostingInclude },
    })

    await prisma.activityLog.create({
      data: {
        entityType: 'job_posting',
        entityId: String(existing.jobPostingId),
        action: 'application_rejected',
        metadataJson: JSON.stringify({ queueItemId: id }),
        jobPostingId: existing.jobPostingId,
      },
    })

    res.json({ ok: true, item })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

export default router
