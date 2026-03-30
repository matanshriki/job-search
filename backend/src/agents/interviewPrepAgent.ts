import prisma from '../db/client'
import { callAi } from '../services/aiService'
import { buildInterviewPrepMessages } from '../prompts/interviewPrep'
import { buildProfileFromDb } from '../utils/profileHelpers'
import type { InterviewPrepOutput } from '../prompts/interviewPrep'

export async function runInterviewPrepAgent(
  jobPostingId: number,
): Promise<{ assetId: number; output: InterviewPrepOutput }> {
  const job = await prisma.jobPosting.findUnique({ where: { id: jobPostingId } })
  if (!job) throw new Error(`Job posting ${jobPostingId} not found`)

  const profileRow = await prisma.profile.findFirst()
  if (!profileRow) throw new Error('No profile found')

  const profile = buildProfileFromDb(profileRow)
  const baseResume = await prisma.resume.findFirst({ where: { isBaseResume: true } })
  const companyName = job.companyId
    ? (await prisma.targetCompany.findUnique({ where: { id: job.companyId } }))?.name ?? ''
    : ''

  const fitAsset = await prisma.generatedAsset.findFirst({
    where: { jobPostingId, assetType: 'fit_analysis' },
    orderBy: { version: 'desc' },
  })

  const agentRun = await prisma.agentRun.create({
    data: {
      jobPostingId,
      agentType: 'interview_prep',
      status: 'running',
      inputJson: JSON.stringify({ jobPostingId }),
      startedAt: new Date(),
    },
  })

  try {
    const messages = buildInterviewPrepMessages({
      jobTitle: job.title,
      jobCompany: companyName,
      jobLocation: job.location,
      jobDescription: job.descriptionClean || job.descriptionRaw,
      profile,
      resumeText: baseResume?.rawText,
      fitAnalysis: fitAsset?.content,
    })

    const aiResponse = await callAi(messages, 'interview_prep', 3000)
    const output = JSON.parse(aiResponse.content) as InterviewPrepOutput

    const existing = await prisma.generatedAsset.findFirst({
      where: { jobPostingId, assetType: 'interview_prep' },
      orderBy: { version: 'desc' },
    })

    const asset = await prisma.generatedAsset.create({
      data: {
        jobPostingId,
        resumeId: baseResume?.id,
        assetType: 'interview_prep',
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
        action: 'interview_prep_completed',
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
