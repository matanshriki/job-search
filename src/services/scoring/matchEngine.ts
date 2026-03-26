import { jobDuplicateKey } from '@/lib/utils'
import {
  DEFAULT_SCORE_WEIGHTS,
  type Job,
  type ScoreBreakdown,
  type SearchProfile,
  type SeniorityLevel,
} from '@/domain/types'

const SENIORITY_KEYWORDS: Record<SeniorityLevel, string[]> = {
  intern: ['intern', 'internship'],
  junior: ['junior', 'associate', 'entry', 'graduate'],
  mid: ['mid', 'intermediate', 'ii', ' 2 '],
  senior: ['senior', 'sr.', 'sr ', 'iii', '3 ', 'manager'],
  staff: ['staff', 'lead', 'principal engineer'],
  principal: ['principal', 'distinguished', 'fellow'],
  director: ['director', 'head of'],
  executive: ['vp', 'vice president', 'cto', 'cfo', 'ceo', 'chief'],
}

function norm(s: string): string {
  return s.toLowerCase().trim()
}

function includesAny(haystack: string, needles: string[]): boolean {
  const h = norm(haystack)
  return needles.some((n) => h.includes(norm(n)))
}

/** Stopwords / noise when tokenizing titles for fuzzy target matching */
const TITLE_TOKENS_STOP = new Set([
  'the',
  'a',
  'an',
  'of',
  'and',
  'or',
  'for',
  'to',
  'in',
  'on',
  'at',
  'with',
  'full',
  'time',
  'part',
  'contract',
  'permanent',
  'temporary',
  'remote',
  'hybrid',
  'onsite',
])

function titleWordTokens(s: string): string[] {
  return norm(s)
    .replace(/\|/g, ' ')
    .split(/\W+/)
    .filter((w) => w.length > 2 && !TITLE_TOKENS_STOP.has(w))
}

/**
 * How well the job title overlaps target titles by shared meaningful words
 * (full substring match is too strict: "PS Manager" vs "Head of Professional Services").
 */
function bestTargetTitleWordOverlap(
  jobTitle: string,
  targets: string[],
): { ratio: number; matched: string[]; bestTarget: string | null } {
  const jobToks = new Set(titleWordTokens(jobTitle))
  if (jobToks.size === 0 || !targets.length) {
    return { ratio: 0, matched: [], bestTarget: null }
  }
  let bestRatio = 0
  let bestMatched: string[] = []
  let bestTarget: string | null = null
  for (const t of targets) {
    const tt = titleWordTokens(t)
    if (tt.length === 0) continue
    const matched = tt.filter((w) => jobToks.has(w))
    const ratio = matched.length / tt.length
    if (
      ratio > bestRatio ||
      (ratio === bestRatio && matched.length > bestMatched.length)
    ) {
      bestRatio = ratio
      bestMatched = matched
      bestTarget = t
    }
  }
  return { ratio: bestRatio, matched: bestMatched, bestTarget }
}

type OverlapSpread = 'linear' | 'sqrt'

function overlapScore(
  text: string,
  terms: string[],
  max: number,
  spread: OverlapSpread = 'linear',
): { score: number; hits: string[] } {
  if (!terms.length) return { score: max * 0.5, hits: [] }
  const h = norm(text)
  const hits = terms.filter((t) => t && h.includes(norm(t)))
  const rawRatio =
    spread === 'sqrt'
      ? Math.min(1, hits.length / Math.sqrt(terms.length))
      : hits.length / terms.length
  return { score: Math.round(max * Math.min(1, rawRatio + 0.15)), hits }
}

function excludedTitlePenalty(title: string, excluded: string[]): number {
  if (!excluded.length) return 0
  const t = norm(title)
  let pen = 0
  for (const e of excluded) {
    if (e && t.includes(norm(e))) pen += 8
  }
  return Math.min(25, pen)
}

