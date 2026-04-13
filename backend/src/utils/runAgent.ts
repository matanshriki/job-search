#!/usr/bin/env tsx
/**
 * CLI entry point for manually triggering agents.
 * Usage:
 *   npm run agent:scan              # scan all companies
 *   npm run agent:fit <jobId>       # run fit analysis on a specific job
 *
 *   tsx src/utils/runAgent.ts scan [companyId]
 *   tsx src/utils/runAgent.ts fit <jobId>
 */

import prisma from '../db/client'
import { runScoutAgentForAllCompanies, runScoutAgentForCompany } from '../agents/scoutAgent'
import { runFitAnalystAgent } from '../agents/fitAnalystAgent'
import { runResumeTailorAgent } from '../agents/resumeTailorAgent'
import { runOutreachAgent } from '../agents/outreachAgent'
import { runInterviewPrepAgent } from '../agents/interviewPrepAgent'
import { resolveJobOwnerUserId } from './jobOwner'

async function main() {
  const [, , agentType, ...rest] = process.argv

  switch (agentType) {
    case 'scan': {
      const companyId = rest[0] ? parseInt(rest[0], 10) : null
      if (companyId) {
        console.log(`Scanning company ${companyId}...`)
        const result = await runScoutAgentForCompany(companyId)
        console.log(JSON.stringify(result, null, 2))
      } else {
        console.log('Scanning all active companies...')
        const results = await runScoutAgentForAllCompanies()
        console.log(JSON.stringify(results, null, 2))
      }
      break
    }

    case 'fit': {
      const jobId = parseInt(rest[0] ?? '0', 10)
      if (!jobId) { console.error('Usage: runAgent.ts fit <jobId>'); process.exit(1) }
      const ownerId = await resolveJobOwnerUserId(jobId)
      if (ownerId == null) { console.error('Job has no company owner'); process.exit(1) }
      console.log(`Running fit analysis for job ${jobId}...`)
      const result = await runFitAnalystAgent(jobId, ownerId)
      console.log(JSON.stringify(result.output, null, 2))
      break
    }

    case 'resume': {
      const jobId = parseInt(rest[0] ?? '0', 10)
      if (!jobId) { console.error('Usage: runAgent.ts resume <jobId>'); process.exit(1) }
      const ownerId = await resolveJobOwnerUserId(jobId)
      if (ownerId == null) { console.error('Job has no company owner'); process.exit(1) }
      console.log(`Running resume tailor for job ${jobId}...`)
      const result = await runResumeTailorAgent(jobId, undefined, ownerId)
      console.log(JSON.stringify(result.output, null, 2))
      break
    }

    case 'outreach': {
      const jobId = parseInt(rest[0] ?? '0', 10)
      if (!jobId) { console.error('Usage: runAgent.ts outreach <jobId>'); process.exit(1) }
      const ownerId = await resolveJobOwnerUserId(jobId)
      if (ownerId == null) { console.error('Job has no company owner'); process.exit(1) }
      console.log(`Running outreach agent for job ${jobId}...`)
      const result = await runOutreachAgent(jobId, ownerId)
      console.log(JSON.stringify(result.output, null, 2))
      break
    }

    case 'interview': {
      const jobId = parseInt(rest[0] ?? '0', 10)
      if (!jobId) { console.error('Usage: runAgent.ts interview <jobId>'); process.exit(1) }
      const ownerId = await resolveJobOwnerUserId(jobId)
      if (ownerId == null) { console.error('Job has no company owner'); process.exit(1) }
      console.log(`Running interview prep for job ${jobId}...`)
      const result = await runInterviewPrepAgent(jobId, ownerId)
      console.log(JSON.stringify(result.output, null, 2))
      break
    }

    default:
      console.log(`Usage: runAgent.ts <scan|fit|resume|outreach|interview> [id]`)
  }

  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
