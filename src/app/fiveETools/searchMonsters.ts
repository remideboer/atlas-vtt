import { parseRating } from '../creatures/creatureValues';
import type { FiveEMonster } from './types';

interface CrBound {
  min: number | null;
  max: number | null;
  exact: number | null;
}

interface SearchFilters {
  nameWords: string[];
  types: string[];
  sources: string[];
  cr: CrBound | null;
}

const KEYWORD = /^(type|source|cr)(>=|<=|:|=)(.+)$/i;

/** Parse `type:`, `source:`, and CR filters; leftover words match the name. */
function parseFilters(query: string): SearchFilters {
  const nameWords: string[] = [];
  const types: string[] = [];
  const sources: string[] = [];
  let cr: CrBound | null = null;

  for (const raw of query.trim().split(/\s+/).filter(Boolean)) {
    const match = KEYWORD.exec(raw);
    if (!match) {
      nameWords.push(raw.toLowerCase());
      continue;
    }
    const key = match[1];
    const op = match[2];
    const valueRaw = match[3];
    if (key === undefined || op === undefined || valueRaw === undefined) continue;
    const value = valueRaw.trim().toLowerCase();
    if (!value) continue;
    const kind = key.toLowerCase();
    if (kind === 'type') {
      types.push(value);
      continue;
    }
    if (kind === 'source') {
      sources.push(value);
      continue;
    }
    cr = parseCrFilter(op, value) ?? cr;
  }
  return { nameWords, types, sources, cr };
}

function parseCrFilter(op: string, value: string): CrBound | null {
  if (op === '>=' || op === '<=') {
    const n = parseRating(value);
    if (n === null) return null;
    return op === '>=' ? { min: n, max: null, exact: null } : { min: null, max: n, exact: null };
  }
  const range = /^(.+?)\s*-\s*(.+)$/.exec(value);
  if (range) {
    const low = range[1];
    const high = range[2];
    if (low === undefined || high === undefined) return null;
    const min = parseRating(low);
    const max = parseRating(high);
    if (min === null || max === null) return null;
    return { min: Math.min(min, max), max: Math.max(min, max), exact: null };
  }
  const exact = parseRating(value);
  return exact === null ? null : { min: null, max: null, exact };
}

function matchesCr(monster: FiveEMonster, bound: CrBound): boolean {
  const rating = parseRating(monster.cr);
  if (rating === null) return false;
  if (bound.exact !== null) return rating === bound.exact;
  if (bound.min !== null && rating < bound.min) return false;
  if (bound.max !== null && rating > bound.max) return false;
  return true;
}

function compareMonsters(a: FiveEMonster, b: FiveEMonster): number {
  const byName = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  if (byName !== 0) return byName;
  const ra = parseRating(a.cr);
  const rb = parseRating(b.cr);
  if (ra !== null || rb !== null) {
    const diff = (ra ?? Number.POSITIVE_INFINITY) - (rb ?? Number.POSITIVE_INFINITY);
    if (diff !== 0) return diff;
  }
  return a.source.localeCompare(b.source, undefined, { sensitivity: 'base' });
}

/**
 * Filter and sort the catalog: plain words match the name; `type:`, `source:`,
 * and `cr:` / `cr>=` / `cr<=` / `cr:a-b` filter fields. Bare source/CR (no
 * keyword) still match as before when they are the whole query word.
 */
export function searchMonsters(monsters: readonly FiveEMonster[], query: string): FiveEMonster[] {
  const trimmed = query.trim();
  // Empty query: keep load order (readBestiary already sorts by name/source); avoid a full re-sort.
  if (!trimmed) return monsters.slice();

  const filters = parseFilters(trimmed);
  const hasKeywords = filters.types.length > 0 || filters.sources.length > 0 || filters.cr !== null;

  const matched = monsters.filter((monster) => {
    if (filters.types.length > 0) {
      const type = monster.type.toLowerCase();
      if (!filters.types.some((wanted) => type.includes(wanted))) return false;
    }
    if (filters.sources.length > 0) {
      const source = monster.source.toLowerCase();
      if (!filters.sources.some((wanted) => source === wanted)) return false;
    }
    if (filters.cr && !matchesCr(monster, filters.cr)) return false;

    if (filters.nameWords.length === 0) return true;

    const name = monster.name.toLowerCase();
    const source = monster.source.toLowerCase();
    const cr = monster.cr.toLowerCase();
    return filters.nameWords.every((word) => (
      name.includes(word)
      || (!hasKeywords && (source === word || cr === word || `cr ${cr}` === word))
    ));
  });

  return matched.sort(compareMonsters);
}
