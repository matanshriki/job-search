import type { SearchProfile } from '../services/scoring/matchEngine'

export interface OutreachInput {
  jobTitle: string
  jobCompany: string
  jobLocation: string
  jobDescription: string
  profile: SearchProfile
  resumeText?: string
}

export interface OutreachOutput {
  recruiterMessage: string
  linkedinNote: string
  coverNote: string
  networkingAngle: string
}

export function buildOutreachMessages(input: OutreachInput) {
  const { jobTitle, jobCompany, jobLocation, jobDescription, profile, resumeText } = input

  const domainContext = profile.personalSummary?.trim() ||
    `Senior leader in Professional Services, Partner Operations, and global delivery in high-growth B2B SaaS.`

  const profileSnippet = [
    `Background: ${domainContext}`,
    `Target seniority: ${profile.targetSeniority.join(', ')}`,
    `Core functions: ${profile.preferredFunctions.slice(0, 5).join(', ')}`,
    `Industries: ${profile.preferredIndustries.slice(0, 3).join(', ')}`,
  ].filter(Boolean).join('\n')

  const system = `You are an expert professional communications writer helping a senior PS/operations leader craft authentic outreach for job opportunities.
The candidate is a VP/Director-level professional targeting strategic leadership roles in Professional Services, Partner Operations, Customer Success, or Services Strategy at B2B SaaS companies.
Messages must sound senior, specific, and human — not like a template. Highlight strategic value, leadership track record, and genuine interest in the company/role.
LinkedIn note must be under 280 characters. All other messages should be concise but substantive.

Return ONLY valid JSON with this exact structure:
{
  "recruiterMessage": "2-3 paragraph outreach to a recruiter — concise but substantive, senior tone",
  "linkedinNote": "Short LinkedIn connection note (STRICT max 280 characters)",
  "coverNote": "1-2 paragraph opening for an application or email cover — highlight key leadership value",
  "networkingAngle": "1 paragraph warm outreach to a leader or employee at the company (not a recruiter) — find common ground"
}`

  const userContent = [
    '## Target Role',
    `Title: ${jobTitle}`,
    `Company: ${jobCompany}`,
    `Location: ${jobLocation}`,
    `JD excerpt:\n${jobDescription.slice(0, 2000)}`,
    '',
    '## My Background',
    profileSnippet,
    '',
    resumeText ? `## My Resume Highlights\n${resumeText.slice(0, 1500)}` : '',
    '',
    'Write authentic senior-level messages. Use [Name] as placeholder for recipient name. Do not use buzzword-heavy generic openers.',
  ].filter(Boolean).join('\n')

  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: userContent },
  ]
}
