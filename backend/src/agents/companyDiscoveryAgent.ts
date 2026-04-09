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

export interface CompanyDiscoveryResult {
  suggestions: CompanyDiscoverySuggestion[]
  source: 'ai' | 'curated'
  message: string
}

export async function runCompanyDiscoveryAgent(): Promise<CompanyDiscoveryResult> {
  const profileRow = await prisma.profile.findFirst()

  if (!profileRow) {
    return {
      suggestions: [],
      source: 'curated',
      message: 'No profile found. Set up your profile first so the AI can suggest relevant companies.',
    }
  }

  const profile = buildProfileFromDb(profileRow)

  const hasProfile =
    profile.targetTitles.length > 0 ||
    profile.preferredFunctions.length > 0 ||
    profile.personalSummary.trim().length > 0

  if (!hasProfile) {
    return {
      suggestions: [],
      source: 'curated',
      message:
        'Your profile is empty. Fill in your target roles, preferred functions, and a short summary — then run discovery again to get AI-powered company suggestions.',
    }
  }

  const messages = buildCompanyDiscoveryMessages(profile)

  try {
    const response = await callAi(messages, undefined, 3000)

    if (response.modelUsed === 'mock') {
      return {
        suggestions: [],
        source: 'curated',
        message:
          'AI not configured — add OPENAI_API_KEY to backend/.env to get personalised company suggestions.',
      }
    }

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
    return {
      suggestions: [],
      source: 'curated',
      message:
        'AI response could not be parsed. Check that your OPENAI_API_KEY is valid and try again.',
    }
  }
}