export function scoreTitleFit(
  job: Pick<Job, 'title'>,
  profile: SearchProfile,
  max: number,
): { value: number; detail: string } {
  const excludedPen = excludedTitlePenalty(job.title, profile.excludedTitles)
  if (profile.targetTitles.length === 0) {
    const base = Math.max(0, Math.round(max * 0.55) - excludedPen)
    return {
      value: base,
      detail:
        excludedPen > 0
          ? 'No target titles set; title partially excluded.'
          : 'No target titles set; neutral baseline.',
    }
  }
  const phrase = overlapScore(job.title, profile.targetTitles, max, 'linear')
  const { ratio: wordRatio, matched: wordHits, bestTarget } = bestTargetTitleWordOverlap(
    job.title,
    profile.targetTitles,
  )
  /** Word overlap with best target phrase — avoids requiring the entire target string in the title */
  let wordScore = 0
  if (wordRatio >= 0.66) wordScore = Math.round(max * 0.82)
  else if (wordRatio >= 0.5) wordScore = Math.round(max * 0.68)
  else if (wordRatio >= 0.34) wordScore = Math.round(max * 0.52)
  else if (wordRatio > 0) wordScore = Math.round(max * (0.2 + wordRatio * 0.45))

  const combined = Math.max(phrase.score, wordScore)
  const adjusted = Math.max(0, combined - excludedPen)
  const detail =
    phrase.hits.length > 0
      ? `Exact phrase match: ${phrase.hits.slice(0, 3).join(', ')}`
      : wordRatio > 0 && bestTarget
        ? `Title aligns with “${bestTarget}” via keywords: ${wordHits.slice(0, 5).join(', ')}`
        : 'Weak match to target titles.'
  return {
    value: Math.min(max, adjusted),
    detail,
  }
}

export function scoreSeniorityFit(
  job: Pick<Job, 'title' | 'description'>,
  profile: SearchProfile,
  max: number,
): { value: number; detail: string } {
  const blob = `${job.title} ${job.description}`.slice(0, 8000)
  if (!profile.targetSeniority.length) {
    return {
      value: Math.round(max * 0.55),
      detail: 'Seniority preferences not set.',
    }
  }
  let best = 0
  const matched: string[] = []
  for (const level of profile.targetSeniority) {
    const kws = SENIORITY_KEYWORDS[level] ?? []
    for (const kw of kws) {
      if (norm(blob).includes(norm(kw))) {
        matched.push(level)
        best = Math.max(best, max)
        break
      }
    }
  }
  if (matched.length === 0) {
    return {
      value: Math.round(max * 0.35),
      detail: 'Could not confirm target seniority in title or description.',
    }
  }
  return {
    value: max,
    detail: `Signals align with: ${[...new Set(matched)].join(', ')}`,
  }
}

export function scoreDomainFit(
  job: Pick<Job, 'title' | 'description' | 'company'>,
  profile: SearchProfile,
  max: number,
): { value: number; detail: string } {
  const blob = `${job.title} ${job.company} ${job.description}`.slice(0, 12000)
  let fn = 0
  let ind = 0
  const fnHits: string[] = []
  const indHits: string[] = []

  if (profile.preferredFunctions.length) {
    const { score, hits } = overlapScore(
      blob,
      profile.preferredFunctions,
      max * 0.6,
      'sqrt',
    )
    fn = score
    fnHits.push(...hits)
  } else {
    fn = Math.round(max * 0.35)
  }

  if (profile.preferredIndustries.length) {
    const { score, hits } = overlapScore(
      blob,
      profile.preferredIndustries,
      max * 0.55,
      'sqrt',
    )
    ind = score
    indHits.push(...hits)
  } else {
    ind = Math.round(max * 0.35)
  }

  const combined = Math.min(max, Math.round(fn * 0.55 + ind * 0.45))
  const parts: string[] = []
  if (fnHits.length) parts.push(`Functions: ${fnHits.slice(0, 3).join(', ')}`)
  if (indHits.length) parts.push(`Industries: ${indHits.slice(0, 3).join(', ')}`)
  return {
    value: combined,
    detail:
      parts.length > 0
        ? parts.join(' · ')
        : 'Add preferred functions/industries in Profile for sharper domain fit.',
  }
}

/**
 * True if the job text mentions at least one preferred geography term (title + location + description).
 * Used by the jobs feed filter. Empty profile list → always true.
 */
export function jobMatchesPreferredGeographies(
  job: Pick<Job, 'title' | 'location' | 'description'>,
  profile: SearchProfile,
): boolean {
  if (!profile.preferredGeographies.length) return true
  const blob = `${job.title} ${job.location} ${job.description}`.slice(0, 12000)
  const h = norm(blob)
  return profile.preferredGeographies.some((t) => t && h.includes(norm(t)))
}

