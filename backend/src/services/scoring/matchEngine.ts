/** Ported from frontend src/services/scoring/matchEngine.ts — no browser dependencies */

export type SeniorityLevel =
  | 'intern'
  | 'junior'
  | 'mid'
  | 'senior'
  | 'staff'
  | 'principal'
  | 'director'
  | 'executive'

export interface SearchProfile {
  targetTitles: string[]
  excludedTitles: string[]
  targetSeniority: SeniorityLevel[]
  preferredFunctions: string[]
  preferredIndustries: string[]
  preferredGeographies: string[]
  remotePreference: 'remote_first' | 'hybrid_ok' | 'onsite_ok' | 'flexible'
  idealCompanyStage: string[]
  keywordsBoost: string[]
  keywordsPenalize: string[]
  compensationNotes: string
  personalSummary: string
}

export interface ScoreWeights {
  title: number
  seniority: number
  domain: number
  location: number
  keyword: number
  strategic: number
}

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  title: 25,
  seniority: 15,
  domain: 20,
  location: 15,
  keyword: 15,
  strategic: 10,
}

export interface ScoreBreakdown {
  titleFit: number
  seniorityFit: number
  domainFit: number
  locationFit: number
  keywordFit: number
  strategicFit: number
  weights: ScoreWeights
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
  dimensions: ScoreDimensionExplanation[]
  fitSummary: string
  strengths: string[]
  concerns: string[]
  insightSnippet: string
  redFlags: string[]
}

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

const TITLE_TOKENS_STOP = new Set([
  'the', 'a', 'an', 'of', 'and', 'or', 'for', 'to', 'in', 'on', 'at', 'with',
  'full', 'time', 'part', 'contract', 'permanent', 'temporary', 'remote', 'hybrid', 'onsite',
])

function titleWordTokens(s: string): string[] {
  return norm(s)
    .replace(/\|/g, ' ')
    .split(/\W+/)
    .filter((w) => w.length > 2 && !TITLE_TOKENS_STOP.has(w))
}

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
    if (ratio > bestRatio || (ratio === bestRatio && matched.length > bestMatched.length)) {
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
  job: { title: string },
  profile: SearchProfile,
  max: number,
): { value: number; detail: string } {
  const excludedPen = excludedTitlePenalty(job.title, profile.excludedTitles)
  if (profile.targetTitles.length === 0) {
    const base = Math.max(0, Math.round(max * 0.55) - excludedPen)
    return {
      value: base,
      detail: excludedPen > 0
        ? 'No target titles set; title partially excluded.'
        : 'No target titles set; neutral baseline.',
    }
  }
  const phrase = overlapScore(job.title, profile.targetTitles, max, 'linear')
  const { ratio: wordRatio, matched: wordHits, bestTarget } = bestTargetTitleWordOverlap(
    job.title, profile.targetTitles,
  )
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
        ? `Title aligns with "${bestTarget}" via keywords: ${wordHits.slice(0, 5).join(', ')}`
        : 'Weak match to target titles.'
  return { value: Math.min(max, adjusted), detail }
}

export function scoreSeniorityFit(
  job: { title: string; description: string },
  profile: SearchProfile,
  max: number,
): { value: number; detail: string } {
  const blob = `${job.title} ${job.description}`.slice(0, 8000)
  if (!profile.targetSeniority.length) {
    return { value: Math.round(max * 0.55), detail: 'Seniority preferences not set.' }
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
  return { value: max, detail: `Signals align with: ${[...new Set(matched)].join(', ')}` }
}

export function scoreDomainFit(
  job: { title: string; description: string; company: string },
  profile: SearchProfile,
  max: number,
): { value: number; detail: string } {
  const blob = `${job.title} ${job.company} ${job.description}`.slice(0, 12000)
  let fn = 0
  let ind = 0
  const fnHits: string[] = []
  const indHits: string[] = []

  if (profile.preferredFunctions.length) {
    const { score, hits } = overlapScore(blob, profile.preferredFunctions, max * 0.6, 'sqrt')
    fn = score
    fnHits.push(...hits)
  } else {
    fn = Math.round(max * 0.35)
  }

  if (profile.preferredIndustries.length) {
    const { score, hits } = overlapScore(blob, profile.preferredIndustries, max * 0.55, 'sqrt')
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
    detail: parts.length > 0
      ? parts.join(' · ')
      : 'Add preferred functions/industries in Profile for sharper domain fit.',
  }
}

/**
 * True if the job is a plausible geography match for the profile.
 *
 * Rules (in order):
 * 1. Empty preferred list → always true.
 * 2. Remote-eligible jobs pass automatically when the user is open to remote
 *    (remotePreference !== 'onsite_ok'). Avoids hiding remote roles just because
 *    the user didn't explicitly type "Remote" in their geography list.
 * 3. At least one preferred geography term appears in title or location line.
 */
export function jobMatchesPreferredGeographies(
  job: { title: string; location: string; description?: string },
  profile: SearchProfile,
): boolean {
  if (!profile.preferredGeographies.length) return true

  if (profile.remotePreference !== 'onsite_ok') {
    const remoteSignals = ['remote', 'anywhere', 'distributed', 'work from home', 'work-from-home']
    const blob = `${job.title} ${job.location} ${job.description ?? ''}`.slice(0, 4000).toLowerCase()
    if (remoteSignals.some((s) => blob.includes(s))) return true
  }

  const headline = `${job.title} ${job.location}`.slice(0, 8000)
  const h = norm(headline)
  return profile.preferredGeographies.some((t) => t && h.includes(norm(t)))
}

export function scoreLocationFit(
  job: { title: string; location: string; description: string },
  profile: SearchProfile,
  max: number,
): { value: number; detail: string } {
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
      detail: isRemote ? 'Remote role; geography list not customized.' : 'Geography preferences not set.',
    }
  }

  const headline = `${job.title} ${job.location}`.slice(0, 8000)
  const hHead = norm(headline)
  const hits = profile.preferredGeographies.filter((t) => t && hHead.includes(norm(t)))
  if (hits.length > 0) {
    const rawRatio = hits.length / profile.preferredGeographies.length
    const base = Math.round(max * Math.min(1, rawRatio + 0.12))
    const adjusted = Math.min(max, base + Math.min(prefBonus, 3))
    return { value: adjusted, detail: `Location/geo match: ${hits.join(', ')}` }
  }

  const cappedBonus = Math.min(prefBonus, isRemote ? 2 : 0)
  const value = isRemote
    ? Math.min(max, Math.round(max * 0.18) + cappedBonus)
    : Math.min(max, Math.round(max * 0.06))
  return {
    value,
    detail: isRemote
      ? 'Remote role, but no match to your preferred geography keywords.'
      : 'No match to preferred geographies — role looks tied to another region.',
  }
}

