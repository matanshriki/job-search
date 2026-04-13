import prisma from '../db/client'
import { callAi } from '../services/aiService'
import { buildOutreachMessages } from '../prompts/outreach'
import { buildProfileFromDb } from '../utils/profileHelpers'
import { resolveJobOwnerUserId } from '../utils/jobOwner'
import type { OutreachOutput } from '../prompts/outreach'

export async function runOutreachAgent(
  jobPostingId: number,
  userId?: number,
): Promise<{ assetId: number; output: OutreachOutput }> {
  const job = await prisma.jobPosting.findUnique({ where: { id: jobPostingId } })
  if (!job) throw new Error(`Job posting ${jobPostingId} not found`)

  const ownerId = await resolveJobOwnerUserId(jobPostingId, userId)
  if (ownerId == null) throw new Error('Job has no owning company')

  const profileRow = await prisma.profile.findFirst({ where: { userId: ownerId } })
  if (!profileRow) throw new Error('No profile found')

  const profile = buildProfileFromDb(profileRow)
  const baseResume = await prisma.resume.findFirst({
    where: { userId: ownerId, isBaseResume: true },
  })

  const companyName = job.companyId
    ? (await prisma.targetCompany.findUnique({ where: { id: job.companyId } }))?.name ?? ''
    : ''

  const agentRun = await prisma.agentRun.create({
    data: {
      jobPostingId,
      agentType: 'outreach',
      status: 'running',
      inputJson: JSON.stringify({ jobPostingId }),
      startedAt: new Date(),
    },
  })

  try {
    const messages = buildOutreachMessages({
      jobTitle: job.title,
      jobCompany: companyName,
      jobLocation: job.location,
      jobDescription: job.descriptionClean || job.descriptionRaw,
      profile,
      resumeText: baseResume?.rawText,
    })

    const aiResponse = await callAi(messages, 'outreach_message', 2000)
    const output = JSON.parse(aiResponse.content) as OutreachOutput

    const existing = await prisma.generatedAsset.findFirst({
      where: { jobPostingId, assetType: 'outreach_message' },
      orderBy: { version: 'desc' },
    })

    const asset = await prisma.generatedAsset.create({
      data: {
        jobPostingId,
        resumeId: baseResume?.id,
        assetType: 'outreach_message',
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
        action: 'outreach_generated',
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
