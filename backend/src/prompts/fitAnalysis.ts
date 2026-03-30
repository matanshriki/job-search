import type { SearchProfile } from '../services/scoring/matchEngine'

export interface FitAnalysisInput {
  jobTitle: string
  jobCompany: string
  jobLocation: string
  jobDescription: string
  profile: SearchProfile
  resumeText?: string
  scoreBreakdown?: Record<string, unknown>
}

export interface FitAnalysisOutput {
  fitLabel: 'high' | 'medium' | 'low'
  fitScore: number
  fitSummary: string
  matchingReasons: string[]
  concerns: string[]
  missingSignals: string[]
  recommendedResumePoints: string[]
}

function buildDomainContext(profile: SearchProfile): string {
  const summary = profile.personalSummary?.trim()
  if (summary) return summary
  const fns = profile.preferredFunctions.slice(0, 4).join(', ')
  const titles = profile.targetTitles.slice(0, 3).join(', ')
  return `Senior leader targeting ${titles}${fns ? ` in functions: ${fns}` : ''}.`
}

export function buildFitAnalysisMessages(input: FitAnalysisInput) {
  const { jobTitle, jobCompany, jobLocation, jobDescription, profile, resumeText, scoreBreakdown } = input

  const domainContext = buildDomainContext(profile)

  const profileSummary = [
    `Target titles: ${profile.targetTitles.join(', ') || 'Not set'}`,
    `Excluded titles: ${profile.excludedTitles.join(', ') || 'None'}`,
    `Target seniority: ${profile.targetSeniority.join(', ') || 'Not set'}`,
    `Preferred functions: ${profile.preferredFunctions.join(', ') || 'Not set'}`,
    `Preferred industries: ${profile.preferredIndustries.join(', ') || 'Not set'}`,
    `Preferred geographies: ${profile.preferredGeographies.join(', ') || 'Not set'}`,
    `Remote preference: ${profile.remotePreference}`,
    `Ideal company stage: ${profile.idealCompanyStage.join(', ') || 'Not set'}`,
    `Keyword boosts: ${profile.keywordsBoost.join(', ') || 'None'}`,
    `Keyword penalties: ${profile.keywordsPenalize.join(', ') || 'None'}`,
    `Background: ${domainContext}`,
  ].filter(Boolean).join('\n')

  const system = `You are an expert job-fit analyst helping a senior leader evaluate job opportunities.
The candidate is a senior professional in Professional Services, Partner Operations, global delivery, and services strategy within high-growth B2B SaaS companies.
They target VP/Director/Head-level strategic leadership roles — NOT individual contributor technical roles (engineering, data science, DevOps).
When analyzing fit, focus on: leadership scope, team/org scale, strategic impact, cross-functional complexity, services/partnership domain alignment, and company growth stage.
Penalize roles that are clearly technical IC positions, early-career, or outside the PS/operations/CS leadership space.

Return ONLY valid JSON with this exact structure:
{
  "fitLabel": "high" | "medium" | "low",
  "fitScore": number (0-100),
  "fitSummary": "2-3 sentence summary of overall fit, written for a senior leader",
  "matchingReasons": ["reason 1", "reason 2", ...] (3-5 specific items),
  "concerns": ["concern 1", ...] (2-4 items, be honest),
  "missingSignals": ["signal 1", ...] (1-3 items of information missing from the JD that would affect the assessment),
  "recommendedResumePoints": ["point 1", ...] (3-5 specific, metrics-driven bullet suggestions tailored to this role)
}`

  const userContent = [
    '## Job Posting',
    `Title: ${jobTitle}`,
    `Company: ${jobCompany}`,
    `Location: ${jobLocation}`,
    `Description:\n${jobDescription.slice(0, 4000)}`,
    '',
    '## Candidate Profile',
    profileSummary,
    '',
    resumeText ? `## Candidate Resume\n${resumeText.slice(0, 3000)}` : '',
    scoreBreakdown ? `## Rules-Based Score Breakdown\n${JSON.stringify(scoreBreakdown, null, 2)}` : '',
    '',
    'Provide a thorough, honest fit analysis calibrated for a senior PS/operations/CS leadership candidate. Be specific and actionable.',
  ].filter(Boolean).join('\n')

  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: userContent },
  ]
}
