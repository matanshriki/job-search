import { Router } from 'express'
import prisma from '../db/client'
import { requireAuth } from '../middleware/auth'
import { profileToDbFields, buildProfileFromDb } from '../utils/profileHelpers'
import { scoreJobAgainstProfile, fitLabel } from '../services/scoring/matchEngine'

const router = Router()
router.use(requireAuth)

// GET /api/profile
router.get('/', async (req, res) => {
  try {
    let row = await prisma.profile.findFirst({ where: { userId: req.userId } })
    if (!row) {
      row = await prisma.profile.create({ data: { userId: req.userId } })
    }
    res.json({ ok: true, profile: row })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// PUT /api/profile
router.put('/', async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>
    const existing = await prisma.profile.findFirst({ where: { userId: req.userId } })

    let dbFields: Record<string, unknown>
    if ('targetTitles' in body || 'preferredGeographies' in body) {
      dbFields = profileToDbFields({
        targetTitles: (body.targetTitles as string[]) ?? [],
        excludedTitles: (body.excludedTitles as string[]) ?? [],
        targetSeniority: (body.targetSeniority as never[]) ?? [],
        preferredFunctions: (body.preferredFunctions as string[]) ?? [],
        preferredIndustries: (body.preferredIndustries as string[]) ?? [],
        preferredGeographies: (body.preferredGeographies as string[]) ?? [],
        remotePreference: (body.remotePreference as 'flexible') ?? 'flexible',
        idealCompanyStage: (body.idealCompanyStage as string[]) ?? [],
        keywordsBoost: (body.keywordsBoost as string[]) ?? [],
        keywordsPenalize: (body.keywordsPenalize as string[]) ?? [],
        compensationNotes: (body.compensationNotes as string) ?? '',
        personalSummary: (body.personalSummary as string) ?? '',
      })
      if ('fullName' in body) dbFields.fullName = body.fullName ?? ''
      if ('email' in body) dbFields.email = body.email ?? ''
      if ('linkedinUrl' in body) dbFields.linkedinUrl = body.linkedinUrl ?? ''
    } else {
      dbFields = body
    }

    let row
    if (existing) {
      row = await prisma.profile.update({ where: { id: existing.id }, data: dbFields as never })
    } else {
      const createData = { userId: req.userId, ...dbFields }
      row = await prisma.profile.create({ data: createData as never })
    }

    // Rescore only this user's active jobs
    const profile = buildProfileFromDb(row)
    const userCompanyIds = (
      await prisma.targetCompany.findMany({ where: { userId: req.userId }, select: { id: true } })
    ).map((c) => c.id)

    const jobs = await prisma.jobPosting.findMany({
      where: { isActive: true, companyId: { in: userCompanyIds } },
      include: { company: { select: { name: true } } },
    })
    for (const job of jobs) {
      const sr = scoreJobAgainstProfile(
        { title: job.title, company: job.company?.name ?? '', location: job.location, description: job.descriptionClean || job.descriptionRaw },
        profile,
      )
      await prisma.jobMatch.upsert({
        where: { jobPostingId: job.id },
        create: {
          jobPostingId: job.id, fitScore: sr.total, fitLabel: fitLabel(sr.total),
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

    res.json({ ok: true, profile: row, rescored: jobs.length })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

export default router
