/**
 * Map profile geography strings → Adzuna API `country` path segment (e.g. il, us).
 * https://developer.adzuna.com/docs/search — one country per request.
 */

import type { Profile } from '@prisma/client'
import type { SearchProfile } from '../scoring/matchEngine'
import type { AdzunaSearchConfig } from './adzuna'

/**
 * Merge stored job-board searchConfig with the user's profile locations so crawls
 * respect preferred geographies (e.g. Israel) instead of a stale default `us`.
 */
export function mergeAdzunaConfigWithProfile(
  config: Record<string, unknown>,
  profile: SearchProfile | null,
  profileRow: Profile | null,
): AdzunaSearchConfig {
  const what =
    (typeof config.what === 'string' ? config.what : undefined) ??
    (typeof config.search === 'string' ? config.search : undefined)

  const explicitWhere =
    (typeof config.where === 'string' ? config.where : undefined) ??
    (typeof config.location === 'string' ? config.location : undefined)

  const rawCountry = typeof config.country === 'string' ? config.country : ''
  const explicitCountry = rawCountry.toLowerCase().replace(/[^a-z]/g, '')

  const ignoreProfile = config.ignoreProfileLocation === true

  let country = explicitCountry.length >= 2 ? explicitCountry : 'us'
  let where = explicitWhere?.trim()

  const limit = typeof config.limit === 'number' ? config.limit : 50

  if (ignoreProfile || !profile) {
    return { what, where, country, limit }
  }

  const geos = profile.preferredGeographies?.map((g) => g.trim()).filter(Boolean) ?? []
  const primaryGeo = geos[0]
  const mappedFromGeo = primaryGeo ? mapGeographyToAdzuna(primaryGeo) : null
  const mappedFromCurrent =
    !mappedFromGeo && profileRow?.currentLocation?.trim()
      ? mapGeographyToAdzuna(profileRow.currentLocation)
      : null
  const mapped = mappedFromGeo ?? mappedFromCurrent

  if (mapped) {
    // Stale "us" from the add-source default, or missing country → use profile
    const looksLikeDefaultUs = !explicitCountry || explicitCountry === 'us'
    if (looksLikeDefaultUs) {
      country = mapped.country
    }
    if (!where) {
      where = mapped.whereSuggestion ?? primaryGeo ?? profileRow?.currentLocation?.trim()
    }
  }

  return { what, where, country, limit }
}

function mapGeographyToAdzuna(text: string): { country: string; whereSuggestion?: string } | null {
  const t = text.toLowerCase().trim()

  if (
    /\bisrael\b|tel aviv|jerusalem|jérusalem|haifa|beer-?sheva|beersheba|herzliya|herzlia|netanya|ra'?anana|raanana|holon|petah tikvah|petach tikva|rehovot|ashdod|eilat|ramat gan|givatyim|givatayim|modi'?in|kfar saba|nes ziona|ashkelon|bat yam|bnei brak|ramat hasharon/i.test(
      t,
    )
  ) {
    return { country: 'il', whereSuggestion: text.trim() }
  }

  if (
    /\b(united states|u\.s\.|usa|america)\b|\b(california|texas|florida|new york|washington state|colorado|massachusetts|illinois)\b/i.test(
      t,
    )
  ) {
    return { country: 'us', whereSuggestion: text.trim() }
  }

  if (/\b(united kingdom|u\.k\.|england|scotland|wales|northern ireland|london|manchester|birmingham|edinburgh)\b/i.test(t)) {
    return { country: 'gb', whereSuggestion: text.trim() }
  }

  if (/\b(germany|deutschland|berlin|munich|münchen|hamburg|frankfurt)\b/i.test(t)) return { country: 'de', whereSuggestion: text.trim() }
  if (/\b(france|français|paris|lyon|marseille)\b/i.test(t)) return { country: 'fr', whereSuggestion: text.trim() }
  if (/\b(india|bangalore|bengaluru|mumbai|delhi|hyderabad)\b/i.test(t)) return { country: 'in', whereSuggestion: text.trim() }
  if (/\b(australia|sydney|melbourne|brisbane|perth)\b/i.test(t)) return { country: 'au', whereSuggestion: text.trim() }
  if (/\b(canada|toronto|vancouver|montreal|calgary)\b/i.test(t)) return { country: 'ca', whereSuggestion: text.trim() }
  if (/\b(netherlands|holland|amsterdam|rotterdam|utrecht)\b/i.test(t)) return { country: 'nl', whereSuggestion: text.trim() }
  if (/\b(spain|españa|madrid|barcelona|valencia)\b/i.test(t)) return { country: 'es', whereSuggestion: text.trim() }
  if (/\b(italy|italia|rome|milan|milano|turin)\b/i.test(t)) return { country: 'it', whereSuggestion: text.trim() }
  if (/\b(brazil|brasil|são paulo|sao paulo|rio de janeiro)\b/i.test(t)) return { country: 'br', whereSuggestion: text.trim() }
  if (/\b(singapore)\b/i.test(t)) return { country: 'sg', whereSuggestion: text.trim() }
  if (/\b(south africa|johannesburg|cape town)\b/i.test(t)) return { country: 'za', whereSuggestion: text.trim() }
  if (/\b(poland|polska|warsaw|krakow|kraków)\b/i.test(t)) return { country: 'pl', whereSuggestion: text.trim() }

  if (t === 'israel' || t.startsWith('israel')) return { country: 'il', whereSuggestion: 'Israel' }

  return null
}
