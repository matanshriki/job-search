import OpenAI from 'openai'

export type AssetType =
  | 'fit_analysis'
  | 'resume_tailoring'
  | 'outreach_message'
  | 'cover_note'
  | 'interview_prep'
  | 'company_brief'

export interface AiMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface AiResponse {
  content: string
  modelUsed: string
  tokensUsed?: number
}

const isMockMode = !process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'mock'

let client: OpenAI | null = null

function getClient(): OpenAI {
  if (!client) {
    client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY ?? 'mock',
      baseURL: process.env.AI_BASE_URL || undefined,
    })
  }
  return client
}

const MODEL = process.env.AI_MODEL || 'gpt-4o-mini'

const MOCK_RESPONSES: Record<AssetType, string> = {
  cover_note: JSON.stringify({
    coverNote: 'I am excited to apply for this role. My background in professional services leadership directly aligns with what you are looking for.',
  }, null, 2),
  fit_analysis: JSON.stringify({
    fitLabel: 'medium',
    fitScore: 65,
    fitSummary: 'This role aligns moderately well with your experience in professional services and operations leadership.',
    matchingReasons: [
      'Strong alignment with your background in professional services leadership',
      'Company stage matches your preferred growth-stage companies',
      'Leadership scope matches your target seniority',
    ],
    concerns: [
      'Location may not match your primary geography preference',
      'Some technical requirements may be secondary to your core skill set',
    ],
    missingSignals: [
      'No explicit mention of team size or budget ownership',
      'Compensation range not specified',
    ],
    recommendedResumePoints: [
      'Highlight your PS team growth and revenue impact',
      'Emphasize cross-functional stakeholder management experience',
      'Include specific metrics from service delivery transformation work',
    ],
  }, null, 2),

  resume_tailoring: JSON.stringify({
    tailoredSummary: 'Results-driven professional services leader with 10+ years scaling enterprise B2B service organizations. Proven track record building high-performing delivery teams and driving customer value at growth-stage SaaS companies.',
    prioritizedBullets: [
      'Led professional services organization from $X to $Y ARR, growing team from N to N engineers and CSMs',
      'Designed and implemented scalable delivery framework reducing time-to-value by X%',
      'Built strategic partner ecosystem generating $X in co-delivered revenue',
    ],
    suggestedEdits: [
      'Add specific ARR impact metrics to your PS leadership role',
      'Quantify customer satisfaction improvements (NPS, CSAT scores)',
    ],
  }, null, 2),

  outreach_message: JSON.stringify({
    recruiterMessage: "Hi [Name], I came across this [Title] role at [Company] and it closely aligns with my background leading professional services and operations at B2B SaaS companies. I've spent the past several years building and scaling delivery organizations, and I'd love to explore whether this could be a mutual fit. Would you be open to a brief conversation?",
    linkedinNote: "Hi [Name] — your [Title] role at [Company] caught my attention. My background in PS leadership at SaaS companies feels directly relevant. Would love to connect.",
    coverNote: "I'm excited to apply for the [Title] role at [Company]. My experience scaling professional services teams at growth-stage B2B companies aligns closely with what you're building.",
    networkingAngle: "I noticed [Company] is investing in scaling their services organization — this is an area I've worked in extensively. Would love to share perspectives on what's worked at similar-stage companies.",
  }, null, 2),

  interview_prep: JSON.stringify({
    intro60s: "I'm a professional services and operations leader with 10+ years at B2B SaaS companies. I've built and scaled delivery teams from scratch, driven significant improvements in time-to-value and customer satisfaction, and consistently tied services outcomes to revenue growth. I'm drawn to [Company] because of your focus on [key area], and I believe my experience can directly accelerate the work you're doing.",
    whyCompany: "I'm attracted to [Company]'s trajectory — you're at a stage where professional services can go from a cost center to a genuine competitive differentiator. I've navigated this exact inflection point before and see strong alignment with how I approach scaling service organizations.",
    whyRole: "This role sits at the intersection of customer success, service delivery, and strategic growth — exactly where I've done my best work. The opportunity to build something that directly impacts revenue retention and expansion is what draws me to this type of role.",
    recruiterQuestions: [
      "Walk me through your background — how did you get to where you are today?",
      "What's your management style with service delivery teams?",
      "How do you measure success in a professional services role?",
      "Why are you interested in [Company] specifically?",
      "What's your approach to building a services organization from early stage?",
    ],
    hiringManagerQuestions: [
      "How have you approached the build vs. buy decision for professional services capabilities?",
      "Tell me about a time you had to significantly change a delivery model — what drove it and what was the outcome?",
      "How do you balance standardization with customization in service delivery?",
      "Describe your experience with enterprise-level customer escalations.",
      "How do you think about the relationship between professional services and product roadmap?",
    ],
    talkingPoints: [
      "Your track record of growing PS revenue while maintaining margins",
      "Specific examples of customer outcomes you drove",
      "Your philosophy on hiring and developing service delivery talent",
      "How you've used data to improve service delivery velocity",
    ],
    possibleObjections: [
      "You may not have direct experience in [specific industry] — prepare to address transferable skills",
      "Your most recent role may be at a different scale — acknowledge and reframe",
    ],
    questionsToAsk: [
      "What does success look like in the first 90 days for this role?",
      "How does the professional services team interface with product and engineering today?",
      "What's the current ratio of services revenue to total ARR?",
      "What are the biggest gaps you're trying to fill with this hire?",
      "How do you think about the services org evolving over the next 2-3 years?",
    ],
  }, null, 2),

  company_brief: JSON.stringify({
    overview: 'Company overview not available in mock mode.',
    stage: 'Unknown',
    keyFacts: [],
    recentNews: [],
  }, null, 2),
}

export async function callAi(
  messages: AiMessage[],
  assetType?: AssetType,
  maxTokens = 2000,
): Promise<AiResponse> {
  if (isMockMode) {
    const mockContent = assetType
      ? MOCK_RESPONSES[assetType] ?? 'Mock response — set OPENAI_API_KEY to enable real AI responses.'
      : 'Mock response — set OPENAI_API_KEY to enable real AI responses.'
    return { content: mockContent, modelUsed: 'mock' }
  }

  try {
    const ai = getClient()
    const completion = await ai.chat.completions.create({
      model: MODEL,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: maxTokens,
      response_format: { type: 'json_object' },
    })

    const content = completion.choices[0]?.message?.content ?? ''
    return {
      content,
      modelUsed: completion.model,
      tokensUsed: completion.usage?.total_tokens,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    throw new Error(`AI call failed: ${msg}`)
  }
}

export function isAiEnabled(): boolean {
  return !isMockMode
}
