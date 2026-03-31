import type { SearchProfile } from '../services/scoring/matchEngine'

export interface CompanyDiscoverySuggestion {
  name: string
  careersUrl: string
  whyRelevant: string
  priority: 'high' | 'medium'
}

export function buildCompanyDiscoveryMessages(profile: SearchProfile) {
  const targetTitles =
    profile.targetTitles.slice(0, 6).join(', ') ||
    'VP/Director/Head of Professional Services, Partner Operations, Customer Success'
  const functions =
    profile.preferredFunctions.slice(0, 5).join(', ') ||
    'professional services, partner operations, customer success'
  const industries =
    profile.preferredIndustries.slice(0, 4).join(', ') || 'B2B SaaS, enterprise software'
  const stage = profile.idealCompanyStage.slice(0, 4).join(', ') || 'Series B+, Growth, Public'
  const geos = profile.preferredGeographies.join(', ') || 'Israel, Remote'

  const system =
    'You are a job search advisor helping a senior executive discover relevant companies. ' +
    'Return ONLY valid JSON matching the exact schema requested — no markdown, no extra text.'

  const user = [
    'Suggest 20 B2B SaaS or enterprise software companies that are highly likely to have open',
    'leadership roles for this candidate right now.',
    '',
    'Candidate profile:',
    `- Target roles: ${targetTitles}`,
    `- Preferred functions: ${functions}`,
    `- Target industries: ${industries}`,
    `- Company stage: ${stage}`,
    `- Location preference: ${geos}`,
    profile.personalSummary?.trim()
      ? `- Background: ${profile.personalSummary.slice(0, 300)}`
      : '',
    '',
    'Selection criteria:',
    '- Company has a dedicated Professional Services, Partner, or Customer Success org',
    '- B2B-focused, enterprise or mid-market customer base',
    '- Series B or later, or public',
    '- Has a publicly accessible career page with a real URL',
    '- Mix: global companies with remote roles + Israeli companies',
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
    'Mark "high": companies known for strong PS/Partner/CS orgs, Israeli companies, or where leadership hiring is frequent.',
    'Mark "medium": solid fit but less certain about current role availability.',
    'Use exact careers URLs (/careers, /jobs), NOT the homepage.',
  ]
    .filter((l) => l !== undefined)
    .join('\n')

  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ]
}
