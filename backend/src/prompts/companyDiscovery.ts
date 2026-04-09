import type { SearchProfile } from '../services/scoring/matchEngine'

export interface CompanyDiscoverySuggestion {
  name: string
  careersUrl: string
  whyRelevant: string
  priority: 'high' | 'medium'
}

export function buildCompanyDiscoveryMessages(profile: SearchProfile) {
  const targetTitles = profile.targetTitles.slice(0, 6).join(', ')
  const functions = profile.preferredFunctions.slice(0, 5).join(', ')
  const industries = profile.preferredIndustries.slice(0, 4).join(', ')
  const stage = profile.idealCompanyStage.slice(0, 4).join(', ')
  const geos = profile.preferredGeographies.join(', ')

  const profileLines = [
    targetTitles && `- Target roles: ${targetTitles}`,
    functions && `- Preferred functions: ${functions}`,
    industries && `- Target industries: ${industries}`,
    stage && `- Company stage: ${stage}`,
    geos && `- Location preference: ${geos}`,
    profile.personalSummary?.trim() && `- Background: ${profile.personalSummary.slice(0, 300)}`,
  ].filter(Boolean)

  const system =
    'You are a job search advisor helping a professional discover relevant companies. ' +
    'Return ONLY valid JSON matching the exact schema requested — no markdown, no extra text.'

  const user = [
    'Suggest 20 companies that are highly likely to have open roles matching this candidate.',
    '',
    'Candidate profile:',
    ...profileLines,
    '',
    'Selection criteria:',
    '- Company has open roles aligned with the target titles and functions above',
    '- Has a publicly accessible career page with a real URL',
    '- Mix of company sizes, stages, and geographies that match the profile',
    '',
    'Return a JSON object with this exact structure:',
    '{',
    '  "companies": [',
    '    {',
    '      "name": "Company Name",',
    '      "careersUrl": "https://actual-careers-page-url.com/careers",',
    '      "whyRelevant": "One sentence why this company fits the profile",',
    '      "priority": "high" or "medium"',
    '    }',
    '  ]',
    '}',
    '',
    'Mark "high": strong match to target roles/functions, or known for frequent hiring in these areas.',
    'Mark "medium": solid fit but less certain about current role availability.',
    'Use exact careers page URLs (/careers, /jobs), NOT the homepage.',
  ].join('\n')

  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ]
}