export function scoreLocationFit(
  job: Pick<Job, 'title' | 'location' | 'description'>,
  profile: SearchProfile,
  max: number,
): { value: number; detail: string } {
  /** Titles often contain country/region (e.g. "| United States"); location field alone misses that. */
  const blob = `${job.title} ${job.location} ${job.description}`.slice(0, 8000)
  const remoteSignals = ['remote', 'anywhere', 'distributed', 'work from home']
  const hybridSignals = ['hybrid']
  const isRemote = includesAny(blob, remoteSignals)
  const isHybrid = includesAny(blob, hybridSignals)

  let prefBonus = 0
  if (profile.remotePreference === 'remote_first' && isRemote) prefBonus = 4
  if (profile.remotePreference === 'hybrid_ok' && (isHybrid || isRemote)) prefBonus = 3
  if (profile.remotePreference === 'onsite_ok' && !isRemote) prefBonus = 2
  if (profile.remotePreference === 'flexible') prefBonus = 1

  if (!profile.preferredGeographies.length) {
    const base = Math.min(max, Math.round(max * 0.5) + prefBonus)
    return {
      value: base,
      detail: isRemote
        ? 'Remote role; geography list not customized.'
        : 'Geography preferences not set.',
    }
  }

  const h = norm(blob)
  const hits = profile.preferredGeographies.filter((t) => t && h.includes(norm(t)))
  if (hits.length > 0) {
    const rawRatio = hits.length / profile.preferredGeographies.length
    const base = Math.round(max * Math.min(1, rawRatio + 0.12))
    const adjusted = Math.min(max, base + Math.min(prefBonus, 3))
    return {
      value: adjusted,
      detail: `Location/geo match: ${hits.join(', ')}`,
    }
  }

  /** No geography keyword hit: do not use the generic overlap “floor” — mismatch should score low. */
  const cappedBonus = Math.min(prefBonus, isRemote ? 2 : 0)
  const value = isRemote
    ? Math.min(max, Math.round(max * 0.18) + cappedBonus)
    : Math.min(max, Math.round(max * 0.06))
  return {
    value,
    detail: isRemote
      ? 'Remote role, but no match to your preferred geography keywords (title/location/description).'
      : 'No match to preferred geographies — role looks tied to another region.',
  }
}

export function scoreKeywordFit(
  job: Pick<Job, 'title' | 'description'>,
  profile: SearchProfile,
  max: number,
): { value: number; detail: string } {
  const blob = `${job.title} ${job.description}`.slice(0, 12000)
  let boost = 0
  const boostHits: string[] = []
  for (const k of profile.keywordsBoost) {
    if (k && norm(blob).includes(norm(k))) {
      boost += Math.ceil(max / Math.max(3, profile.keywordsBoost.length))
      boostHits.push(k)
    }
  }
  let penal = 0
  const penalHits: string[] = []
  for (const k of profile.keywordsPenalize) {
    if (k && norm(blob).includes(norm(k))) {
      penal += Math.ceil(max / Math.max(3, profile.keywordsPenalize.length))
      penalHits.push(k)
    }
  }
  const raw = Math.round(max * 0.45) + boost - penal
  const value = Math.max(0, Math.min(max, raw))
  const detailParts: string[] = []
  if (boostHits.length) detailParts.push(`Boost: ${[...new Set(boostHits)].slice(0, 5).join(', ')}`)
  if (penalHits.length)
    detailParts.push(`Penalized: ${[...new Set(penalHits)].slice(0, 5).join(', ')}`)
  return {
    value,
    detail:
      detailParts.length > 0
        ? detailParts.join(' · ')
        : 'No keyword boosts/penalties triggered.',
  }
}

export function scoreStrategicFit(
  job: Pick<Job, 'title' | 'description' | 'company'>,
  profile: SearchProfile,
  max: number,
): { value: number; detail: string } {
  const blob = `${job.title} ${job.company} ${job.description}`.slice(0, 12000)
  let score = Math.round(max * 0.45)
  const notes: string[] = []

  if (profile.idealCompanyStage.length) {
    const { score: st, hits } = overlapScore(blob, profile.idealCompanyStage, max)
    score = Math.round(st * 0.85)
    if (hits.length) notes.push(`Stage signals: ${hits.join(', ')}`)
  }

  if (profile.personalSummary.trim().length > 20) {
    const summaryWords = profile.personalSummary
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3)
    const unique = [...new Set(summaryWords)].slice(0, 60)
    let overlap = 0
    const h = norm(blob)
    for (const w of unique) {
      if (h.includes(w)) overlap++
    }
    const bump = Math.min(6, Math.floor(overlap / 3))
    score = Math.min(max, score + bump)
    if (bump > 0) notes.push('Overlaps with your personal summary themes.')
  }

  return {
    value: Math.min(max, score),
    detail:
      notes.length > 0
        ? notes.join(' ')
        : 'Strategic fit uses stage + summary overlap heuristics.',
  }
}

export interface ScoreDimensionExplanation {
  id: 'title' | 'seniority' | 'domain' | 'location' | 'keyword' | 'strategic'
  label: string
  score: number
  max: number
  explanation: string
}

export interface FullScoreResult {
  total: number
  breakdown: ScoreBreakdown
  /** Per-dimension narrative for the scoring panel */
  dimensions: ScoreDimensionExplanation[]
  fitSummary: string
  strengths: string[]
  concerns: string[]
  insightSnippet: string
  redFlags: string[]
}

