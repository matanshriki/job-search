#!/usr/bin/env tsx
/**
 * Migration utility: imports the old localStorage-based JSON export
 * (from the frontend app) into the new SQLite database.
 *
 * Usage:
 *   tsx src/utils/migrate.ts <path-to-export.json>
 *   (or pipe) cat export.json | tsx src/utils/migrate.ts
 */

import { readFileSync } from 'fs'
import prisma from '../db/client'
import { fitLabel, scoreJobAgainstProfile } from '../services/scoring/matchEngine'
import type { SearchProfile, SeniorityLevel } from '../services/scoring/matchEngine'

// Shape of the old localStorage export
interface LegacyAppData {
  version?: number
  profile?: {
    targetTitles?: string[]
    excludedTitles?: string[]
    targetSeniority?: string[]
    preferredFunctions?: string[]
    preferredIndustries?: string[]
    preferredGeographies?: string[]
    remotePreference?: string
    idealCompanyStage?: string[]
    keywordsBoost?: string[]
    keywordsPenalize?: string[]
    compensationNotes?: string
    personalSummary?: string
  }
  companies?: Array<{
    id: string
    name: string
    website?: string
    careerPageUrl?: string
    notes?: string
    priority?: string
    createdAt?: string
    lastScanAt?: string | null
    jobsFoundCount?: number
  }>
  jobs?: Array<{
    id: string
    title: string
    company: string
    location: string
    department?: string | null
    employmentType?: string | null
    description: string
    sourceType?: string
    sourceLabel?: string
    sourceUrl?: string
    dateFound: string
    datePosted?: string | null
    score?: number
    fitSummary?: string
    strengths?: string[]
    concerns?: string[]
    status?: string
    notes?: string
    tags?: string[]
    normalizedKey?: string
    companyId?: string | null
    insightSnippet?: string
    redFlags?: string[]
  }>
  scanHistory?: Array<{
    id: string
    companyId: string
    companyName: string
    at: string
    outcome: string
    message: string
    jobsFound: number
    method: string
  }>
}

