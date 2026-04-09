import { Router } from 'express'
import prisma from '../db/client'
import { requireAuth } from '../middleware/auth'
import { scoreJobAgainstProfile, fitLabel, jobMatchesPreferredGeographies } from '../services/scoring/matchEngine'
import { buildProfileFromDb } from '../utils/profileHelpers'
import { jobDuplicateKey } from '../services/parsing/careerScanner'
import { runFitAnalystAgent } from '../agents/fitAnalystAgent'
import { runResumeTailorAgent } from '../agents/resumeTailorAgent'
import { runOutreachAgent } from '../agents/outreachAgent'
import { runInterviewPrepAgent } from '../agents/interviewPrepAgent'

const router = Router()
router.use(requireAuth)

/** Get the set of company IDs that belong to the current user. */
async function getUserCompanyIds(userId: number): Promise<number[]> {
  const companies = await prisma.targetCompany.findMany({
    where: { userId },
    select: { id: true },
  })
  return companies.map((c) => c.id)
}

// GET /api/jobs
router.get('/', async (req, res) => {
  try {
    const {
      q, status, source, company, location, minScore, maxScore,
      sort = 'score', hideOutsideProfileGeos, page = '1', limit = '100',
    } = req.query as Record<string, string>

    const userCompanyIds = await getUserCompanyIds(req.userId)

    const where: Record<string, unknown> = {
      isActive: true,
      companyId: { in: userCompanyIds },
    }

    if (q) {
      where.OR = [
        { title: { contains: q } },
        { location: { contains: q } },
        { descriptionClean: { contains: q } },
      ]
    }
    if (status && status !== 'all') where.status = status
    if (source && source !== 'all') where.sourceType = source
    if (location) where.location = { contains: location }

    if (company) {
      const companyRecord = await prisma.targetCompany.findFirst({
        where: { userId: req.userId, name: { contains: company } },
      })
      if (companyRecord) where.companyId = companyRecord.id
    }

    const jobs = await prisma.jobPosting.findMany({
      where: where as never,
      include: {
        match: true,
        company: { select: { id: true, name: true, priority: true } },
        generatedAssets: { select: { id: true, assetType: true, createdAt: true } },
        _count: { select: { jobNotes: true } },
      },
      take: parseInt(limit, 10),
      skip: (parseInt(page, 10) - 1) * parseInt(limit, 10),
    })

    let filtered = jobs
    if (minScore) filtered = filtered.filter((j) => (j.match?.fitScore ?? 0) >= parseInt(minScore, 10))
    if (maxScore) filtered = filtered.filter((j) => (j.match?.fitScore ?? 0) <= parseInt(maxScore, 10))

    if (hideOutsideProfileGeos === 'true') {
      const profileRow = await prisma.profile.findFirst({ where: { userId: req.userId } })
      if (profileRow) {
        const profile = buildProfileFromDb(profileRow)
        if (profile.preferredGeographies.length > 0) {
          filtered = filtered.filter((j) =>
            jobMatchesPreferredGeographies(
              { title: j.title, location: j.location, description: j.descriptionClean || j.descriptionRaw },
              profile,
            ),
          )
        }
      }
    }

    if (sort === 'score') {
      filtered.sort((a, b) => (b.match?.fitScore ?? 0) - (a.match?.fitScore ?? 0))
    } else if (sort === 'dateFound' || sort === 'discoveredAt') {
      filtered.sort((a, b) => new Date(b.discoveredAt).getTime() - new Date(a.discoveredAt).getTime())
    } else if (sort === 'datePosted') {
      filtered.sort((a, b) => {
        const da = a.postedAt ? new Date(a.postedAt).getTime() : 0
        const db = b.postedAt ? new Date(b.postedAt).getTime() : 0
        return db - da
      })
    }

    const total = await prisma.jobPosting.count({ where: where as never })
    res.json({ ok: true, jobs: filtered, total })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// POST /api/jobs (manual add)
router.post('/', async (req, res) => {
  try {
    const {
      title, company: companyName, location, description, sourceType, sourceUrl,
      status, notes, tags, companyId, department, employmentType, datePosted,
    } = req.body as {
      title: string; company?: string; location?: string; description?: string
      sourceType?: string; sourceUrl?: string; status?: string; notes?: string
      tags?: string[]; companyId?: number; department?: string; employmentType?: string
      datePosted?: string
    }

    if (!title) return res.status(400).json({ ok: false, error: 'title is required' })

    // Verify company belongs to this user
    if (companyId) {
      const owns = await prisma.targetCompany.findFirst({ where: { id: companyId, userId: req.userId } })
      if (!owns) return res.status(403).json({ ok: false, error: 'Company not found' })
    }

    const profileRow = await prisma.profile.findFirst({ where: { userId: req.userId } })
    const profile = profileRow ? buildProfileFromDb(profileRow) : null

    const resolvedCompanyName = companyName ??
      (companyId ? (await prisma.targetCompany.findUnique({ where: { id: companyId } }))?.name ?? '' : '')

    const normalizedKey = jobDuplicateKey(resolvedCompanyName, title, location ?? 'Unspecified')

    const userCompanyIds = await getUserCompanyIds(req.userId)
    const existing = await prisma.jobPosting.findFirst({
      where: { normalizedKey, companyId: { in: userCompanyIds } },
    })
    if (existing) {
      return res.status(409).json({ ok: false, error: 'Duplicate job already exists', existingId: existing.id })
    }

    const job = await prisma.jobPosting.create({
      data: {
        companyId: companyId ?? null,
        title,
        location: location ?? 'Unspecified',
        department: department ?? '',
        employmentType: employmentType ?? '',
        descriptionRaw: description ?? '',
        descriptionClean: description ?? '',
        jobUrl: sourceUrl ?? '',
        sourceType: sourceType ?? 'manual_entry',
        sourceProvider: sourceType ?? 'manual_entry',
        sourceLabel: sourceType ?? 'Manual Entry',
        postedAt: datePosted ? new Date(datePosted) : null,
        normalizedKey,
        status: status ?? 'new',
        notes: notes ?? '',
        tagsJson: JSON.stringify(tags ?? []),
        isActive: true,
      },
    })

    if (profile) {
      const sr = scoreJobAgainstProfile({
        title, company: resolvedCompanyName, location: location ?? 'Unspecified', description: description ?? '',
      }, profile)
      await prisma.jobMatch.create({
        data: {
          jobPostingId: job.id, fitScore: sr.total, fitLabel: fitLabel(sr.total),
          scoreBreakdownJson: JSON.stringify(sr.breakdown), matchingReasonsJson: JSON.stringify(sr.strengths),
          concernsJson: JSON.stringify(sr.concerns), redFlagsJson: JSON.stringify(sr.redFlags),
          fitSummary: sr.fitSummary, insightSnippet: sr.insightSnippet, strengthsJson: JSON.stringify(sr.strengths),
        },
      })
    }

    await prisma.activityLog.create({
      data: {
        entityType: 'job_posting', entityId: String(job.id), action: 'created',
        metadataJson: JSON.stringify({ source: 'manual' }), jobPostingId: job.id,
      },
    })

    const fullJob = await prisma.jobPosting.findUnique({ where: { id: job.id }, include: { match: true } })
    res.status(201).json({ ok: true, job: fullJob })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// GET /api/jobs/:id
router.get('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    const userCompanyIds = await getUserCompanyIds(req.userId)
    const job = await prisma.jobPosting.findFirst({
      where: { id, companyId: { in: userCompanyIds } },
      include: {
        match: true,
        company: true,
        generatedAssets: { orderBy: [{ assetType: 'asc' }, { version: 'desc' }] },
        jobNotes: { orderBy: { createdAt: 'desc' } },
        agentRuns: { orderBy: { startedAt: 'desc' }, take: 20 },
        activityLogs: { orderBy: { createdAt: 'desc' }, take: 30 },
      },
    })
    if (!job) return res.status(404).json({ ok: false, error: 'Not found' })
    res.json({ ok: true, job })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// PUT /api/jobs/:id
router.put('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    const userCompanyIds = await getUserCompanyIds(req.userId)
    const existing = await prisma.jobPosting.findFirst({
      where: { id, companyId: { in: userCompanyIds } },
    })
    if (!existing) return res.status(404).json({ ok: false, error: 'Not found' })

    const { status, notes, tags, isActive, title, location, descriptionRaw, descriptionClean } = req.body as {
      status?: string; notes?: string; tags?: string[]; isActive?: boolean
      title?: string; location?: string; descriptionRaw?: string; descriptionClean?: string
    }

    const updateData: Record<string, unknown> = {}
    if (status !== undefined) updateData.status = status
    if (notes !== undefined) updateData.notes = notes
    if (tags !== undefined) updateData.tagsJson = JSON.stringify(tags)
    if (isActive !== undefined) updateData.isActive = isActive
    if (title !== undefined) updateData.title = title
    if (location !== undefined) updateData.location = location
    if (descriptionRaw !== undefined) updateData.descriptionRaw = descriptionRaw
    if (descriptionClean !== undefined) updateData.descriptionClean = descriptionClean

    const job = await prisma.jobPosting.update({ where: { id }, data: updateData as never })

    if (title || location || descriptionRaw || descriptionClean) {
      const profileRow = await prisma.profile.findFirst({ where: { userId: req.userId } })
      if (profileRow) {
        const profile = buildProfileFromDb(profileRow)
        const companyName = job.companyId
          ? (await prisma.targetCompany.findUnique({ where: { id: job.companyId } }))?.name ?? ''
          : ''
        const sr = scoreJobAgainstProfile({
          title: job.title, company: companyName, location: job.location,
          description: job.descriptionClean || job.descriptionRaw,
        }, profile)
        await prisma.jobMatch.upsert({
          where: { jobPostingId: id },
          create: {
            jobPostingId: id, fitScore: sr.total, fitLabel: fitLabel(sr.total),
            scoreBreakdownJson: JSON.stringify(sr.breakdown), matchingReasonsJson: JSON.stringify(sr.strengths),
            concernsJson: JSON.stringify(sr.concerns), redFlagsJson: JSON.stringify(sr.redFlags),
            fitSummary: sr.fitSummary, insightSnippet: sr.insightSnippet, strengthsJson: JSON.stringify(sr.strengths),
          },
          update: {
            fitScore: sr.total, fitLabel: fitLabel(sr.total),
            scoreBreakdownJson: JSON.stringify(sr.breakdown), matchingReasonsJson: JSON.stringify(sr.strengths),
            concernsJson: JSON.stringify(sr.concerns), redFlagsJson: JSON.stringify(sr.redFlags),
            fitSummary: sr.fitSummary, insightSnippet: sr.insightSnippet, strengthsJson: JSON.stringify(sr.strengths),
            updatedAt: new Date(),
          },
        })
      }
    }

    await prisma.activityLog.create({
      data: {
        entityType: 'job_posting', entityId: String(id), action: 'updated',
        metadataJson: JSON.stringify({ fields: Object.keys(updateData) }), jobPostingId: id,
      },
    })

    const fullJob = await prisma.jobPosting.findUnique({ where: { id }, include: { match: true } })
    res.json({ ok: true, job: fullJob })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// DELETE /api/jobs/:id
router.delete('/:id', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    const userCompanyIds = await getUserCompanyIds(req.userId)
    const existing = await prisma.jobPosting.findFirst({ where: { id, companyId: { in: userCompanyIds } } })
    if (!existing) return res.status(404).json({ ok: false, error: 'Not found' })
    await prisma.jobPosting.delete({ where: { id } })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// POST /api/jobs/:id/run-agent/:agentType
router.post('/:id/run-agent/:agentType', async (req, res) => {
  try {
    const jobId = parseInt(req.params.id, 10)
    const { agentType } = req.params

    const userCompanyIds = await getUserCompanyIds(req.userId)
    const exists = await prisma.jobPosting.findFirst({ where: { id: jobId, companyId: { in: userCompanyIds } } })
    if (!exists) return res.status(404).json({ ok: false, error: 'Not found' })

    let result: unknown
    switch (agentType) {
      case 'fit_analysis':
        result = await runFitAnalystAgent(jobId)
        break
      case 'resume_tailoring':
        result = await runResumeTailorAgent(jobId, req.body?.resumeId)
        break
      case 'outreach':
        result = await runOutreachAgent(jobId)
        break
      case 'interview_prep':
        result = await runInterviewPrepAgent(jobId)
        break
      default:
        return res.status(400).json({ ok: false, error: `Unknown agent type: ${agentType}` })
    }

    res.json({ ok: true, result })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// GET /api/jobs/:id/assets
router.get('/:id/assets', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    const userCompanyIds = await getUserCompanyIds(req.userId)
    const exists = await prisma.jobPosting.findFirst({ where: { id, companyId: { in: userCompanyIds } } })
    if (!exists) return res.status(404).json({ ok: false, error: 'Not found' })
    const assets = await prisma.generatedAsset.findMany({
      where: { jobPostingId: id },
      orderBy: [{ assetType: 'asc' }, { version: 'desc' }],
    })
    res.json({ ok: true, assets })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// GET /api/jobs/:id/notes
router.get('/:id/notes', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    const userCompanyIds = await getUserCompanyIds(req.userId)
    const exists = await prisma.jobPosting.findFirst({ where: { id, companyId: { in: userCompanyIds } } })
    if (!exists) return res.status(404).json({ ok: false, error: 'Not found' })
    const notes = await prisma.jobNote.findMany({
      where: { jobPostingId: id },
      orderBy: { createdAt: 'desc' },
    })
    res.json({ ok: true, notes })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// POST /api/jobs/:id/notes
router.post('/:id/notes', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    const userCompanyIds = await getUserCompanyIds(req.userId)
    const exists = await prisma.jobPosting.findFirst({ where: { id, companyId: { in: userCompanyIds } } })
    if (!exists) return res.status(404).json({ ok: false, error: 'Not found' })
    const { content, noteType } = req.body as { content: string; noteType?: string }
    if (!content) return res.status(400).json({ ok: false, error: 'content is required' })
    const note = await prisma.jobNote.create({
      data: { jobPostingId: id, content, noteType: noteType ?? 'general' },
    })
    res.status(201).json({ ok: true, note })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// GET /api/jobs/:id/score
router.get('/:id/score', async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10)
    const userCompanyIds = await getUserCompanyIds(req.userId)
    const job = await prisma.jobPosting.findFirst({ where: { id, companyId: { in: userCompanyIds } } })
    if (!job) return res.status(404).json({ ok: false, error: 'Not found' })
    const profileRow = await prisma.profile.findFirst({ where: { userId: req.userId } })
    if (!profileRow) return res.status(400).json({ ok: false, error: 'No profile configured' })
    const profile = buildProfileFromDb(profileRow)
    const companyName = job.companyId
      ? (await prisma.targetCompany.findUnique({ where: { id: job.companyId } }))?.name ?? ''
      : ''
    const sr = scoreJobAgainstProfile({
      title: job.title, company: companyName, location: job.location,
      description: job.descriptionClean || job.descriptionRaw,
    }, profile)
    res.json({ ok: true, score: sr })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

export default router
