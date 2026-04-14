import { Router } from 'express'
import prisma from '../db/client'
import { requireAuth } from '../middleware/auth'
import { runScoutAgentForAllCompanies } from '../agents/scoutAgent'
import { runCompanyDiscoveryAgent } from '../agents/companyDiscoveryAgent'
import { isAiEnabled, callAi } from '../services/aiService'

const router = Router()
router.use(requireAuth)

async function getUserCompanyIds(userId: number): Promise<number[]> {
  const companies = await prisma.targetCompany.findMany({ where: { userId }, select: { id: true } })
  return companies.map((c) => c.id)
}

// GET /api/agents/runs
router.get('/runs', async (req, res) => {
  try {
    const { agentType, status, limit = '50' } = req.query as Record<string, string>
    const where: Record<string, unknown> = {
      jobPosting: { userId: req.userId },
    }
    if (agentType) where.agentType = agentType
    if (status) where.status = status
    const runs = await prisma.agentRun.findMany({
      where: where as never,
      include: { jobPosting: { select: { id: true, title: true } } },
      orderBy: { startedAt: 'desc' },
      take: parseInt(limit, 10),
    })
    res.json({ ok: true, runs })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// GET /api/agents/scan-runs
router.get('/scan-runs', async (req, res) => {
  try {
    const { companyId, status, limit = '50' } = req.query as Record<string, string>
    const userCompanyIds = await getUserCompanyIds(req.userId)
    const where: Record<string, unknown> = { companyId: { in: userCompanyIds } }
    if (companyId) {
      const requestedId = parseInt(companyId, 10)
      if (userCompanyIds.includes(requestedId)) where.companyId = requestedId
    }
    if (status) where.status = status
    const runs = await prisma.scanRun.findMany({
      where: where as never,
      include: { company: { select: { id: true, name: true } } },
      orderBy: { startedAt: 'desc' },
      take: parseInt(limit, 10),
    })
    res.json({ ok: true, runs })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// POST /api/agents/scan-all
router.post('/scan-all', async (req, res) => {
  try {
    const results = await runScoutAgentForAllCompanies(req.userId)
    res.json({ ok: true, results })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// POST /api/agents/discover-companies
router.post('/discover-companies', async (req, res) => {
  try {
    const result = await runCompanyDiscoveryAgent(req.userId)
    res.json({ ok: true, ...result })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// POST /api/agents/infer-careers-url — AI-infers a company's ATS careers URL from the name
router.post('/infer-careers-url', async (req, res) => {
  try {
    const { companyName } = req.body as { companyName?: string }
    if (!companyName?.trim()) {
      return res.status(400).json({ ok: false, error: 'companyName is required' })
    }

    const messages = [
      {
        role: 'system' as const,
        content:
          'You are a recruiting researcher. Given a company name, return the most likely direct careers/jobs URL. ' +
          'Prefer ATS board URLs (Greenhouse, Lever, Ashby, Workable) over generic /careers pages. ' +
          'Return ONLY valid JSON — no markdown, no extra text.',
      },
      {
        role: 'user' as const,
        content: [
          `Find the careers page URL for: "${companyName.trim()}"`,
          '',
          'ATS URL patterns to prefer:',
          '- Greenhouse: https://boards.greenhouse.io/{board-token}',
          '- Lever: https://jobs.lever.co/{company-slug}',
          '- Ashby: https://jobs.ashbyhq.com/{company-slug}',
          '- Workable: https://apply.workable.com/{company-slug}',
          '',
          'Return:',
          '{',
          '  "careersUrl": "https://...",',
          '  "atsProvider": "greenhouse" | "lever" | "ashby" | "workable" | "other",',
          '  "companyDomain": "company.com",',
          '  "confidence": "high" | "medium" | "low"',
          '}',
        ].join('\n'),
      },
    ]

    const response = await callAi(messages, undefined, 400)

    if (response.modelUsed === 'mock') {
      return res.status(503).json({ ok: false, error: 'AI not configured. Add OPENAI_API_KEY to use URL inference.' })
    }

    const result = JSON.parse(response.content) as {
      careersUrl: string
      atsProvider: string
      companyDomain: string
      confidence: string
    }

    res.json({ ok: true, ...result })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// GET /api/agents/status
router.get('/status', async (req, res) => {
  try {
    const jobsWhere = { userId: req.userId }
    const [totalRuns, failedRuns, pendingRuns, recentRuns] = await Promise.all([
      prisma.agentRun.count({ where: { jobPosting: jobsWhere } }),
      prisma.agentRun.count({ where: { jobPosting: jobsWhere, status: 'failed' } }),
      prisma.agentRun.count({ where: { jobPosting: jobsWhere, status: 'running' } }),
      prisma.agentRun.findMany({
        where: { jobPosting: jobsWhere },
        orderBy: { startedAt: 'desc' },
        take: 10,
        include: { jobPosting: { select: { id: true, title: true } } },
      }),
    ])
    res.json({ ok: true, aiEnabled: isAiEnabled(), totalRuns, failedRuns, pendingRuns, recentRuns })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// GET /api/agents/assets
router.get('/assets', async (req, res) => {
  try {
    const { assetType, limit = '50' } = req.query as Record<string, string>
    const where: Record<string, unknown> = { jobPosting: { userId: req.userId } }
    if (assetType) where.assetType = assetType
    const assets = await prisma.generatedAsset.findMany({
      where: where as never,
      include: { jobPosting: { select: { id: true, title: true, companyId: true } } },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit, 10),
    })
    res.json({ ok: true, assets })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// GET /api/agents/settings
router.get('/settings', async (req, res) => {
  try {
    let settings = await prisma.appSettings.findUnique({ where: { userId: req.userId } })
    if (!settings) {
      settings = await prisma.appSettings.create({
        data: {
          userId: req.userId,
          minRelevantScore: 55,
          autoScanIntervalHours: 6,
          autoRunFitAnalysis: true,
          fitAnalysisThreshold: 55,
          autoPipelineEnabled: true,
          autoQueueThreshold: 80,
          autoPipelineActionsJson: '["fit_analysis","resume_tailoring","outreach"]',
        },
      })
    }
    res.json({ ok: true, settings })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// PUT /api/agents/settings
router.put('/settings', async (req, res) => {
  try {
    const {
      minRelevantScore, autoScanIntervalHours, autoRunFitAnalysis, fitAnalysisThreshold,
      jobsFeedJson, savedJobViewsJson,
      autoPipelineEnabled, autoQueueThreshold, autoPipelineActionsJson,
    } = req.body as {
      minRelevantScore?: number; autoScanIntervalHours?: number
      autoRunFitAnalysis?: boolean; fitAnalysisThreshold?: number
      jobsFeedJson?: string; savedJobViewsJson?: string
      autoPipelineEnabled?: boolean; autoQueueThreshold?: number; autoPipelineActionsJson?: string
    }
    const data: Record<string, unknown> = {}
    if (minRelevantScore !== undefined) data.minRelevantScore = minRelevantScore
    if (autoScanIntervalHours !== undefined) data.autoScanIntervalHours = autoScanIntervalHours
    if (autoRunFitAnalysis !== undefined) data.autoRunFitAnalysis = autoRunFitAnalysis
    if (fitAnalysisThreshold !== undefined) data.fitAnalysisThreshold = fitAnalysisThreshold
    if (jobsFeedJson !== undefined) data.jobsFeedJson = jobsFeedJson
    if (savedJobViewsJson !== undefined) data.savedJobViewsJson = savedJobViewsJson
    if (autoPipelineEnabled !== undefined) data.autoPipelineEnabled = autoPipelineEnabled
    if (autoQueueThreshold !== undefined) data.autoQueueThreshold = autoQueueThreshold
    if (autoPipelineActionsJson !== undefined) data.autoPipelineActionsJson = autoPipelineActionsJson

    const createData = { userId: req.userId, ...data }
    const settings = await prisma.appSettings.upsert({
      where: { userId: req.userId },
      create: createData as never,
      update: data as never,
    })
    res.json({ ok: true, settings })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

export default router