async function main() {
  const args = process.argv.slice(2)

  // --user-id <n> assigns imported data to a specific user (defaults to 1)
  const userIdFlag = args.indexOf('--user-id')
  const userId = userIdFlag !== -1 ? parseInt(args[userIdFlag + 1], 10) : 1
  const fileArgs = args.filter((_, i) => i !== userIdFlag && i !== userIdFlag + 1)

  console.log(`  Importing data for userId=${userId}`)

  let rawJson: string

  if (fileArgs[0]) {
    rawJson = readFileSync(fileArgs[0], 'utf-8')
  } else {
    // Try reading from stdin
    process.stdout.write('Reading from stdin...\n')
    const chunks: Buffer[] = []
    for await (const chunk of process.stdin) {
      chunks.push(chunk as Buffer)
    }
    rawJson = Buffer.concat(chunks).toString('utf-8')
  }

  let data: LegacyAppData
  try {
    data = JSON.parse(rawJson)
  } catch (e) {
    console.error('Failed to parse JSON:', e)
    process.exit(1)
  }

  console.log(`\nImporting legacy data (v${data.version ?? 'unknown'})...`)

  // 1. Migrate profile
  if (data.profile) {
    const p = data.profile
    const profileData = {
      preferredTitlesJson: JSON.stringify(p.targetTitles ?? []),
      excludedTitlesJson: JSON.stringify(p.excludedTitles ?? []),
      seniorityLevel: JSON.stringify(p.targetSeniority ?? []),
      preferredFunctionsJson: JSON.stringify(p.preferredFunctions ?? []),
      preferredIndustriesJson: JSON.stringify(p.preferredIndustries ?? []),
      preferredLocationsJson: JSON.stringify(p.preferredGeographies ?? []),
      remotePreference: p.remotePreference ?? 'flexible',
      idealCompanyStageJson: JSON.stringify(p.idealCompanyStage ?? []),
      targetKeywordsJson: JSON.stringify(p.keywordsBoost ?? []),
      excludedKeywordsJson: JSON.stringify(p.keywordsPenalize ?? []),
      compensationNotes: p.compensationNotes ?? '',
      summary: p.personalSummary ?? '',
    }

    const existing = await prisma.profile.findFirst({ where: { userId } })
    if (existing) {
      await prisma.profile.update({ where: { id: existing.id }, data: profileData })
      console.log('  ✓ Profile updated')
    } else {
      await prisma.profile.create({ data: { userId, ...profileData } })
      console.log('  ✓ Profile created')
    }
  }

  // Build profile for scoring
  const profileRow = await prisma.profile.findFirst({ where: { userId } })
  const scoringProfile: SearchProfile = profileRow
    ? buildProfileForScoring(profileRow)
    : buildDefaultProfile()

  // 2. Migrate companies
  const companyIdMap = new Map<string, number>() // old string id → new int id
  if (data.companies?.length) {
    for (const c of data.companies) {
      // Check if already exists by name
      const existing = await prisma.targetCompany.findFirst({
        where: { userId, name: c.name },
      })
      if (existing) {
        companyIdMap.set(c.id, existing.id)
        continue
      }
      const created = await prisma.targetCompany.create({
        data: {
          userId,
          name: c.name,
          companyDomain: c.website ?? '',
          careersUrl: c.careerPageUrl ?? '',
          priority: c.priority ?? 'medium',
          notes: c.notes ?? '',
          active: true,
          createdAt: c.createdAt ? new Date(c.createdAt) : new Date(),
        },
      })
      companyIdMap.set(c.id, created.id)

      // Add default source from career page url
      if (c.careerPageUrl) {
        await prisma.companySource.create({
          data: {
            companyId: created.id,
            sourceType: c.careerPageUrl.includes('greenhouse') ? 'greenhouse' : 'generic_html',
            sourceUrl: c.careerPageUrl,
            active: true,
          },
        })
      }
    }
    const newCount = [...companyIdMap.values()].length - (data.companies.length - [...companyIdMap.entries()].filter(([k]) => !data.companies?.find((c) => c.id === k && !companyIdMap.has(c.id))).length)
    console.log(`  ✓ ${data.companies.length} companies processed`)
  }

  // 3. Migrate scan history
  if (data.scanHistory?.length) {
    let scansMigrated = 0
    for (const scan of data.scanHistory) {
      const companyId = companyIdMap.get(scan.companyId)
      // Map legacy outcomes: 'success'→'completed', 'partial'→'partial', 'failed'→'failed'
      const status = scan.outcome === 'success' ? 'completed' : scan.outcome === 'failed' ? 'failed' : 'partial'
      await prisma.scanRun.create({
        data: {
          companyId: companyId ?? null,
          status,
          jobsFound: scan.jobsFound,
          jobsCreated: 0,
          jobsUpdated: 0,
          method: scan.method,
          message: scan.message,
          startedAt: new Date(scan.at),
          completedAt: new Date(scan.at),
        },
      })
      scansMigrated++
    }
    console.log(`  ✓ ${scansMigrated} scan history records migrated`)
  }

  // 4. Migrate jobs
  if (data.jobs?.length) {
    let jobsMigrated = 0
    let jobsSkipped = 0
    for (const j of data.jobs) {
      const companyId = j.companyId ? companyIdMap.get(j.companyId) ?? null : null

      // Check for duplicates by normalizedKey
      if (j.normalizedKey) {
        const existing = await prisma.jobPosting.findFirst({
          where: { normalizedKey: j.normalizedKey, userId },
        })
        if (existing) { jobsSkipped++; continue }
      }

      // Score the job
      const scoreResult = scoreJobAgainstProfile(
        {
          title: j.title,
          company: j.company,
          location: j.location,
          description: j.description,
        },
        scoringProfile,
      )

      // Notes stored on job posting — do NOT create a duplicate JobNote for the same text.
      // JobNotes are for structured timestamped entries added after discovery.
      const newJob = await prisma.jobPosting.create({
        data: {
          userId,
          companyId,
          title: j.title,
          location: j.location,
          department: j.department ?? '',
          employmentType: j.employmentType ?? '',
          descriptionRaw: j.description,
          descriptionClean: j.description,
          jobUrl: j.sourceUrl ?? '',
          sourceType: j.sourceType ?? 'manual_entry',
          sourceProvider: j.sourceType ?? 'manual_entry',
          sourceLabel: j.sourceLabel ?? '',
          postedAt: j.datePosted ? new Date(j.datePosted) : null,
          discoveredAt: new Date(j.dateFound),
          isActive: true,
          normalizedKey: j.normalizedKey ?? '',
          status: (j.status as string) ?? 'new',
          notes: j.notes ?? '',  // inline notes field preserved
          tagsJson: JSON.stringify(j.tags ?? []),
          createdAt: new Date(j.dateFound),
        },
      })

      await prisma.jobMatch.create({
        data: {
          jobPostingId: newJob.id,
          fitScore: j.score ?? scoreResult.total,
          fitLabel: fitLabel(j.score ?? scoreResult.total),
          scoreBreakdownJson: JSON.stringify(scoreResult.breakdown),
          matchingReasonsJson: JSON.stringify(j.strengths ?? scoreResult.strengths),
          concernsJson: JSON.stringify(j.concerns ?? scoreResult.concerns),
          redFlagsJson: JSON.stringify(j.redFlags ?? scoreResult.redFlags),
          fitSummary: j.fitSummary ?? scoreResult.fitSummary,
          insightSnippet: j.insightSnippet ?? scoreResult.insightSnippet,
          strengthsJson: JSON.stringify(j.strengths ?? scoreResult.strengths),
        },
      })

      jobsMigrated++
    }
    console.log(`  ✓ ${jobsMigrated} jobs migrated${jobsSkipped > 0 ? ` (${jobsSkipped} skipped as duplicates)` : ''}`)
  }

  console.log('\n✅ Migration complete!')
  await prisma.$disconnect()
}

