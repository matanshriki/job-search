import { Router } from 'express'
import prisma from '../db/client'
import { requireAuth } from '../middleware/auth'
import { scoreJobAgainstProfile, fitLabel } from '../services/scoring/matchEngine'
import { buildProfileFromDb } from '../utils/profileHelpers'
import { jobDuplicateKey } from '../services/parsing/careerScanner'

const router = Router()
router.use(requireAuth)

// GET /api/export — export all data as JSON
router.get('/', async (req, res) => {
  try {
    const userCompanyIds = (
      await prisma.targetCompany.findMany({ where: { userId: req.userId }, select: { id: true } })
    ).map((c) => c.id)

    const [profile, companies, jobs, scanRuns, resumes] = await Promise.all([
      prisma.profile.findFirst({ where: { userId: req.userId } }),
      prisma.targetCompany.findMany({ where: { userId: req.userId }, include: { sources: true } }),
      prisma.jobPosting.findMany({
        where: { companyId: { in: userCompanyIds } },
        include: { match: true, jobNotes: true, company: { select: { name: true } } },
      }),
      prisma.scanRun.findMany({
        where: { companyId: { in: userCompanyIds } },
        orderBy: { startedAt: 'desc' },
        take: 200,
      }),
      prisma.resume.findMany({ where: { userId: req.userId } }),
    ])

    // Shape as legacy-compatible format for backward compat
    const exportData = {
      version: 3,
      exportedAt: new Date().toISOString(),
      profile: profile
        ? {
            targetTitles: JSON.parse(profile.preferredTitlesJson),
            excludedTitles: JSON.parse(profile.excludedTitlesJson),
            targetSeniority: JSON.parse(profile.seniorityLevel),
            preferredFunctions: JSON.parse(profile.preferredFunctionsJson),
            preferredIndustries: JSON.parse(profile.preferredIndustriesJson),
            preferredGeographies: JSON.parse(profile.preferredLocationsJson),
            remotePreference: profile.remotePreference,
            idealCompanyStage: JSON.parse(profile.idealCompanyStageJson),
            keywordsBoost: JSON.parse(profile.targetKeywordsJson),
            keywordsPenalize: JSON.parse(profile.excludedKeywordsJson),
            compensationNotes: profile.compensationNotes,
            personalSummary: profile.summary,
            fullName: profile.fullName,
            email: profile.email,
            linkedinUrl: profile.linkedinUrl,
          }
        : null,
      companies: companies.map((c) => ({
        id: String(c.id),
        name: c.name,
        website: c.companyDomain,
        careerPageUrl: c.careersUrl,
        notes: c.notes,
        priority: c.priority,
        createdAt: c.createdAt.toISOString(),
        sources: c.sources,
      })),
      jobs: jobs.map((j) => ({
        id: String(j.id),
        title: j.title,
        company: j.company?.name ?? '',
        location: j.location,
        department: j.department,
        employmentType: j.employmentType,
        description: j.descriptionRaw,
        sourceType: j.sourceType,
        sourceLabel: j.sourceLabel,
        sourceUrl: j.jobUrl ?? '',
        dateFound: j.discoveredAt.toISOString(),
        datePosted: j.postedAt?.toISOString() ?? null,
        score: j.match?.fitScore ?? 0,
        fitSummary: j.match?.fitSummary ?? '',
        strengths: JSON.parse(j.match?.strengthsJson ?? '[]'),
        concerns: JSON.parse(j.match?.concernsJson ?? '[]'),
        redFlags: JSON.parse(j.match?.redFlagsJson ?? '[]'),
        insightSnippet: j.match?.insightSnippet ?? '',
        status: j.status,
        notes: j.notes,
        tags: JSON.parse(j.tagsJson),
        normalizedKey: j.normalizedKey,
        companyId: j.companyId ? String(j.companyId) : null,
        jobNotes: j.jobNotes,
      })),
      scanHistory: scanRuns.map((s) => ({
        id: String(s.id),
        companyId: s.companyId ? String(s.companyId) : '',
        companyName: '',
        at: s.startedAt.toISOString(),
        outcome: s.status === 'completed' ? 'success' : s.status,
        message: s.message,
        jobsFound: s.jobsFound,
        method: s.method || 'generic_html',
      })),
      resumes,
    }

    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', `attachment; filename="job-search-export-${new Date().toISOString().split('T')[0]}.json"`)
    res.json(exportData)
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// POST /api/import — import JSON (legacy or new format)
router.post('/', async (req, res) => {
  try {
    const body = req.body as Record<string, unknown>
    const { clearExisting = false, data } = body as { clearExisting?: boolean; data?: unknown }
    const importData = (data ?? body) as Record<string, unknown>

    if (clearExisting) {
      // Clear only this user's data
      const userCompanyIds = (
        await prisma.targetCompany.findMany({ where: { userId: req.userId }, select: { id: true } })
      ).map((c) => c.id)
      await prisma.jobPosting.findMany({ where: { companyId: { in: userCompanyIds } } }).then(async (jobs) => {
        const jobIds = jobs.map((j) => j.id)
        await prisma.activityLog.deleteMany({ where: { jobPostingId: { in: jobIds } } })
        await prisma.notification.deleteMany({ where: { jobPostingId: { in: jobIds } } })
        await prisma.agentRun.deleteMany({ where: { jobPostingId: { in: jobIds } } })
        await prisma.generatedAsset.deleteMany({ where: { jobPostingId: { in: jobIds } } })
        await prisma.jobMatch.deleteMany({ where: { jobPostingId: { in: jobIds } } })
        await prisma.jobNote.deleteMany({ where: { jobPostingId: { in: jobIds } } })
        await prisma.jobPosting.deleteMany({ where: { id: { in: jobIds } } })
      })
      await prisma.scanRun.deleteMany({ where: { companyId: { in: userCompanyIds } } })
      await prisma.companySource.deleteMany({ where: { companyId: { in: userCompanyIds } } })
      await prisma.targetCompany.deleteMany({ where: { userId: req.userId } })
      await prisma.resume.deleteMany({ where: { userId: req.userId } })
      await prisma.profile.deleteMany({ where: { userId: req.userId } })
    }

    let stats = { profiles: 0, companies: 0, jobs: 0, resumes: 0, scanHistory: 0 }

    // Import profile
    if (importData.profile) {
      const p = importData.profile as Record<string, unknown>
      const profileData = {
        preferredTitlesJson: JSON.stringify(p.targetTitles ?? []),
        excludedTitlesJson: JSON.stringify(p.excludedTitles ?? []),
        seniorityLevel: JSON.stringify(p.targetSeniority ?? []),
        preferredFunctionsJson: JSON.stringify(p.preferredFunctions ?? []),
        preferredIndustriesJson: JSON.stringify(p.preferredIndustries ?? []),
        preferredLocationsJson: JSON.stringify(p.preferredGeographies ?? []),
        remotePreference: (p.remotePreference as string) ?? 'flexible',
        idealCompanyStageJson: JSON.stringify(p.idealCompanyStage ?? []),
        targetKeywordsJson: JSON.stringify(p.keywordsBoost ?? []),
        excludedKeywordsJson: JSON.stringify(p.keywordsPenalize ?? []),
        compensationNotes: (p.compensationNotes as string) ?? '',
        summary: (p.personalSummary as string) ?? '',
        fullName: (p.fullName as string) ?? '',
        email: (p.email as string) ?? '',
        linkedinUrl: (p.linkedinUrl as string) ?? '',
      }
      const existing = await prisma.profile.findFirst({ where: { userId: req.userId } })
      if (existing) await prisma.profile.update({ where: { id: existing.id }, data: profileData })
      else await prisma.profile.create({ data: { userId: req.userId, ...profileData } })
      stats.profiles = 1
    }

    // Import companies
    const companyIdMap = new Map<string, number>()
    if (Array.isArray(importData.companies)) {
      for (const c of importData.companies as Array<Record<string, unknown>>) {
        const existing = await prisma.targetCompany.findFirst({
          where: { userId: req.userId, name: c.name as string },
        })
        if (existing) {
          companyIdMap.set(c.id as string, existing.id)
          continue
        }
        const created = await prisma.targetCompany.create({
          data: {
            userId: req.userId,
            name: c.name as string,
            companyDomain: (c.website as string) ?? '',
            careersUrl: (c.careerPageUrl as string) ?? '',
            priority: (c.priority as string) ?? 'medium',
            notes: (c.notes as string) ?? '',
            active: true,
          },
        })
        if (c.careerPageUrl) {
          await prisma.companySource.create({
            data: {
              companyId: created.id,
              sourceType: (c.careerPageUrl as string).includes('greenhouse') ? 'greenhouse' : 'generic_html',
              sourceUrl: c.careerPageUrl as string,
              active: true,
            },
          })
        }
        companyIdMap.set(c.id as string, created.id)
        stats.companies++
      }
    }

    // Build profile for scoring
    const profileRow = await prisma.profile.findFirst({ where: { userId: req.userId } })
    const profile = profileRow ? buildProfileFromDb(profileRow) : null

    // Import jobs
    if (Array.isArray(importData.jobs)) {
      for (const j of importData.jobs as Array<Record<string, unknown>>) {
        const nkey = (j.normalizedKey as string) || jobDuplicateKey(j.company as string ?? '', j.title as string, j.location as string ?? '')
        const existing = await prisma.jobPosting.findFirst({ where: { normalizedKey: nkey } })
        if (existing) continue

        const companyId = j.companyId ? companyIdMap.get(j.companyId as string) ?? null : null
        const sr = profile
          ? scoreJobAgainstProfile({ title: j.title as string, company: j.company as string ?? '', location: j.location as string ?? '', description: j.description as string ?? '' }, profile)
          : null

        const newJob = await prisma.jobPosting.create({
          data: {
            companyId,
            title: j.title as string,
            location: (j.location as string) ?? '',
            department: (j.department as string) ?? '',
            employmentType: (j.employmentType as string) ?? '',
            descriptionRaw: (j.description as string) ?? '',
            descriptionClean: (j.description as string) ?? '',
            jobUrl: (j.sourceUrl as string) ?? '',
            sourceType: (j.sourceType as string) ?? 'manual_entry',
            sourceLabel: (j.sourceLabel as string) ?? '',
            postedAt: j.datePosted ? new Date(j.datePosted as string) : null,
            discoveredAt: j.dateFound ? new Date(j.dateFound as string) : new Date(),
            normalizedKey: nkey,
            status: (j.status as string) ?? 'new',
            notes: (j.notes as string) ?? '',
            tagsJson: JSON.stringify(j.tags ?? []),
            isActive: true,
          },
        })

        await prisma.jobMatch.create({
          data: {
            jobPostingId: newJob.id,
            fitScore: (j.score as number) ?? sr?.total ?? 0,
            fitLabel: fitLabel((j.score as number) ?? sr?.total ?? 0),
            scoreBreakdownJson: sr ? JSON.stringify(sr.breakdown) : '{}',
            matchingReasonsJson: JSON.stringify(j.strengths ?? sr?.strengths ?? []),
            concernsJson: JSON.stringify(j.concerns ?? sr?.concerns ?? []),
            redFlagsJson: JSON.stringify(j.redFlags ?? sr?.redFlags ?? []),
            fitSummary: (j.fitSummary as string) ?? sr?.fitSummary ?? '',
            insightSnippet: (j.insightSnippet as string) ?? sr?.insightSnippet ?? '',
            strengthsJson: JSON.stringify(j.strengths ?? sr?.strengths ?? []),
          },
        })

        if (j.notes && typeof j.notes === 'string' && j.notes.trim()) {
          await prisma.jobNote.create({
            data: { jobPostingId: newJob.id, content: j.notes, noteType: 'general' },
          })
        }
        stats.jobs++
      }
    }

    // Import resumes
    if (Array.isArray(importData.resumes)) {
      for (const r of importData.resumes as Array<Record<string, unknown>>) {
        await prisma.resume.create({
          data: {
            userId: req.userId,
            title: (r.title as string) ?? 'Imported Resume',
            rawText: (r.rawText as string) ?? '',
            isBaseResume: (r.isBaseResume as boolean) ?? false,
          },
        })
        stats.resumes++
      }
    }

    res.json({ ok: true, imported: stats })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

export default router
