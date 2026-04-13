/**
 * Pipeline Orchestrator
 *
 * Subscribes to the event bus and automatically chains agents based on
 * per-user AppSettings thresholds:
 *
 *   job.created (score >= fitAnalysisThreshold + autoPipelineEnabled)
 *     → runFitAnalystAgent
 *
 *   fit_analysis.completed (score >= autoQueueThreshold + autoPipelineEnabled)
 *     → runResumeTailorAgent + runOutreachAgent (in parallel)
 *     → create ApprovalQueueItem when both complete
 *
 * Call initPipelineOrchestrator() once at server startup.
 */

import prisma from '../db/client'
import { eventBus } from './eventBus'
import { runFitAnalystAgent } from '../agents/fitAnalystAgent'
import { runResumeTailorAgent } from '../agents/resumeTailorAgent'
import { runOutreachAgent } from '../agents/outreachAgent'

// ─── Settings helpers ─────────────────────────────────────────────────────────

interface PipelineSettings {
  autoPipelineEnabled: boolean
  fitAnalysisThreshold: number
  autoQueueThreshold: number
  autoPipelineActions: string[]
}

async function getPipelineSettings(userId: number): Promise<PipelineSettings> {
  const settings = await prisma.appSettings.findUnique({ where: { userId } })
  return {
    autoPipelineEnabled: settings?.autoPipelineEnabled ?? true,
    fitAnalysisThreshold: settings?.fitAnalysisThreshold ?? 55,
    autoQueueThreshold: settings?.autoQueueThreshold ?? 80,
    autoPipelineActions: JSON.parse(
      settings?.autoPipelineActionsJson ?? '["fit_analysis","resume_tailoring","outreach"]',
    ) as string[],
  }
}

// ─── Queue item creation ──────────────────────────────────────────────────────

async function createApprovalQueueItem(
  userId: number,
  jobPostingId: number,
  fitSummary: string,
  outreachContent: string,
  resumeContent: string,
  fitScore: number,
): Promise<void> {
  // Avoid duplicate pending items for the same job
  const existing = await prisma.approvalQueueItem.findFirst({
    where: { userId, jobPostingId, status: 'pending_review' },
  })
  if (existing) return

  const job = await prisma.jobPosting.findUnique({
    where: { id: jobPostingId },
    include: { company: { select: { name: true } } },
  })

  await prisma.approvalQueueItem.create({
    data: {
      userId,
      jobPostingId,
      actionType: 'send_outreach',
      status: 'pending_review',
      payloadJson: JSON.stringify({
        fitScore,
        fitSummary,
        jobTitle: job?.title ?? '',
        company: job?.company?.name ?? '',
        jobUrl: job?.jobUrl ?? '',
        outreachDraft: outreachContent,
        resumeBullets: resumeContent,
      }),
    },
  })

  await prisma.notification.create({
    data: {
      jobPostingId,
      channel: 'in_app',
      message: `Application package ready for review: ${job?.title ?? 'Unknown role'} at ${job?.company?.name ?? 'Unknown company'}`,
      status: 'unread',
    },
  })

  console.log(`[pipeline] Created approval queue item for job ${jobPostingId}`)
}

// ─── Event handlers ───────────────────────────────────────────────────────────

async function handleJobCreated(payload: { jobPostingId: number; fitScore: number; userId: number }): Promise<void> {
  const { jobPostingId, fitScore, userId } = payload

  const settings = await getPipelineSettings(userId)
  if (!settings.autoPipelineEnabled) return
  if (!settings.autoPipelineActions.includes('fit_analysis')) return
  if (fitScore < settings.fitAnalysisThreshold) return

  // Avoid double-running if a fit_analysis asset already exists
  const alreadyRan = await prisma.generatedAsset.findFirst({
    where: { jobPostingId, assetType: 'fit_analysis' },
  })
  if (alreadyRan) return

  console.log(`[pipeline] job.created → running fit analysis for job ${jobPostingId} (score ${fitScore})`)

  try {
    await runFitAnalystAgent(jobPostingId, userId)
  } catch (err) {
    console.error(`[pipeline] fit analysis failed for job ${jobPostingId}:`, err)
  }
}

async function handleFitAnalysisCompleted(payload: {
  jobPostingId: number
  fitScore: number
  fitLabel: string
  userId: number
  fitSummary?: string
}): Promise<void> {
  const { jobPostingId, fitScore, userId, fitSummary = '' } = payload

  const settings = await getPipelineSettings(userId)
  if (!settings.autoPipelineEnabled) return
  if (fitScore < settings.autoQueueThreshold) return

  const needsResume = settings.autoPipelineActions.includes('resume_tailoring')
  const needsOutreach = settings.autoPipelineActions.includes('outreach')
  if (!needsResume && !needsOutreach) return

  console.log(`[pipeline] fit_analysis.completed → fanning out for job ${jobPostingId} (score ${fitScore})`)

  let outreachContent = ''
  let resumeContent = ''

  const tasks: Promise<void>[] = []

  if (needsResume) {
    tasks.push(
      runResumeTailorAgent(jobPostingId, undefined, userId)
        .then((r) => { resumeContent = r.output ? JSON.stringify(r.output) : '' })
        .catch((err) => { console.error(`[pipeline] resume tailor failed for job ${jobPostingId}:`, err) }),
    )
  }

  if (needsOutreach) {
    tasks.push(
      runOutreachAgent(jobPostingId, userId)
        .then((r) => { outreachContent = r.output ? JSON.stringify(r.output) : '' })
        .catch((err) => { console.error(`[pipeline] outreach failed for job ${jobPostingId}:`, err) }),
    )
  }

  await Promise.all(tasks)

  await createApprovalQueueItem(userId, jobPostingId, fitSummary, outreachContent, resumeContent, fitScore)
}

// ─── Initialiser ─────────────────────────────────────────────────────────────

let initialised = false

export function initPipelineOrchestrator(): void {
  if (initialised) return
  initialised = true

  eventBus.on('job.created', (payload) => {
    // Fire-and-forget; errors are caught inside
    handleJobCreated(payload).catch((err) =>
      console.error('[pipeline] handleJobCreated error:', err),
    )
  })

  eventBus.on('fit_analysis.completed', (payload) => {
    handleFitAnalysisCompleted(payload).catch((err) =>
      console.error('[pipeline] handleFitAnalysisCompleted error:', err),
    )
  })

  console.log('[pipeline] Orchestrator initialised')
}