function buildProfileForScoring(row: { preferredTitlesJson: string; excludedTitlesJson: string; seniorityLevel: string; preferredFunctionsJson: string; preferredIndustriesJson: string; preferredLocationsJson: string; remotePreference: string; idealCompanyStageJson: string; targetKeywordsJson: string; excludedKeywordsJson: string; compensationNotes: string; summary: string }): SearchProfile {
  function p<T>(s: string, d: T): T { try { return JSON.parse(s) } catch { return d } }
  return {
    targetTitles: p(row.preferredTitlesJson, []),
    excludedTitles: p(row.excludedTitlesJson, []),
    targetSeniority: p(row.seniorityLevel, []) as SeniorityLevel[],
    preferredFunctions: p(row.preferredFunctionsJson, []),
    preferredIndustries: p(row.preferredIndustriesJson, []),
    preferredGeographies: p(row.preferredLocationsJson, []),
    remotePreference: (row.remotePreference || 'flexible') as SearchProfile['remotePreference'],
    idealCompanyStage: p(row.idealCompanyStageJson, []),
    keywordsBoost: p(row.targetKeywordsJson, []),
    keywordsPenalize: p(row.excludedKeywordsJson, []),
    compensationNotes: row.compensationNotes,
    personalSummary: row.summary,
  }
}

function buildDefaultProfile(): SearchProfile {
  return {
    targetTitles: [],
    excludedTitles: [],
    targetSeniority: [],
    preferredFunctions: [],
    preferredIndustries: [],
    preferredGeographies: [],
    remotePreference: 'flexible',
    idealCompanyStage: [],
    keywordsBoost: [],
    keywordsPenalize: [],
    compensationNotes: '',
    personalSummary: '',
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
