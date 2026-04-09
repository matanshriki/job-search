#!/usr/bin/env tsx
/**
 * Initialises the database with a blank slate for a new user.
 * Run: npm run db:seed
 *
 * This script only creates the minimum required records (profile + app settings).
 * No personal data, companies, or jobs are seeded — the user fills those in through the UI.
 */

import prisma from '../db/client'

async function main() {
  console.log('Initialising database...')

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

  // Create a blank profile — the user fills this in via the Profile page
  await prisma.profile.create({
    data: {
      fullName: '',
      email: '',
      linkedinUrl: '',
      preferredTitlesJson: JSON.stringify([]),
      excludedTitlesJson: JSON.stringify([]),
      seniorityLevel: JSON.stringify([]),
      preferredFunctionsJson: JSON.stringify([]),
      preferredIndustriesJson: JSON.stringify([]),
      preferredLocationsJson: JSON.stringify([]),
      remotePreference: 'flexible',
      idealCompanyStageJson: JSON.stringify([]),
      targetKeywordsJson: JSON.stringify([]),
      excludedKeywordsJson: JSON.stringify([]),
      compensationNotes: '',
      summary: '',
    },
  })
  console.log('  ✓ Blank profile created')

  // Create default app settings
  await prisma.appSettings.create({
    data: {
      minRelevantScore: 55,
      autoScanIntervalHours: 6,
      autoRunFitAnalysis: true,
      fitAnalysisThreshold: 55,
    },
  })
  console.log('  ✓ App settings created')

  console.log('\n✅ Initialisation complete!')
  console.log('   Next steps:')
  console.log('   1. Open the app and fill in your profile (target roles, location, keywords).')
  console.log('   2. Add companies you want to track on the Companies page.')
  console.log('   3. Scan companies to pull live job listings.')
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
