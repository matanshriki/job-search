import type { Profile } from '@prisma/client'
import type { SearchProfile, SeniorityLevel } from '../services/scoring/matchEngine'

export function buildProfileFromDb(row: Profile): SearchProfile {
  function parseJson<T>(s: string, fallback: T): T {
    try { return JSON.parse(s) } catch { return fallback }
  }
  return {
    targetTitles: parseJson<string[]>(row.preferredTitlesJson, []),
    excludedTitles: parseJson<string[]>(row.excludedTitlesJson, []),
    targetSeniority: parseJson<SeniorityLevel[]>(row.seniorityLevel, []),
    preferredFunctions: parseJson<string[]>(row.preferredFunctionsJson, []),
    preferredIndustries: parseJson<string[]>(row.preferredIndustriesJson, []),
    preferredGeographies: parseJson<string[]>(row.preferredLocationsJson, []),
    remotePreference: (row.remotePreference as SearchProfile['remotePreference']) || 'flexible',
    idealCompanyStage: parseJson<string[]>(row.idealCompanyStageJson, []),
    keywordsBoost: parseJson<string[]>(row.targetKeywordsJson, []),
    keywordsPenalize: parseJson<string[]>(row.excludedKeywordsJson, []),
    compensationNotes: row.compensationNotes ?? '',
    personalSummary: row.summary ?? '',
  }
}

/** Map the old frontend SearchProfile shape → DB row fields */
export function profileToDbFields(p: SearchProfile) {
  return {
    preferredTitlesJson: JSON.stringify(p.targetTitles),
    excludedTitlesJson: JSON.stringify(p.excludedTitles),
    seniorityLevel: JSON.stringify(p.targetSeniority),
    preferredFunctionsJson: JSON.stringify(p.preferredFunctions),
    preferredIndustriesJson: JSON.stringify(p.preferredIndustries),
    preferredLocationsJson: JSON.stringify(p.preferredGeographies),
    remotePreference: p.remotePreference,
    idealCompanyStageJson: JSON.stringify(p.idealCompanyStage),
    targetKeywordsJson: JSON.stringify(p.keywordsBoost),
    excludedKeywordsJson: JSON.stringify(p.keywordsPenalize),
    compensationNotes: p.compensationNotes,
    summary: p.personalSummary,
  }
}
