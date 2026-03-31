/**
 * Scout Agent
 * Responsibilities:
 * - Scan active company sources
 * - Pull jobs from Greenhouse, generic HTML, or manual entry
 * - Normalize, deduplicate, and insert/update jobs
 * - Mark removed jobs inactive
 * - Trigger scoring
 */

import prisma from '../db/client'
import { scanCompanyCareerPage, jobDuplicateKey } from '../services/parsing/careerScanner'
import { scoreJobAgainstProfile, fitLabel } from '../services/scoring/matchEngine'
import { buildProfileFromDb } from '../utils/profileHelpers'

export interface ScoutAgentResult {
  companyId: number
  companyName: string
  scanRunId: number
  jobsFound: number
  jobsCreated: number
  jobsUpdated: number
  success: boolean
  message: string
  warnings: string[]
}

export async function runScoutAgentForCompany(companyId: number): Promise<ScoutAgentResult> {
  const company = await prisma.targetCompany.findUnique({
    where: { id: companyId },
    include: { sources: { where: { active: true } } },
  })

  if (!company) {
    throw new Error(`Company ${companyId} not found`)
  }

  const careersUrl = company.careersUrl
  if (!careersUrl) {
    return {
      companyId,
      companyName: company.name,
      scanRunId: 0,
      jobsFound: 0,
      jobsCreated: 0,
      jobsUpdated: 0,
      success: false,
      message: 'No career page URL configured for this company.',
      warnings: [],
    }
  }

  // Create scan run record
  const scanRun = await prisma.scanRun.create({
    data: {
      companyId,
      status: 'running',
      startedAt: new Date(),
    },
  })

  try {
    // Load profile for scoring
    const profileRow = await prisma.profile.findFirst()
    const profile = profileRow ? buildProfileFromDb(profileRow) : getDefaultProfile()

    // Run scanner
    const result = await scanCompanyCareerPage({
      careerPageUrl: careersUrl,
      companyName: company.name,
    })

    // Get existing job keys for this company
    const existingJobs = await prisma.jobPosting.findMany({
      where: { companyId },
      select: { id: true, normalizedKey: true, title: true, isActive: true },
    })
    const existingKeyMap = new Map(existingJobs.map((j) => [j.normalizedKey, j]))

    let jobsCreated = 0
    let jobsUpdated = 0
    const foundKeys = new Set<string>()
    // Track keys created during this scan to prevent inserting the same title twice
    // when the parser returns duplicates (e.g., the same nav link in multiple page sections)
    const createdThisScan = new Set<string>()

    for (const draft of result.jobs) {
      const key = draft.normalizedKey || jobDuplicateKey(draft.company, draft.title, draft.location)
      foundKeys.add(key)

      // Skip if already handled in this scan pass
      if (createdThisScan.has(key)) continue

      const existing = existingKeyMap.get(key)
      const scoreResult = scoreJobAgainstProfile(
        {
          title: draft.title,
          company: draft.company,
          location: draft.location,
          description: draft.description,
        },
        profile,
      )

      if (existing) {
        // Update if re-activated or update score
        if (!existing.isActive) {
          await prisma.jobPosting.update({
            where: { id: existing.id },
            data: { isActive: true, updatedAt: new Date() },
          })
          jobsUpdated++
        }

        // Upsert match
        await prisma.jobMatch.upsert({
          where: { jobPostingId: existing.id },
          create: {
            jobPostingId: existing.id,
            fitScore: scoreResult.total,
            fitLabel: fitLabel(scoreResult.total),
            scoreBreakdownJson: JSON.stringify(scoreResult.breakdown),
            matchingReasonsJson: JSON.stringify(scoreResult.strengths),
            concernsJson: JSON.stringify(scoreResult.concerns),
            redFlagsJson: JSON.stringify(scoreResult.redFlags),
            fitSummary: scoreResult.fitSummary,
            insightSnippet: scoreResult.insightSnippet,
            strengthsJson: JSON.stringify(scoreResult.strengths),
          },
          update: {
            fitScore: scoreResult.total,
            fitLabel: fitLabel(scoreResult.total),
            scoreBreakdownJson: JSON.stringify(scoreResult.breakdown),
            matchingReasonsJson: JSON.stringify(scoreResult.strengths),
            concernsJson: JSON.stringify(scoreResult.concerns),
            redFlagsJson: JSON.stringify(scoreResult.redFlags),
            fitSummary: scoreResult.fitSummary,
            insightSnippet: scoreResult.insightSnippet,
            strengthsJson: JSON.stringify(scoreResult.strengths),
            updatedAt: new Date(),
          },
        })
      } else {
        // Create new job posting
        const newJob = await prisma.jobPosting.create({
          data: {
            companyId,
            title: draft.title,
            location: draft.location,
            department: draft.department ?? '',
            employmentType: draft.employmentType ?? '',
            descriptionRaw: draft.description,
            descriptionClean: draft.description,
            jobUrl: draft.sourceUrl,
            sourceType: draft.sourceType,
            sourceProvider: draft.sourceType,
            sourceLabel: draft.sourceLabel,
            postedAt: draft.datePosted ? new Date(draft.datePosted) : null,
            normalizedKey: key,
            hashSignature: key,
            isActive: true,
            status: 'new',
          },
        })

        // Create match record
        await prisma.jobMatch.create({
          data: {
            jobPostingId: newJob.id,
            fitScore: scoreResult.total,
            fitLabel: fitLabel(scoreResult.total),
            scoreBreakdownJson: JSON.stringify(scoreResult.breakdown),
            matchingReasonsJson: JSON.stringify(scoreResult.strengths),
            concernsJson: JSON.stringify(scoreResult.concerns),
            redFlagsJson: JSON.stringify(scoreResult.redFlags),
            fitSummary: scoreResult.fitSummary,
            insightSnippet: scoreResult.insightSnippet,
            strengthsJson: JSON.stringify(scoreResult.strengths),
          },
        })

        // Log activity
        await prisma.activityLog.create({
          data: {
            entityType: 'job_posting',
            entityId: String(newJob.id),
            action: 'created',
            metadataJson: JSON.stringify({ source: 'scout_agent', companyId }),
            jobPostingId: newJob.id,
          },
        })

        // Create notification for high-fit jobs
        if (scoreResult.total >= 70) {
          await prisma.notification.create({
            data: {
              jobPostingId: newJob.id,
              channel: 'in_app',
              message: `New high-fit role (${scoreResult.total}/100): ${draft.title} at ${company.name}`,
              status: 'unread',
            },
          })
        }

        createdThisScan.add(key)
        jobsCreated++
      }
    }

    // Mark jobs that were not found this scan as inactive
    let jobsMarkedInactive = 0
    for (const existing of existingJobs) {
      if (existing.isActive && !foundKeys.has(existing.normalizedKey)) {
        await prisma.jobPosting.update({
          where: { id: existing.id },
          data: { isActive: false },
        })
        jobsMarkedInactive++
      }
    }

    // Complete scan run
    await prisma.scanRun.update({
      where: { id: scanRun.id },
      data: {
        status: 'completed',
        jobsFound: result.jobs.length,
        jobsCreated,
        jobsUpdated,
        jobsMarkedInactive,
        method: result.method,
        message: result.message,
        completedAt: new Date(),
      },
    })

    // Update company lastScan metadata via activity log
    await prisma.activityLog.create({
      data: {
        entityType: 'company',
        entityId: String(companyId),
        action: 'scanned',
        metadataJson: JSON.stringify({
          jobsFound: result.jobs.length,
          jobsCreated,
          method: result.method,
        }),
      },
    })

    return {
      companyId,
      companyName: company.name,
      scanRunId: scanRun.id,
      jobsFound: result.jobs.length,
      jobsCreated,
      jobsUpdated,
      // Scan ran successfully even if it found 0 jobs (JS-rendered page, etc.)
      // Only mark success: false for actual network/parse errors (ok: false from fetcher).
      success: true,
      message: result.message,
      warnings: result.warnings,
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    await prisma.scanRun.update({
      where: { id: scanRun.id },
      data: {
        status: 'failed',
        errorMessage,
        completedAt: new Date(),
      },
    })
    throw err
  }
}

export async function runScoutAgentForAllCompanies(): Promise<ScoutAgentResult[]> {
  const companies = await prisma.targetCompany.findMany({
    where: { active: true, careersUrl: { not: '' } },
  })

  const results: ScoutAgentResult[] = []
  for (const company of companies) {
    try {
      const result = await runScoutAgentForCompany(company.id)
      results.push(result)
    } catch (e) {
      results.push({
        companyId: company.id,
        companyName: company.name,
        scanRunId: 0,
        jobsFound: 0,
        jobsCreated: 0,
        jobsUpdated: 0,
        success: false,
        message: e instanceof Error ? e.message : String(e),
        warnings: [],
      })
    }
  }
  return results
}

function getDefaultProfile() {
  return {
    targetTitles: [],
    excludedTitles: [],
    targetSeniority: [] as never[],
    preferredFunctions: [],
    preferredIndustries: [],
    preferredGeographies: [],
    remotePreference: 'flexible' as const,
    idealCompanyStage: [],
    keywordsBoost: [],
    keywordsPenalize: [],
    compensationNotes: '',
    personalSummary: '',
  }
}
