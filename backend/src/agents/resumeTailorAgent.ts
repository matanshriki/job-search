/**
 * Resume Tailor Agent
 * Produces tailored summary, prioritized bullets, and suggested edits for a specific role.
 * Does NOT overwrite the base resume.
 */

import prisma from '../db/client'
import { callAi } from '../services/aiService'
import { buildResumeTailoringMessages } from '../prompts/resumeTailoring'
import { buildProfileFromDb } from '../utils/profileHelpers'
import { resolveJobOwnerUserId } from '../utils/jobOwner'
import type { ResumeTailoringOutput } from '../prompts/resumeTailoring'

export async function runResumeTailorAgent(
  jobPostingId: number,
  resumeId?: number,
  userId?: number,
): Promise<{ assetId: number; output: ResumeTailoringOutput }> {
  const job = await prisma.jobPosting.findUnique({ where: { id: jobPostingId } })
  if (!job) throw new Error(`Job posting ${jobPostingId} not found`)

  const ownerId = await resolveJobOwnerUserId(jobPostingId, userId)
  if (ownerId == null) throw new Error('Job has no owning company')

  const profileRow = await prisma.profile.findFirst({ where: { userId: ownerId } })
  if (!profileRow) throw new Error('No profile found')

  const profile = buildProfileFromDb(profileRow)

  const resume = resumeId
    ? await prisma.resume.findFirst({ where: { id: resumeId, userId: ownerId } })
    : await prisma.resume.findFirst({ where: { userId: ownerId, isBaseResume: true } })

  if (!resume?.rawText) {
    throw new Error('No resume with text found. Add a resume in the Resume Library first.')
  }

  // Get existing fit analysis if available
  const fitAsset = await prisma.generatedAsset.findFirst({
    where: { jobPostingId, assetType: 'fit_analysis' },
    orderBy: { version: 'desc' },
  })

  const agentRun = await prisma.agentRun.create({
    data: {
      jobPostingId,
      agentType: 'resume_tailor',
      status: 'running',
      inputJson: JSON.stringify({ jobPostingId, resumeId: resume.id }),
      startedAt: new Date(),
    },
  })

  try {
    const messages = buildResumeTailoringMessages({
      jobTitle: job.title,
      jobCompany: job.companyId
        ? (await prisma.targetCompany.findUnique({ where: { id: job.companyId } }))?.name ?? ''
        : '',
      jobDescription: job.descriptionClean || job.descriptionRaw,
      profile,
      baseResumeText: resume.rawText,
      fitAnalysis: fitAsset?.content,
    })

    const aiResponse = await callAi(messages, 'resume_tailoring', 2000)
    const output = JSON.parse(aiResponse.content) as ResumeTailoringOutput

    const existing = await prisma.generatedAsset.findFirst({
      where: { jobPostingId, assetType: 'resume_tailoring' },
      orderBy: { version: 'desc' },
    })

    const asset = await prisma.generatedAsset.create({
      data: {
        jobPostingId,
        resumeId: resume.id,
        assetType: 'resume_tailoring',
        content: aiResponse.content,
        version: (existing?.version ?? 0) + 1,
        modelName: aiResponse.modelUsed,
      },
    })

    await prisma.agentRun.update({
      where: { id: agentRun.id },
      data: { status: 'completed', outputJson: aiResponse.content, completedAt: new Date() },
    })

    await prisma.activityLog.create({
      data: {
        entityType: 'job_posting',
        entityId: String(jobPostingId),
        action: 'resume_tailoring_completed',
        metadataJson: JSON.stringify({ assetId: asset.id }),
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
