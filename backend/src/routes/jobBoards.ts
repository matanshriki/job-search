import { Router } from 'express'
import prisma from '../db/client'
import { requireAuth } from '../middleware/auth'
import { runJobBoardCrawlerForSource, runJobBoardCrawlerForUser } from '../agents/jobBoardCrawlerAgent'
import { buildProfileFromDb } from '../utils/profileHelpers'

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

    const allowed = ['remotive', 'arbeitnow', 'adzuna']
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

// POST /api/job-boards/bootstrap — auto-create sources from profile + crawl immediately
router.post('/bootstrap', async (req, res) => {
  try {
    const profileRow = await prisma.profile.findFirst({ where: { userId: req.userId } })
    if (!profileRow) {
      return res.status(400).json({ ok: false, error: 'No profile found. Set up your profile first.' })
    }

    const profile = buildProfileFromDb(profileRow)
    const titles = profile.targetTitles.slice(0, 3)
    const keywords = profile.keywordsBoost.slice(0, 2)

    // Build a single smart search term from titles + key keywords
    const allTerms = [...titles, ...keywords].filter(Boolean)
    if (allTerms.length === 0) {
      return res.status(400).json({
        ok: false,
        error: 'Your profile has no target titles or keywords. Add those first so agents know what to hunt for.',
      })
    }

    // Build search string: top 2 titles joined with space (natural language query)
    const searchQuery = titles.slice(0, 2).join(' ') || keywords.slice(0, 2).join(' ')

    // Remove any existing sources so we don't duplicate
    const existingSources = await prisma.jobBoardSource.findMany({ where: { userId: req.userId } })
    const existingBoards = new Set(existingSources.map((s) => s.boardType))

    const created: string[] = []

    // Create Remotive source if not already configured
    if (!existingBoards.has('remotive')) {
      await prisma.jobBoardSource.create({
        data: {
          userId: req.userId,
          boardType: 'remotive',
          searchConfigJson: JSON.stringify({ search: searchQuery, limit: 100 }),
          active: true,
        },
      })
      created.push('Remotive')
    }

    // Create Arbeitnow source if not already configured
    if (!existingBoards.has('arbeitnow')) {
      await prisma.jobBoardSource.create({
        data: {
          userId: req.userId,
          boardType: 'arbeitnow',
          searchConfigJson: JSON.stringify({ search: searchQuery, limit: 100 }),
          active: true,
        },
      })
      created.push('Arbeitnow')
    }

    // Kick off crawl immediately (fire and respond, don't await the full crawl)
    const crawlPromise = runJobBoardCrawlerForUser(req.userId)

    // Give crawl up to 30s to respond, then return partial result
    const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 30000))
    const crawlResult = await Promise.race([crawlPromise, timeout])

    res.json({
      ok: true,
      sourcesCreated: created,
      searchQuery,
      crawlResult: crawlResult ?? { message: 'Crawl running in background — check Jobs Feed in a moment.' },
      message: created.length > 0
        ? `Created ${created.join(' + ')} sources for "${searchQuery}" and started crawling.`
        : `Crawl started on your ${existingSources.length} existing source(s) using "${searchQuery}".`,
    })
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
