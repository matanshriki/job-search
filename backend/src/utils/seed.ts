#!/usr/bin/env tsx
/**
 * Seeds the database with demo data for local development.
 * Run: npm run db:seed
 */

import prisma from '../db/client'
import { scoreJobAgainstProfile, fitLabel } from '../services/scoring/matchEngine'
import type { SearchProfile, SeniorityLevel } from '../services/scoring/matchEngine'

const demoProfile: SearchProfile = {
  targetTitles: [
    'Head of Professional Services',
    'VP Professional Services',
    'Director Professional Services',
    'Head of Partner Operations',
    'Director Partner Operations',
    'Head of Partner Enablement',
    'VP Partner Enablement',
    'Head of Services Strategy',
    'VP Customer Success',
    'Head of Customer Success Operations',
    'Head of Global Delivery',
    'Director of Services Excellence',
    'VP Delivery',
    'Head of Implementation',
    'Head of Solutions',
  ],
  excludedTitles: [
    'Software Engineer',
    'Backend Engineer',
    'Frontend Engineer',
    'Data Engineer',
    'DevOps',
    'QA Engineer',
    'Machine Learning Engineer',
    'Data Scientist',
    'Sales Development Representative',
    'Account Executive',
  ],
  targetSeniority: ['senior', 'staff', 'principal', 'director', 'executive'] as SeniorityLevel[],
  preferredFunctions: [
    'professional services',
    'partner operations',
    'partner enablement',
    'customer success',
    'services strategy',
    'global delivery',
    'services excellence',
    'implementation',
    'solutions delivery',
    'revenue operations',
  ],
  preferredIndustries: [
    'b2b saas',
    'enterprise software',
    'cloud infrastructure',
    'fintech',
    'developer tools',
    'workplace technology',
  ],
  preferredGeographies: ['Israel', 'Tel Aviv', 'Remote'],
  remotePreference: 'flexible',
  idealCompanyStage: ['Series B', 'Series C', 'Series D', 'Growth', 'Public', 'Late stage', 'Scale-up'],
  keywordsBoost: [
    'partner',
    'professional services',
    'PS',
    'customer success',
    'delivery',
    'global',
    'scale',
    'strategic programs',
    'cross-functional',
    'executive stakeholders',
    'services revenue',
    'implementation',
    'enablement',
    'revenue operations',
    'SaaS',
    'high-growth',
  ],
  keywordsPenalize: [
    'individual contributor',
    'coding',
    'programming',
    'software development',
    'machine learning',
    'deep learning',
    'data science',
    'entry level',
    'junior',
  ],
  compensationNotes: '',
  personalSummary:
    'Senior leader in Professional Services, Partner Operations, and global delivery within high-growth B2B SaaS. ' +
    'Built and scaled partner-led service operations, managed strategic programs, and worked cross-functionally with Sales, Product, ' +
    'Customer Success, and executive stakeholders. Target roles: VP/Director/Head of Professional Services, Partner Operations, ' +
    'Partner Enablement, Services Strategy, Customer Success Operations, Global Delivery, or Services Excellence.',
}

