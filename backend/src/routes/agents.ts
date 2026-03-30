import { Router } from 'express'
import prisma from '../db/client'
import { runScoutAgentForAllCompanies } from '../agents/scoutAgent'
import { isAiEnabled } from '../services/aiService'

const router = Router()

// GET /api/agents/runs
router.get('/runs', async (req, res) => {
  try {
    const { agentType, status, limit = '50' } = req.query as Record<string, string>
    const where: Record<string, unknown> = {}
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
    const where: Record<string, unknown> = {}
    if (companyId) where.companyId = parseInt(companyId, 10)
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
router.post('/scan-all', async (_req, res) => {
  try {
    const results = await runScoutAgentForAllCompanies()
    res.json({ ok: true, results })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// GET /api/agents/status
router.get('/status', async (_req, res) => {
  try {
    const [totalRuns, failedRuns, pendingRuns, recentRuns] = await Promise.all([
      prisma.agentRun.count(),
      prisma.agentRun.count({ where: { status: 'failed' } }),
      prisma.agentRun.count({ where: { status: 'running' } }),
      prisma.agentRun.findMany({
        orderBy: { startedAt: 'desc' },
        take: 10,
        include: { jobPosting: { select: { id: true, title: true } } },
      }),
    ])
    res.json({
      ok: true,
      aiEnabled: isAiEnabled(),
      totalRuns,
      failedRuns,
      pendingRuns,
      recentRuns,
    })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

// GET /api/agents/assets
router.get('/assets', async (req, res) => {
  try {
    const { assetType, limit = '50' } = req.query as Record<string, string>
    const where: Record<string, unknown> = {}
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
router.get('/settings', async (_req, res) => {
  try {
    let settings = await prisma.appSettings.findFirst()
    if (!settings) settings = await prisma.appSettings.create({ data: {} })
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
    } = req.body as {
      minRelevantScore?: number; autoScanIntervalHours?: number
      autoRunFitAnalysis?: boolean; fitAnalysisThreshold?: number
      jobsFeedJson?: string; savedJobViewsJson?: string
    }
    let settings = await prisma.appSettings.findFirst()
    const data: Record<string, unknown> = {}
    if (minRelevantScore !== undefined) data.minRelevantScore = minRelevantScore
    if (autoScanIntervalHours !== undefined) data.autoScanIntervalHours = autoScanIntervalHours
    if (autoRunFitAnalysis !== undefined) data.autoRunFitAnalysis = autoRunFitAnalysis
    if (fitAnalysisThreshold !== undefined) data.fitAnalysisThreshold = fitAnalysisThreshold
    if (jobsFeedJson !== undefined) data.jobsFeedJson = jobsFeedJson
    if (savedJobViewsJson !== undefined) data.savedJobViewsJson = savedJobViewsJson

    if (settings) {
      settings = await prisma.appSettings.update({ where: { id: settings.id }, data: data as never })
    } else {
      settings = await prisma.appSettings.create({ data: data as never })
    }
    res.json({ ok: true, settings })
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) })
  }
})

export default router
