import {
  acTextOf,
  alignmentTextOf,
  crTextOf,
  hasTokenFlag,
  hpTextOf,
  sizeWordOf,
  typeTextOf,
} from './monsterFields';
import type { FiveEMonster } from './types';
import { fiveEToolsId } from './uid';

/** Reads a path under the 5etools `data/` directory as UTF-8 text. */
export type FiveEToolsDataReader = (pathFromData: string) => Promise<string>;

interface BestiaryIndex {
  [source: string]: string;
}

interface RawMonster {
  name?: unknown;
  source?: unknown;
  size?: unknown;
  type?: unknown;
  alignment?: unknown;
  ac?: unknown;
  hp?: unknown;
  cr?: unknown;
  hasToken?: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function parseMonster(raw: RawMonster): FiveEMonster | null {
  if (typeof raw.name !== 'string' || !raw.name.trim()) return null;
  if (typeof raw.source !== 'string' || !raw.source.trim()) return null;
  const name = raw.name.trim();
  const source = raw.source.trim();
  return {
    name,
    source,
    uid: fiveEToolsId(name, source),
    cr: crTextOf(raw.cr),
    size: sizeWordOf(raw.size),
    type: typeTextOf(raw.type),
    alignment: alignmentTextOf(raw.alignment),
    ac: acTextOf(raw.ac),
    hp: hpTextOf(raw.hp),
    hasToken: hasTokenFlag(raw.hasToken),
  };
}

function monstersFromFile(text: string): FiveEMonster[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return [];
  }
  const record = asRecord(parsed);
  const list = record?.monster;
  if (!Array.isArray(list)) return [];
  const out: FiveEMonster[] = [];
  for (const entry of list) {
    if (!entry || typeof entry !== 'object') continue;
    const monster = parseMonster(entry as RawMonster);
    if (monster) out.push(monster);
  }
  return out;
}

async function readBestiaryIndex(readText: FiveEToolsDataReader): Promise<BestiaryIndex> {
  const indexText = await readText('bestiary/index.json');
  let index: BestiaryIndex;
  try {
    index = JSON.parse(indexText) as BestiaryIndex;
  } catch {
    throw new Error('5e.tools bestiary index is not valid JSON');
  }
  if (!index || typeof index !== 'object') {
    throw new Error('5e.tools bestiary index is missing');
  }
  return index;
}

function rawMonstersFromFile(text: string): Record<string, unknown>[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    return [];
  }
  const record = asRecord(parsed);
  const list = record?.monster;
  if (!Array.isArray(list)) return [];
  const out: Record<string, unknown>[] = [];
  for (const entry of list) {
    const raw = asRecord(entry);
    if (!raw) continue;
    if (typeof raw.name !== 'string' || !raw.name.trim()) continue;
    if (typeof raw.source !== 'string' || !raw.source.trim()) continue;
    out.push(raw);
  }
  return out;
}

/**
 * Loads every file named in `bestiary/index.json` and merges their monsters.
 * Duplicate uids keep the first entry.
 */
export async function loadBestiaryCatalog(readText: FiveEToolsDataReader): Promise<FiveEMonster[]> {
  const index = await readBestiaryIndex(readText);

  const byUid = new Map<string, FiveEMonster>();
  for (const fileName of Object.values(index)) {
    if (typeof fileName !== 'string' || !fileName) continue;
    let text: string;
    try {
      text = await readText(`bestiary/${fileName}`);
    } catch {
      continue;
    }
    for (const monster of monstersFromFile(text)) {
      if (!byUid.has(monster.uid)) byUid.set(monster.uid, monster);
    }
  }
  return [...byUid.values()].sort((a, b) => a.name.localeCompare(b.name) || a.source.localeCompare(b.source));
}

/**
 * Full JSON object for one creature (for Fantasy Statblocks conversion).
 * Uses the uid's source to open one bestiary file when the index names it.
 */
export async function loadRawMonster(
  readText: FiveEToolsDataReader,
  uid: string,
): Promise<Record<string, unknown> | null> {
  const sep = uid.lastIndexOf('|');
  const sourceKey = sep >= 0 ? uid.slice(sep + 1) : '';
  const index = await readBestiaryIndex(readText);
  const preferred = sourceKey && typeof index[sourceKey] === 'string' ? [index[sourceKey]] : [];
  const rest = Object.values(index).filter(
    (fileName): fileName is string => typeof fileName === 'string' && fileName.length > 0 && !preferred.includes(fileName),
  );
  for (const fileName of [...preferred, ...rest]) {
    let text: string;
    try {
      text = await readText(`bestiary/${fileName}`);
    } catch {
      continue;
    }
    for (const raw of rawMonstersFromFile(text)) {
      const name = String(raw.name).trim();
      const source = String(raw.source).trim();
      if (fiveEToolsId(name, source) === uid) return raw;
    }
  }
  return null;
}
