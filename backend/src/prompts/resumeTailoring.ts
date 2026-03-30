import type { SearchProfile } from '../services/scoring/matchEngine'

export interface ResumeTailoringInput {
  jobTitle: string
  jobCompany: string
  jobDescription: string
  profile: SearchProfile
  baseResumeText: string
  fitAnalysis?: string
}

export interface ResumeTailoringOutput {
  tailoredSummary: string
  prioritizedBullets: string[]
  suggestedEdits: string[]
  keywordsToInclude: string[]
}

export function buildResumeTailoringMessages(input: ResumeTailoringInput) {
  const { jobTitle, jobCompany, jobDescription, profile, baseResumeText, fitAnalysis } = input

  const domainContext = profile.personalSummary?.trim() ||
    `Senior leader in Professional Services, Partner Operations, and global delivery in high-growth B2B SaaS.`

  const system = `You are an expert executive resume strategist helping a senior PS/operations leader tailor their resume for a specific role.
The candidate is a VP/Director-level professional targeting strategic leadership roles in Professional Services, Partner Operations, Customer Success, Services Strategy, or Global Delivery.
Do NOT rewrite the entire resume. Provide strategic tailoring: a strong opening summary, which impact bullets to lead with, and targeted language edits.
All suggestions must be grounded in the resume content — do not fabricate experience.
Prioritize: quantified impact (revenue, team scale, retention, efficiency), leadership scope, cross-functional influence, and domain alignment.

Return ONLY valid JSON with this exact structure:
{
  "tailoredSummary": "A 3-4 sentence executive summary tailored to this specific role and company",
  "prioritizedBullets": ["bullet 1", "bullet 2", ...] (5-7 metrics-driven bullets from the resume to lead with — rewrite if needed for impact),
  "suggestedEdits": ["edit 1", ...] (3-5 targeted language improvements to existing resume content),
  "keywordsToInclude": ["keyword 1", ...] (6-10 JD keywords to weave naturally into resume — ATS-relevant)
}`

  const userContent = [
    '## Target Role',
    `Title: ${jobTitle}`,
    `Company: ${jobCompany}`,
    `Description:\n${jobDescription.slice(0, 3000)}`,
    '',
    `## Candidate Background`,
    domainContext,
    '',
    '## Base Resume',
    baseResumeText.slice(0, 3000),
    '',
    fitAnalysis ? `## Prior Fit Analysis\n${fitAnalysis.slice(0, 800)}` : '',
    '',
    'Provide actionable, senior-level tailoring. Every suggestion must reference real content from the resume.',
  ].filter(Boolean).join('\n')

  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: userContent },
  ]
}
