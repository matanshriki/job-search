/**
 * Fit Analyst Agent
 * Produces AI-enriched fit analysis: fit label, summary, matching reasons, concerns, resume suggestions
 */

import prisma from '../db/client'
import { callAi } from '../services/aiService'
import { buildFitAnalysisMessages } from '../prompts/fitAnalysis'
import { buildProfileFromDb } from '../utils/profileHelpers'
import type { FitAnalysisOutput } from '../prompts/fitAnalysis'

export async function runFitAnalystAgent(jobPostingId: number): Promise<{ assetId: number; output: FitAnalysisOutput }> {
  const job = await prisma.jobPosting.findUnique({
    where: { id: jobPostingId },
    include: { match: true },
  })
  if (!job) throw new Error(`Job posting ${jobPostingId} not found`)

  const profileRow = await prisma.profile.findFirst()
  if (!profileRow) throw new Error('No profile found — set up your profile first')

  const profile = buildProfileFromDb(profileRow)
  const baseResume = await prisma.resume.findFirst({ where: { isBaseResume: true } })

  const agentRun = await prisma.agentRun.create({
    data: {
      jobPostingId,
      agentType: 'fit_analyst',
      status: 'running',
      inputJson: JSON.stringify({ jobPostingId }),
      startedAt: new Date(),
    },
  })

  try {
    const messages = buildFitAnalysisMessages({
      jobTitle: job.title,
      jobCompany: job.companyId ? (await prisma.targetCompany.findUnique({ where: { id: job.companyId } }))?.name ?? '' : '',
      jobLocation: job.location,
      jobDescription: job.descriptionClean || job.descriptionRaw,
      profile,
      resumeText: baseResume?.rawText,
      scoreBreakdown: job.match ? JSON.parse(job.match.scoreBreakdownJson) : undefined,
    })

    const aiResponse = await callAi(messages, 'fit_analysis', 2000)
    const output = JSON.parse(aiResponse.content) as FitAnalysisOutput

    // Upsert generated asset
    const existing = await prisma.generatedAsset.findFirst({
      where: { jobPostingId, assetType: 'fit_analysis' },
      orderBy: { version: 'desc' },
    })

    const asset = await prisma.generatedAsset.create({
      data: {
        jobPostingId,
        resumeId: baseResume?.id,
        assetType: 'fit_analysis',
        content: aiResponse.content,
        version: (existing?.version ?? 0) + 1,
        modelName: aiResponse.modelUsed,
      },
    })

    // Update job match with AI-enriched data
    if (job.match) {
      await prisma.jobMatch.update({
        where: { jobPostingId },
        data: {
          fitLabel: output.fitLabel,
          matchingReasonsJson: JSON.stringify(output.matchingReasons),
          concernsJson: JSON.stringify(output.concerns),
          fitSummary: output.fitSummary,
          recommendedResumePointsJson: JSON.stringify(output.recommendedResumePoints),
          updatedAt: new Date(),
        },
      })
    }

    await prisma.agentRun.update({
      where: { id: agentRun.id },
      data: {
        status: 'completed',
        outputJson: aiResponse.content,
        completedAt: new Date(),
      },
    })

    await prisma.activityLog.create({
      data: {
        entityType: 'job_posting',
        entityId: String(jobPostingId),
        action: 'fit_analysis_completed',
        metadataJson: JSON.stringify({ assetId: asset.id, fitLabel: output.fitLabel }),
        jobPostingId,
      },
    })

    return { assetId: asset.id, output }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    await prisma.agentRun.update({
      where: { id: agentRun.id },
      data: { status: 'failed', errorMessage, completedAt: new Date() },
    })
    throw err
  }
}
