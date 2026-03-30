import type { SearchProfile } from '../services/scoring/matchEngine'

export interface InterviewPrepInput {
  jobTitle: string
  jobCompany: string
  jobLocation: string
  jobDescription: string
  profile: SearchProfile
  resumeText?: string
  fitAnalysis?: string
}

export interface InterviewPrepOutput {
  intro60s: string
  whyCompany: string
  whyRole: string
  recruiterQuestions: string[]
  hiringManagerQuestions: string[]
  talkingPoints: string[]
  possibleObjections: string[]
  questionsToAsk: string[]
}

export function buildInterviewPrepMessages(input: InterviewPrepInput) {
  const { jobTitle, jobCompany, jobLocation, jobDescription, profile, resumeText, fitAnalysis } = input

  const domainContext = profile.personalSummary?.trim() ||
    `Senior leader in Professional Services, Partner Operations, and global delivery in high-growth B2B SaaS. ` +
    `Track record of building and scaling partner-led service operations, managing strategic programs, ` +
    `and working cross-functionally with Sales, Product, Customer Success, and executive stakeholders.`

  const profileSnippet = [
    `Background: ${domainContext}`,
    `Target seniority: ${profile.targetSeniority.join(', ')}`,
    `Preferred functions: ${profile.preferredFunctions.slice(0, 5).join(', ')}`,
    `Industries: ${profile.preferredIndustries.slice(0, 3).join(', ')}`,
  ].filter(Boolean).join('\n')

  const system = `You are an expert executive career coach preparing a senior PS/operations leader for interviews.
The candidate targets VP/Director/Head-level roles in Professional Services, Partner Operations, Partner Enablement, Customer Success Operations, Services Strategy, or Global Delivery — within high-growth B2B SaaS companies.
Frame all preparation around strategic leadership: org design, cross-functional influence, revenue impact, delivery at scale, executive stakeholder management.
Interview questions should be calibrated to the level and domain (not engineering, not entry-level).

Return ONLY valid JSON with this exact structure:
{
  "intro60s": "A compelling 60-second verbal introduction for a senior leadership interview, not a resume recitation",
  "whyCompany": "1-2 paragraphs — specific, authentic, research-backed reasons this company is compelling",
  "whyRole": "1-2 paragraphs on why this specific role aligns with career trajectory and strengths",
  "recruiterQuestions": ["question 1", ...] (5-6 likely recruiter/HR screen questions at this seniority level),
  "hiringManagerQuestions": ["question 1", ...] (6-8 deep domain questions a hiring manager for this role would ask),
  "talkingPoints": ["point 1", ...] (4-6 narrative points about impact and leadership philosophy to weave into answers),
  "possibleObjections": ["objection 1", ...] (2-3 concerns an interviewer might raise and how to address them),
  "questionsToAsk": ["question 1", ...] (5-7 sharp, senior-level questions to ask the interviewers)
}`

  const userContent = [
    '## Role',
    `Title: ${jobTitle}`,
    `Company: ${jobCompany}`,
    `Location: ${jobLocation}`,
    `JD:\n${jobDescription.slice(0, 3000)}`,
    '',
    '## My Background',
    profileSnippet,
    '',
    resumeText ? `## My Resume\n${resumeText.slice(0, 2500)}` : '',
    fitAnalysis ? `## Prior Fit Analysis\n${fitAnalysis.slice(0, 800)}` : '',
    '',
    'Generate senior-level, domain-specific interview prep. Questions should reflect the seniority, scope, and PS/operations domain.',
  ].filter(Boolean).join('\n')

  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: userContent },
  ]
}
