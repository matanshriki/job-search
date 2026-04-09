import { Router } from 'express'
import prisma from '../db/client'
import { requireAuth } from '../middleware/auth'
import { runScoutAgentForCompany } from '../agents/scoutAgent'
import { scanFromPastedHtml, jobDuplicateKey } from '../services/parsing/careerScanner'
import { scoreJobAgainstProfile, fitLabel } from '../services/scoring/matchEngine'
import { buildProfileFromDb } from '../utils/profileHelpers'

const router = Router()
router.use(requireAuth)

// GET /api/companies
router.get('/', async (req, res) => {
  try {
    const companies = await prisma.targetCompany.findMany({
      where: { userId: req.userId },
      include: {
        sources: true,
        _count: { select: { jobPostings: { where: { isActive: true } } } },
      },
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
    })
    const companyIds = companies.map((c) => c.id)
    const lastScans = await prisma.scanRun.findMany({
      where: { companyId: { in: companyIds } },
      orderBy: { startedAt: 'desc' },
      distinct: ['companyId'],
    })
    const lastScanMap = new Map(lastScans.map((s) => [s.companyId, s]))
    const enriched = companies.map((c) => ({
      ...c,
      lastScan: lastScanMap.get(c.id) ?? null,
      jobsFoundCount: c._count.jobPostings,
    }))
    res.json({ ok: true, companies: enriched })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// POST /api/companies
router.post('/', async (req, res) => {
  try {
    const { name, careersUrl, companyDomain, priority, notes } = req.body as {
      name: string
      careersUrl?: string
      companyDomain?: string
      priority?: string
      notes?: string
    }
    if (!name) return res.status(400).json({ ok: false, error: 'name is required' })

    const company = await prisma.targetCompany.create({
      data: {
        userId: req.userId,
        name,
        careersUrl: careersUrl ?? '',
        companyDomain: companyDomain ?? '',
        priority: priority ?? 'medium',
        notes: notes ?? '',
        active: true,
      },
    })

    if (careersUrl) {
      const isGreenhouse = careersUrl.includes('greenhouse.io')
      await prisma.companySource.create({
        data: {
          companyId: company.id,
          sourceType: isGreenhouse ? 'greenhouse' : 'generic_html',
          sourceUrl: careersUrl,
          active: true,
        },
      })
    }

    res.status(201).json({ ok: true, company })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// GET /api/companies/:id
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    const company = await prisma.targetCompany.findFirst({
      where: { id, userId: req.userId },
      include: {
        sources: true,
        scanRuns: { orderBy: { startedAt: 'desc' }, take: 10 },
        jobPostings: {
          where: { isActive: true },
          include: { match: true },
          orderBy: { discoveredAt: 'desc' },
          take: 20,
        },
      },
    })
    if (!company) return res.status(404).json({ ok: false, error: 'Not found' })
    res.json({ ok: true, company })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// PUT /api/companies/:id
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    const existing = await prisma.targetCompany.findFirst({ where: { id, userId: req.userId } })
    if (!existing) return res.status(404).json({ ok: false, error: 'Not found' })

    const { name, careersUrl, companyDomain, priority, notes, active } = req.body as {
      name?: string; careersUrl?: string; companyDomain?: string; priority?: string; notes?: string; active?: boolean
    }
    const company = await prisma.targetCompany.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(careersUrl !== undefined && { careersUrl }),
        ...(companyDomain !== undefined && { companyDomain }),
        ...(priority && { priority }),
        ...(notes !== undefined && { notes }),
        ...(active !== undefined && { active }),
      },
    })
    res.json({ ok: true, company })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// DELETE /api/companies/:id
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    const existing = await prisma.targetCompany.findFirst({ where: { id, userId: req.userId } })
    if (!existing) return res.status(404).json({ ok: false, error: 'Not found' })
    await prisma.targetCompany.delete({ where: { id } })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// POST /api/companies/:id/scan
router.post('/:id/scan', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    const existing = await prisma.targetCompany.findFirst({ where: { id, userId: req.userId } })
    if (!existing) return res.status(404).json({ ok: false, error: 'Not found' })

    const result = await runScoutAgentForCompany(id, req.userId)
    res.json({
      ok: result.success,
      ...(result.success ? {} : { error: result.message }),
      ...result,
    })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// POST /api/companies/:id/paste-html
router.post('/:id/paste-html', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    const { html, baseUrl } = req.body as { html: string; baseUrl?: string }
    if (!html) return res.status(400).json({ ok: false, error: 'html is required' })

    const company = await prisma.targetCompany.findFirst({ where: { id, userId: req.userId } })
    if (!company) return res.status(404).json({ ok: false, error: 'Company not found' })

    const result = await scanFromPastedHtml({
      html,
      baseUrl: baseUrl || company.careersUrl,
      companyName: company.name,
    })

    const profileRow = await prisma.profile.findFirst({ where: { userId: req.userId } })
    const profile = profileRow ? buildProfileFromDb(profileRow) : null

    let jobsCreated = 0
    if (result.ok && profile) {
      for (const draft of result.jobs) {
        const key = draft.normalizedKey || jobDuplicateKey(draft.company, draft.title, draft.location)
        const existing = await prisma.jobPosting.findFirst({ where: { normalizedKey: key, companyId: id } })
        if (existing) continue
        const sr = scoreJobAgainstProfile(
          { title: draft.title, company: draft.company, location: draft.location, description: draft.description },
          profile,
        )
        const newJob = await prisma.jobPosting.create({
          data: {
            companyId: id,
            title: draft.title,
            location: draft.location,
            descriptionRaw: draft.description,
            descriptionClean: draft.description,
            jobUrl: draft.sourceUrl,
            sourceType: draft.sourceType,
            sourceLabel: draft.sourceLabel,
            normalizedKey: key,
            isActive: true,
            status: 'new',
          },
        })
        await prisma.jobMatch.create({
          data: {
            jobPostingId: newJob.id,
            fitScore: sr.total,
            fitLabel: fitLabel(sr.total),
            scoreBreakdownJson: JSON.stringify(sr.breakdown),
            matchingReasonsJson: JSON.stringify(sr.strengths),
            concernsJson: JSON.stringify(sr.concerns),
            redFlagsJson: JSON.stringify(sr.redFlags),
            fitSummary: sr.fitSummary,
            insightSnippet: sr.insightSnippet,
            strengthsJson: JSON.stringify(sr.strengths),
          },
        })
        jobsCreated++
      }
    }

    res.json({ ok: result.ok, message: result.message, warnings: result.warnings, jobs: result.jobs, method: result.method, jobsCreated })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// GET /api/companies/:id/sources
router.get('/:id/sources', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    const company = await prisma.targetCompany.findFirst({ where: { id, userId: req.userId } })
    if (!company) return res.status(404).json({ ok: false, error: 'Not found' })
    const sources = await prisma.companySource.findMany({ where: { companyId: id } })
    res.json({ ok: true, sources })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// POST /api/companies/:id/sources
router.post('/:id/sources', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    const company = await prisma.targetCompany.findFirst({ where: { id, userId: req.userId } })
    if (!company) return res.status(404).json({ ok: false, error: 'Not found' })

    const { sourceType, sourceUrl, atsProvider } = req.body as {
      sourceType: string; sourceUrl: string; atsProvider?: string
    }
    const source = await prisma.companySource.create({
      data: { companyId: id, sourceType, sourceUrl, atsProvider: atsProvider ?? '', active: true },
    })
    res.status(201).json({ ok: true, source })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

export default router
