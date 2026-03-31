/**
 * Company Discovery Agent
 * Uses AI to suggest relevant companies based on the user's profile,
 * then lets the user review and bulk-add them.
 */

import prisma from '../db/client'
import { callAi } from '../services/aiService'
import { buildCompanyDiscoveryMessages } from '../prompts/companyDiscovery'
import { buildProfileFromDb } from '../utils/profileHelpers'
import type { CompanyDiscoverySuggestion } from '../prompts/companyDiscovery'

/** Curated fallback list used when AI is not configured or fails. */
const CURATED_SUGGESTIONS: CompanyDiscoverySuggestion[] = [
  // Israeli companies — always high priority for this profile
  { name: 'monday.com', careersUrl: 'https://boards.greenhouse.io/mondaycom', whyRelevant: 'Israeli work-OS SaaS with dedicated Partner Operations and PS leadership org', priority: 'high' },
  { name: 'WalkMe', careersUrl: 'https://boards.greenhouse.io/walkme', whyRelevant: 'Israeli digital adoption platform with a large Professional Services organization', priority: 'high' },
  { name: 'Wiz', careersUrl: 'https://jobs.lever.co/wiz', whyRelevant: 'Israeli cloud security unicorn scaling Partner and Services programs globally', priority: 'high' },
  { name: 'Snyk', careersUrl: 'https://boards.greenhouse.io/snyk', whyRelevant: 'Developer security SaaS (Israeli-founded) with strong Partner and PS orgs', priority: 'high' },
  { name: 'Fiverr', careersUrl: 'https://boards.greenhouse.io/fiverr', whyRelevant: 'Israeli marketplace scaling partner programs and customer success', priority: 'medium' },
  // CS / PS platform companies
  // CS / PS platform companies — using direct ATS board URLs where known
  { name: 'Gainsight', careersUrl: 'https://boards.greenhouse.io/gainsight', whyRelevant: 'CS operations platform — hiring CS and PS leadership is core to their mission', priority: 'high' },
  { name: 'Totango', careersUrl: 'https://jobs.lever.co/totango', whyRelevant: 'Customer success platform consistently hiring CS and services leaders', priority: 'high' },
  { name: 'Planhat', careersUrl: 'https://jobs.lever.co/planhat', whyRelevant: 'CS platform with an expanding PS and partner enablement org', priority: 'medium' },
  { name: 'ChurnZero', careersUrl: 'https://boards.greenhouse.io/churnzero', whyRelevant: 'CS platform targeting mid-market SaaS, hiring CS operations leadership', priority: 'medium' },
  // Revenue / GTM SaaS — direct ATS boards
  { name: 'Gong', careersUrl: 'https://boards.greenhouse.io/gong', whyRelevant: 'Revenue intelligence leader with a growing Partner and Professional Services org', priority: 'high' },
  { name: 'Outreach', careersUrl: 'https://boards.greenhouse.io/outreach', whyRelevant: 'Sales engagement platform with strong services and partner enablement functions', priority: 'high' },
  { name: 'Clari', careersUrl: 'https://boards.greenhouse.io/clari', whyRelevant: 'Revenue operations platform with dedicated PS and partner operations teams', priority: 'high' },
  { name: 'Salesloft', careersUrl: 'https://boards.greenhouse.io/salesloft', whyRelevant: 'Revenue workflow platform scaling Professional Services', priority: 'medium' },
  // Enablement SaaS
  { name: 'Highspot', careersUrl: 'https://boards.greenhouse.io/highspot', whyRelevant: 'Sales enablement platform known for robust CS and PS teams', priority: 'high' },
  { name: 'Seismic', careersUrl: 'https://boards.greenhouse.io/seismic', whyRelevant: 'Sales enablement leader with partner and services leadership roles', priority: 'medium' },
  { name: 'Showpad', careersUrl: 'https://jobs.lever.co/showpad', whyRelevant: 'Sales enablement SaaS with partner enablement and CS leadership', priority: 'medium' },
  // Broader enterprise SaaS — direct ATS boards
  { name: 'HubSpot', careersUrl: 'https://boards.greenhouse.io/hubspot', whyRelevant: 'Large partner network and Professional Services org with frequent leadership hiring', priority: 'high' },
  { name: 'Zendesk', careersUrl: 'https://boards.greenhouse.io/zendesk', whyRelevant: 'Enterprise CX platform with strong global PS, partner, and CS operations', priority: 'high' },
  { name: 'Amplitude', careersUrl: 'https://boards.greenhouse.io/amplitude', whyRelevant: 'Analytics SaaS with dedicated Professional Services and solutions delivery teams', priority: 'medium' },
  { name: 'Asana', careersUrl: 'https://boards.greenhouse.io/asana', whyRelevant: 'Work management SaaS with an established PS and partner org', priority: 'medium' },
]

export interface CompanyDiscoveryResult {
  suggestions: CompanyDiscoverySuggestion[]
  source: 'ai' | 'curated'
  message: string
}

export async function runCompanyDiscoveryAgent(): Promise<CompanyDiscoveryResult> {
  const profileRow = await prisma.profile.findFirst()

  if (!profileRow) {
    return {
      suggestions: CURATED_SUGGESTIONS,
      source: 'curated',
      message:
        'No profile set up yet — showing a curated list. Complete your profile for AI-personalized recommendations.',
    }
  }

  const profile = buildProfileFromDb(profileRow)
  const messages = buildCompanyDiscoveryMessages(profile)

  try {
    const response = await callAi(messages, undefined, 3000)

    if (response.modelUsed === 'mock') {
      return {
        suggestions: CURATED_SUGGESTIONS,
        source: 'curated',
        message:
          'AI not configured — showing curated suggestions. Add OPENAI_API_KEY to backend/.env for personalized results.',
      }
    }

    // Parse JSON object with { companies: [...] } shape
    const content = response.content.trim()
    const parsed = JSON.parse(content) as { companies?: CompanyDiscoverySuggestion[] }
    const raw = parsed.companies ?? (Array.isArray(parsed) ? parsed : [])

    const suggestions: CompanyDiscoverySuggestion[] = (raw as CompanyDiscoverySuggestion[])
      .filter((s) => s && typeof s.name === 'string' && typeof s.careersUrl === 'string')
      .map((s) => ({
        name: String(s.name).trim(),
        careersUrl: String(s.careersUrl).trim(),
        whyRelevant: String(s.whyRelevant ?? '').trim(),
        priority: s.priority === 'high' ? 'high' : 'medium',
      }))

    return {
      suggestions,
      source: 'ai',
      message: `AI found ${suggestions.length} relevant companies based on your profile.`,
    }
  } catch {
    // Fall back to curated list on any AI / parsing failure
    return {
      suggestions: CURATED_SUGGESTIONS,
      source: 'curated',
      message:
        'AI response could not be parsed — showing curated suggestions instead.',
    }
  }
}
