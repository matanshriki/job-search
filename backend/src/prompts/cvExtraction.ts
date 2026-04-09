/**
 * Prompt builder for extracting a structured search profile from CV/resume text.
 */

export interface ExtractedProfile {
  fullName: string
  email: string
  linkedinUrl: string
  personalSummary: string
  targetTitles: string[]
  targetSeniority: string[]
  preferredFunctions: string[]
  preferredIndustries: string[]
  preferredGeographies: string[]
  keywordsBoost: string[]
  remotePreference: 'remote_first' | 'hybrid_ok' | 'onsite_ok' | 'flexible'
  idealCompanyStage: string[]
}

export function buildCvExtractionMessages(cvText: string) {
  const system =
    'You are a career advisor helping parse a resume into a structured job-search profile. ' +
    'Extract factual information from the CV. Do not invent information that is not present. ' +
    'Return ONLY valid JSON — no markdown, no explanations, no extra text.'

  const user = [
    'Extract a job-search profile from the following CV/resume.',
    '',
    'Rules:',
    '- targetTitles: list 3–6 specific job titles this person is qualified for, based on their experience',
    '- targetSeniority: pick from ["ic", "senior_ic", "staff", "manager", "senior_manager", "director", "vp", "c_suite"]. Choose the levels that best match.',
    '- preferredFunctions: e.g. ["Engineering", "Product Management", "Sales", "Professional Services"]',
    '- preferredIndustries: extract from past employers or stated preferences (e.g. "B2B SaaS", "FinTech")',
    '- preferredGeographies: extract any mentioned locations; default to [] if none stated',
    '- keywordsBoost: 8–15 hard skills, technologies, or domain terms from the CV',
    '- remotePreference: infer from the CV if possible, otherwise "flexible"',
    '- idealCompanyStage: infer from past employers (e.g. ["Series B", "Series C", "Growth", "Enterprise"])',
    '- personalSummary: write 2–3 sentences describing this person\'s background and strengths in third person',
    '- fullName, email, linkedinUrl: extract directly from the CV if present, else use ""',
    '',
    'Return this exact JSON structure:',
    '{',
    '  "fullName": "",',
    '  "email": "",',
    '  "linkedinUrl": "",',
    '  "personalSummary": "",',
    '  "targetTitles": [],',
    '  "targetSeniority": [],',
    '  "preferredFunctions": [],',
    '  "preferredIndustries": [],',
    '  "preferredGeographies": [],',
    '  "keywordsBoost": [],',
    '  "remotePreference": "flexible",',
    '  "idealCompanyStage": []',
    '}',
    '',
    '=== CV START ===',
    cvText.slice(0, 6000),
    '=== CV END ===',
  ].join('\n')

  return [
    { role: 'system' as const, content: system },
    { role: 'user' as const, content: user },
  ]
}
