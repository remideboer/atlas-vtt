import { typeTextOf } from './monsterFields';
import { renderFiveEToolsEntries, renderFiveEToolsText } from './renderTags';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function typeLineOf(value: unknown): string {
  const base = typeTextOf(value);
  const record = asRecord(value);
  if (!record) return base;
  const tags = record.tags;
  if (!Array.isArray(tags) || tags.length === 0) return base;
  const parts = tags
    .map((tag) => {
      if (typeof tag === 'string') return tag;
      const inner = asRecord(tag);
      return typeof inner?.tag === 'string' ? inner.tag : '';
    })
    .filter(Boolean);
  return parts.length > 0 ? `${base} (${parts.join(', ')})` : base;
}

export function hpLineOf(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') return value;
  const record = asRecord(value);
  if (!record) return '';
  const average = typeof record.average === 'number' && Number.isFinite(record.average)
    ? String(record.average)
    : '';
  const formula = typeof record.formula === 'string' ? record.formula.trim() : '';
  if (average && formula) return `${average} (${formula})`;
  return average || formula;
}

export function speedLineOf(value: unknown): string {
  if (typeof value === 'string') return renderFiveEToolsText(value);
  const record = asRecord(value);
  if (!record) return '';
  const parts: string[] = [];
  const walk = record.walk;
  if (typeof walk === 'number' && Number.isFinite(walk)) parts.push(`${walk} ft.`);
  else if (typeof walk === 'string') parts.push(renderFiveEToolsText(walk));
  for (const [key, amount] of Object.entries(record)) {
    if (key === 'walk' || key === 'canHover') continue;
    if (typeof amount === 'number' && Number.isFinite(amount)) parts.push(`${key} ${amount} ft.`);
    else if (typeof amount === 'string') parts.push(`${key} ${renderFiveEToolsText(amount)}`);
    else if (asRecord(amount)?.number != null) {
      const n = (amount as { number?: unknown }).number;
      if (typeof n === 'number' && Number.isFinite(n)) parts.push(`${key} ${n} ft.`);
    }
  }
  return parts.join(', ');
}

export function statsOf(raw: Record<string, unknown>): number[] | null {
  const keys = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
  const stats: number[] = [];
  for (const key of keys) {
    const value = raw[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    stats.push(value);
  }
  return stats;
}

export function saveMapOf(value: unknown): Record<string, string> | null {
  const record = asRecord(value);
  if (!record) return null;
  const out: Record<string, string> = {};
  for (const [key, amount] of Object.entries(record)) {
    if (typeof amount === 'number' && Number.isFinite(amount)) {
      out[key] = amount >= 0 ? `+${amount}` : String(amount);
    } else if (typeof amount === 'string' && amount.trim()) {
      out[key] = amount.trim();
    }
  }
  return Object.keys(out).length > 0 ? out : null;
}

export function damageListOf(value: unknown): string {
  if (typeof value === 'string') return renderFiveEToolsText(value);
  if (!Array.isArray(value)) return '';
  const parts: string[] = [];
  for (const entry of value) {
    if (typeof entry === 'string') {
      parts.push(renderFiveEToolsText(entry));
      continue;
    }
    const record = asRecord(entry);
    if (!record) continue;
    if (typeof record.special === 'string') {
      parts.push(renderFiveEToolsText(record.special));
      continue;
    }
    const immune = record.immune ?? record.resist ?? record.vulnerable;
    if (Array.isArray(immune)) {
      const nested = damageListOf(immune);
      if (nested) parts.push(nested);
    } else if (typeof immune === 'string') {
      parts.push(renderFiveEToolsText(immune));
    }
  }
  return parts.filter(Boolean).join('; ');
}

export function conditionListOf(value: unknown): string {
  if (typeof value === 'string') return renderFiveEToolsText(value);
  if (!Array.isArray(value)) return '';
  return value
    .map((entry) => {
      if (typeof entry === 'string') return renderFiveEToolsText(entry);
      const record = asRecord(entry);
      if (typeof record?.conditionImmune === 'string') return renderFiveEToolsText(record.conditionImmune);
      if (Array.isArray(record?.conditionImmune)) return conditionListOf(record.conditionImmune);
      return '';
    })
    .filter(Boolean)
    .join(', ');
}

export function sensesLineOf(value: unknown, passive: unknown): string {
  const parts: string[] = [];
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === 'string') parts.push(renderFiveEToolsText(entry));
    }
  } else if (typeof value === 'string') {
    parts.push(renderFiveEToolsText(value));
  }
  if (typeof passive === 'number' && Number.isFinite(passive)) {
    parts.push(`passive Perception ${passive}`);
  }
  return parts.join(', ');
}

export function languagesLineOf(value: unknown): string {
  if (typeof value === 'string') return renderFiveEToolsText(value);
  if (!Array.isArray(value)) return '';
  return value
    .map((entry) => (typeof entry === 'string' ? renderFiveEToolsText(entry) : ''))
    .filter(Boolean)
    .join(', ');
}

export function initiativeLineOf(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value >= 0 ? `+${value}` : String(value);
  }
  const record = asRecord(value);
  if (!record) return '';
  if (typeof record.initiative === 'number' && Number.isFinite(record.initiative)) {
    const n = record.initiative;
    return n >= 0 ? `+${n}` : String(n);
  }
  return '';
}

export interface NamedBlock {
  name: string;
  desc: string;
}

export function namedBlocksOf(value: unknown): NamedBlock[] {
  if (!Array.isArray(value)) return [];
  const out: NamedBlock[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    if (!record) continue;
    const name = typeof record.name === 'string' ? renderFiveEToolsText(record.name) : '';
    const desc = renderFiveEToolsEntries(record.entries ?? record.entry);
    if (!name && !desc) continue;
    out.push({ name: name || 'Ability', desc });
  }
  return out;
}

export function spellcastingBlocksOf(value: unknown): NamedBlock[] {
  if (!Array.isArray(value)) return [];
  const out: NamedBlock[] = [];
  for (const entry of value) {
    const record = asRecord(entry);
    if (!record) continue;
    const name = typeof record.name === 'string' ? renderFiveEToolsText(record.name) : 'Spellcasting';
    const header = renderFiveEToolsEntries(record.headerEntries);
    const levels: string[] = [];
    const spells = asRecord(record.spells);
    if (spells) {
      for (const [slot, payload] of Object.entries(spells)) {
        const pack = asRecord(payload);
        const list = Array.isArray(pack?.spells)
          ? pack.spells.map((spell) => (typeof spell === 'string' ? renderFiveEToolsText(spell) : '')).filter(Boolean)
          : [];
        if (list.length === 0) continue;
        const slots = typeof pack?.slots === 'number' ? ` (${pack.slots} slots)` : '';
        levels.push(`${slot}${slots}: ${list.join(', ')}`);
      }
    }
    const will = Array.isArray(record.will)
      ? record.will.map((spell) => (typeof spell === 'string' ? renderFiveEToolsText(spell) : '')).filter(Boolean)
      : [];
    if (will.length > 0) levels.unshift(`At will: ${will.join(', ')}`);
    const daily = asRecord(record.daily);
    if (daily) {
      for (const [key, list] of Object.entries(daily)) {
        if (!Array.isArray(list)) continue;
        const names = list.map((spell) => (typeof spell === 'string' ? renderFiveEToolsText(spell) : '')).filter(Boolean);
        if (names.length > 0) levels.push(`${key}/day: ${names.join(', ')}`);
      }
    }
    const desc = [header, ...levels].filter(Boolean).join(' ');
    if (desc) out.push({ name, desc });
  }
  return out;
}