export function scoreJobAgainstProfile(
  job: Pick<
    Job,
    'title' | 'company' | 'location' | 'description'
  >,
  profile: SearchProfile,
  weights = DEFAULT_SCORE_WEIGHTS,
): FullScoreResult {
  const w = weights
  const t = scoreTitleFit(job, profile, w.title)
  const s = scoreSeniorityFit(job, profile, w.seniority)
  const d = scoreDomainFit(job, profile, w.domain)
  const l = scoreLocationFit(job, profile, w.location)
  const k = scoreKeywordFit(job, profile, w.keyword)
  const st = scoreStrategicFit(job, profile, w.strategic)

  const breakdown: ScoreBreakdown = {
    titleFit: t.value,
    seniorityFit: s.value,
    domainFit: d.value,
    locationFit: l.value,
    keywordFit: k.value,
    strategicFit: st.value,
    weights: { ...w },
  }

  const dimensions: ScoreDimensionExplanation[] = [
    {
      id: 'title',
      label: 'Title fit',
      score: t.value,
      max: w.title,
      explanation: t.detail,
    },
    {
      id: 'seniority',
      label: 'Seniority fit',
      score: s.value,
      max: w.seniority,
      explanation: s.detail,
    },
    {
      id: 'domain',
      label: 'Domain fit',
      score: d.value,
      max: w.domain,
      explanation: d.detail,
    },
    {
      id: 'location',
      label: 'Location & work model',
      score: l.value,
      max: w.location,
      explanation: l.detail,
    },
    {
      id: 'keyword',
      label: 'Keyword signals',
      score: k.value,
      max: w.keyword,
      explanation: k.detail,
    },
    {
      id: 'strategic',
      label: 'Strategic fit',
      score: st.value,
      max: w.strategic,
      explanation: st.detail,
    },
  ]

  const total = Math.round(
    t.value + s.value + d.value + l.value + k.value + st.value,
  )

  const strengths: string[] = []
  const concerns: string[] = []

  if (t.value >= w.title * 0.72) strengths.push(t.detail)
  else concerns.push(t.detail)

  if (s.value >= w.seniority * 0.72) strengths.push(s.detail)
  else concerns.push(s.detail)

  if (d.value >= w.domain * 0.65) strengths.push(d.detail)
  else concerns.push(d.detail)

  if (l.value >= w.location * 0.65) strengths.push(l.detail)
  else concerns.push(l.detail)

  if (k.value >= w.keyword * 0.65) strengths.push(k.detail)
  if (k.detail.includes('Penalized')) concerns.push(k.detail)

  if (st.value >= w.strategic * 0.65) strengths.push(st.detail)

  const fitSummary = `Match score ${total}/100. ${t.detail} ${d.detail}`

  const insightSnippet =
    total >= 78
      ? 'Strong alignment across multiple dimensions — worth a careful read and tailored outreach.'
      : total >= 60
        ? 'Solid potential fit; validate scope, level, and stack against your goals before investing time.'
        : 'Mixed signals — use this as a discovery role unless something uniquely compelling stands out.'

  const redFlags: string[] = []
  if (profile.excludedTitles.some((e) => e && norm(job.title).includes(norm(e)))) {
    redFlags.push('Title overlaps your excluded title list.')
  }
  if (k.detail.includes('Penalized')) {
    redFlags.push('Contains keywords you penalize — sanity-check responsibilities vs. title.')
  }
  if (s.value < w.seniority * 0.4) {
    redFlags.push('Seniority may be misaligned with your stated targets.')
  }
  if (
    profile.preferredGeographies.length > 0 &&
    !jobMatchesPreferredGeographies(job, profile)
  ) {
    redFlags.push(
      'Location/title does not mention any preferred geography — confirm region before investing time.',
    )
  }

  return {
    total,
    breakdown,
    dimensions,
    fitSummary: fitSummary.slice(0, 480),
    strengths: strengths.slice(0, 6),
    concerns: concerns.slice(0, 6),
    insightSnippet,
    redFlags: redFlags.slice(0, 4),
  }
}

export function rescoreJob(job: Job, profile: SearchProfile): Job {
  const r = scoreJobAgainstProfile(job, profile)
  return {
    ...job,
    score: r.total,
    fitSummary: r.fitSummary,
    strengths: r.strengths,
    concerns: r.concerns,
    insightSnippet: r.insightSnippet,
    redFlags: r.redFlags,
    normalizedKey: jobDuplicateKey(job.company, job.title, job.location),
  }
}

export function rescoreAllJobs(jobs: Job[], profile: SearchProfile): Job[] {
  return jobs.map((j) => rescoreJob(j, profile))
}
