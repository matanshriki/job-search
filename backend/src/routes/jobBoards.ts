import { Router } from 'express'
import prisma from '../db/client'
import { requireAuth } from '../middleware/auth'
import { runJobBoardCrawlerForSource, runJobBoardCrawlerForUser } from '../agents/jobBoardCrawlerAgent'

const router = Router()
router.use(requireAuth)

// GET /api/job-boards/sources
router.get('/sources', async (req, res) => {
  try {
    const sources = await prisma.jobBoardSource.findMany({
      where: { userId: req.userId },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ ok: true, sources })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// POST /api/job-boards/sources
router.post('/sources', async (req, res) => {
  try {
    const { boardType, searchConfig } = req.body as {
      boardType: string
      searchConfig?: Record<string, unknown>
    }

    if (!boardType) return res.status(400).json({ ok: false, error: 'boardType is required' })

    const allowed = ['remotive', 'adzuna', 'wellfound']
    if (!allowed.includes(boardType)) {
      return res.status(400).json({ ok: false, error: `boardType must be one of: ${allowed.join(', ')}` })
    }

    const source = await prisma.jobBoardSource.create({
      data: {
        userId: req.userId,
        boardType,
        searchConfigJson: JSON.stringify(searchConfig ?? {}),
        active: true,
      },
    })
    res.status(201).json({ ok: true, source })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// PUT /api/job-boards/sources/:id
router.put('/sources/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    const existing = await prisma.jobBoardSource.findFirst({ where: { id, userId: req.userId } })
    if (!existing) return res.status(404).json({ ok: false, error: 'Not found' })

    const { active, searchConfig } = req.body as { active?: boolean; searchConfig?: Record<string, unknown> }
    const data: Record<string, unknown> = {}
    if (active !== undefined) data.active = active
    if (searchConfig !== undefined) data.searchConfigJson = JSON.stringify(searchConfig)

    const source = await prisma.jobBoardSource.update({ where: { id }, data: data as never })
    res.json({ ok: true, source })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// DELETE /api/job-boards/sources/:id
router.delete('/sources/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    const existing = await prisma.jobBoardSource.findFirst({ where: { id, userId: req.userId } })
    if (!existing) return res.status(404).json({ ok: false, error: 'Not found' })
    await prisma.jobBoardSource.delete({ where: { id } })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// POST /api/job-boards/crawl — crawl all active sources for the current user
router.post('/crawl', async (req, res) => {
  try {
    const result = await runJobBoardCrawlerForUser(req.userId)
    res.json({ ok: true, ...result })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// POST /api/job-boards/sources/:id/crawl — crawl a single source
router.post('/sources/:id/crawl', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    const existing = await prisma.jobBoardSource.findFirst({ where: { id, userId: req.userId } })
    if (!existing) return res.status(404).json({ ok: false, error: 'Not found' })

    const result = await runJobBoardCrawlerForSource(id, req.userId)
    res.json({ ok: true, result })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

export default router