export function scoreKeywordFit(
  job: { title: string; description: string },
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
  if (penalHits.length) detailParts.push(`Penalized: ${[...new Set(penalHits)].slice(0, 5).join(', ')}`)
  return {
    value,
    detail: detailParts.length > 0 ? detailParts.join(' · ') : 'No keyword boosts/penalties triggered.',
  }
}

export function scoreStrategicFit(
  job: { title: string; description: string; company: string },
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
    const summaryWords = profile.personalSummary.toLowerCase().split(/\W+/).filter((w) => w.length > 3)
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
    detail: notes.length > 0 ? notes.join(' ') : 'Strategic fit uses stage + summary overlap heuristics.',
  }
}

export interface JobForScoring {
  title: string
  company: string
  location: string
  description: string
}

export function scoreJobAgainstProfile(
  job: JobForScoring,
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
    { id: 'title', label: 'Title fit', score: t.value, max: w.title, explanation: t.detail },
    { id: 'seniority', label: 'Seniority fit', score: s.value, max: w.seniority, explanation: s.detail },
    { id: 'domain', label: 'Domain fit', score: d.value, max: w.domain, explanation: d.detail },
    { id: 'location', label: 'Location & work model', score: l.value, max: w.location, explanation: l.detail },
    { id: 'keyword', label: 'Keyword signals', score: k.value, max: w.keyword, explanation: k.detail },
    { id: 'strategic', label: 'Strategic fit', score: st.value, max: w.strategic, explanation: st.detail },
  ]

  const total = Math.round(t.value + s.value + d.value + l.value + k.value + st.value)

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

  const fitSummary = `Match score ${total}/100. ${t.detail} ${d.detail}`.slice(0, 480)

  const insightSnippet =
    total >= 78
      ? 'Strong alignment across multiple dimensions — worth a careful read and tailored outreach.'
      : total >= 60
        ? 'Solid potential fit; validate scope, level, and stack against your goals before investing time.'
        : 'Mixed signals — use this as a discovery role unless something uniquely compelling stands out.'

  const redFlags: string[] = []
  const normTitle = norm(job.title)
  if (profile.excludedTitles.some((e) => e && normTitle.includes(norm(e)))) {
    redFlags.push('Title overlaps your excluded title list.')
  }
  if (k.detail.includes('Penalized')) {
    redFlags.push('Contains keywords you penalize — sanity-check responsibilities vs. title.')
  }
  if (s.value < w.seniority * 0.4) {
    redFlags.push('Seniority may be misaligned with your stated targets.')
  }
  if (profile.preferredGeographies.length > 0 && !jobMatchesPreferredGeographies(job, profile)) {
    redFlags.push('Location/title does not mention any preferred geography — confirm region before investing time.')
  }

  return {
    total,
    breakdown,
    dimensions,
    fitSummary,
    strengths: strengths.slice(0, 6),
    concerns: concerns.slice(0, 6),
    insightSnippet,
    redFlags: redFlags.slice(0, 4),
  }
}

export function fitLabel(score: number): string {
  if (score >= 78) return 'high'
  if (score >= 55) return 'medium'
  return 'low'
}