async function main() {
  console.log('Seeding database...')

  // Clear existing data
  await prisma.activityLog.deleteMany()
  await prisma.notification.deleteMany()
  await prisma.agentRun.deleteMany()
  await prisma.generatedAsset.deleteMany()
  await prisma.jobMatch.deleteMany()
  await prisma.jobNote.deleteMany()
  await prisma.jobPosting.deleteMany()
  await prisma.scanRun.deleteMany()
  await prisma.companySource.deleteMany()
  await prisma.targetCompany.deleteMany()
  await prisma.resume.deleteMany()
  await prisma.profile.deleteMany()
  await prisma.appSettings.deleteMany()
  console.log('  ✓ Cleared existing data')

  // Create profile
  const profile = await prisma.profile.create({
    data: {
      fullName: 'Demo User',
      email: '',
      linkedinUrl: '',
      preferredTitlesJson: JSON.stringify(demoProfile.targetTitles),
      excludedTitlesJson: JSON.stringify(demoProfile.excludedTitles),
      seniorityLevel: JSON.stringify(demoProfile.targetSeniority),
      preferredFunctionsJson: JSON.stringify(demoProfile.preferredFunctions),
      preferredIndustriesJson: JSON.stringify(demoProfile.preferredIndustries),
      preferredLocationsJson: JSON.stringify(demoProfile.preferredGeographies),
      remotePreference: demoProfile.remotePreference,
      idealCompanyStageJson: JSON.stringify(demoProfile.idealCompanyStage),
      targetKeywordsJson: JSON.stringify(demoProfile.keywordsBoost),
      excludedKeywordsJson: JSON.stringify(demoProfile.keywordsPenalize),
      compensationNotes: demoProfile.compensationNotes,
      summary: demoProfile.personalSummary,
    },
  })
  console.log('  ✓ Profile created')

  // Create base resume
  await prisma.resume.create({
    data: {
      title: 'Base Resume',
      rawText: `PROFESSIONAL EXPERIENCE

Head of Professional Services | TechCorp | 2021–Present
- Built and scaled the professional services organization from 3 to 25 FTEs
- Drove $8M ARR in services revenue with 85% gross margin
- Reduced time-to-value for enterprise customers by 40%
- Established delivery methodology adopted across 150+ enterprise accounts

Director of Customer Success | CloudSaaS | 2018–2021  
- Led 12-person CS team managing $45M ARR
- Achieved 118% net revenue retention across enterprise segment
- Launched scaled CS program for mid-market reducing churn by 22%

SKILLS
Professional services leadership, enterprise customer success, delivery management, 
cross-functional stakeholder management, B2B SaaS, team building, revenue operations`,
      isBaseResume: true,
    },
  })
  console.log('  ✓ Base resume created')

  // Create app settings
  await prisma.appSettings.create({
    data: {
      minRelevantScore: 55,
      autoScanIntervalHours: 6,
      autoRunFitAnalysis: true,
      fitAnalysisThreshold: 55,
    },
  })

  // Create companies
  const companies = [
    {
      name: 'monday.com',
      companyDomain: 'monday.com',
      careersUrl: 'https://boards.greenhouse.io/mondaydotcom',
      priority: 'high' as const,
      notes: 'Israeli SaaS company, strong culture. PM position.',
    },
    {
      name: 'Wiz',
      companyDomain: 'wiz.io',
      careersUrl: 'https://boards.greenhouse.io/wizsecurity',
      priority: 'high' as const,
      notes: 'Cloud security unicorn, rapid growth.',
    },
    {
      name: 'HiBob',
      companyDomain: 'hibob.com',
      careersUrl: 'https://boards.greenhouse.io/hibob',
      priority: 'medium' as const,
      notes: 'HR tech platform, Israel-based.',
    },
  ]

  const companyRecords = []
  for (const c of companies) {
    const company = await prisma.targetCompany.create({
      data: { ...c, active: true },
    })
    await prisma.companySource.create({
      data: {
        companyId: company.id,
        sourceType: 'greenhouse',
        sourceUrl: c.careersUrl,
        active: true,
      },
    })
    companyRecords.push(company)
  }
  console.log(`  ✓ ${companies.length} companies created`)

  // Create sample jobs
  const sampleJobs = [
    {
      companyIdx: 0,
      title: 'Head of Professional Services',
      location: 'Tel Aviv, Israel',
      description: `We are looking for a Head of Professional Services to lead our global delivery organization.

You will:
- Build and scale the professional services team (currently 15 people)
- Drive $10M+ services revenue
- Own the entire customer implementation lifecycle
- Partner with Sales and Product on enterprise deals
- Define delivery methodology and best practices

Requirements:
- 8+ years in professional services leadership
- Experience at B2B SaaS companies, Series C+
- Track record of scaling delivery teams
- Strong commercial acumen`,
      sourceType: 'greenhouse',
      sourceLabel: 'Greenhouse',
      status: 'new',
      tags: ['SaaS', 'leadership', 'delivery'],
    },
    {
      companyIdx: 1,
      title: 'VP Professional Services, EMEA',
      location: 'Tel Aviv, Israel (Remote-friendly)',
      description: `Wiz is seeking a VP of Professional Services for the EMEA region.

As VP, you will:
- Own P&L for $15M EMEA services business
- Lead team of 30+ delivery engineers and PMs
- Drive strategic enterprise customer outcomes
- Partner with Field Sales on large commercial deals
- Define the EMEA services go-to-market

About you:
- 10+ years in PS leadership
- Deep experience at cybersecurity or cloud companies
- Data-driven with strong financial acumen
- Executive presence and board-level communication`,
      sourceType: 'greenhouse',
      sourceLabel: 'Greenhouse',
      status: 'considering',
      tags: ['Cybersecurity', 'EMEA', 'VP'],
    },
    {
      companyIdx: 2,
      title: 'Director of Customer Success',
      location: 'Tel Aviv, Israel',
      description: `HiBob is hiring a Director of Customer Success to lead our enterprise CS function.

Your impact:
- Manage portfolio of 80+ enterprise accounts ($20M ARR)
- Lead team of 8 CSMs
- Drive net revenue retention above 115%
- Build executive relationships with CHRO/CPO level stakeholders
- Collaborate with Product on customer-driven roadmap

What we need:
- 7+ years in customer success, 3+ in leadership
- HR tech or B2B SaaS experience preferred
- Track record in enterprise CS
- Strong analytical skills`,
      sourceType: 'greenhouse',
      sourceLabel: 'Greenhouse',
      status: 'applied',
      tags: ['CS', 'Enterprise', 'HR Tech'],
    },
  ]

  for (const j of sampleJobs) {
    const company = companyRecords[j.companyIdx]
    const scoreResult = scoreJobAgainstProfile(
      { title: j.title, company: company.name, location: j.location, description: j.description },
      demoProfile,
    )

    const job = await prisma.jobPosting.create({
      data: {
        companyId: company.id,
        title: j.title,
        location: j.location,
        descriptionRaw: j.description,
        descriptionClean: j.description,
        sourceType: j.sourceType,
        sourceLabel: j.sourceLabel,
        status: j.status,
        tagsJson: JSON.stringify(j.tags),
        normalizedKey: `${company.name.toLowerCase().replace(/\s/g, '-')}|${j.title.toLowerCase().replace(/\s/g, '-')}|${j.location.toLowerCase().replace(/\s/g, '-')}`,
        isActive: true,
      },
    })

    await prisma.jobMatch.create({
      data: {
        jobPostingId: job.id,
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

    if (j.status === 'applied') {
      await prisma.jobNote.create({
        data: {
          jobPostingId: job.id,
          noteType: 'general',
          content: 'Applied via careers site. Waiting to hear back.',
        },
      })
    }
  }
  console.log(`  ✓ ${sampleJobs.length} demo jobs created`)

  console.log('\n✅ Seed complete!')
  console.log(`\nProfile: ${profile.id}`)
  console.log(`Companies: ${companyRecords.map((c) => c.name).join(', ')}`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
