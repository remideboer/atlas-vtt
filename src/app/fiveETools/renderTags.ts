/**
 * Turns 5e.tools tagged strings into plain Fantasy Statblocks text.
 * Unknown tags keep their display content; no raw `{@…}` remains.
 */

const ATK_LABELS: Record<string, string> = {
  mw: 'Melee Weapon Attack',
  rw: 'Ranged Weapon Attack',
  ms: 'Melee Spell Attack',
  rs: 'Ranged Spell Attack',
  mwrs: 'Melee or Ranged Weapon Attack',
  rsw: 'Melee or Ranged Spell Attack',
};

function displayName(payload: string): string {
  const pipe = payload.indexOf('|');
  const head = (pipe >= 0 ? payload.slice(0, pipe) : payload).trim();
  return head.replace(/\{@[^}]+\}/g, '').trim() || payload.trim();
}

function renderTag(tag: string, body: string): string {
  switch (tag) {
    case 'atk': {
      const parts = body.split(',').map((part) => part.trim()).filter(Boolean);
      const labels = parts.map((part) => ATK_LABELS[part] ?? part);
      return labels.length > 0 ? `${labels.join(' or ')}:` : 'Attack:';
    }
    case 'hit':
      return `+${body.trim()}`;
    case 'h':
      return 'Hit:';
    case 'damage':
    case 'dice':
      return body.trim();
    case 'dc':
      return `DC ${body.trim()}`;
    case 'recharge': {
      const trimmed = body.trim();
      return trimmed ? `(Recharge ${trimmed})` : '(Recharge)';
    }
    case 'spell':
    case 'condition':
    case 'skill':
    case 'item':
    case 'creature':
    case 'status':
    case 'sense':
    case 'action':
    case 'chance':
    case 'filter':
    case 'book':
    case 'i':
    case 'b':
    case 'u':
      return displayName(body);
    default:
      return displayName(body);
  }
}

/** Expand `{@tag …}` tags in `text` (nested tags resolved inside-out). */
export function renderFiveEToolsText(text: string): string {
  let current = text;
  for (let pass = 0; pass < 32; pass += 1) {
    const next = current.replace(/\{@([a-zA-Z0-9]+)(?:\s+([^}]*))?\}/g, (
      _match: string,
      tag: string,
      body: string | undefined,
    ): string => renderTag(tag, body ?? ''));
    if (next === current) break;
    current = next;
  }
  return current.replace(/\s+/g, ' ').trim();
}

/** Join entry fragments (strings / nested lists) into one rendered paragraph. */
export function renderFiveEToolsEntries(entries: unknown): string {
  if (entries == null) return '';
  if (typeof entries === 'string') return renderFiveEToolsText(entries);
  if (typeof entries === 'number' && Number.isFinite(entries)) return String(entries);
  if (!Array.isArray(entries)) {
    if (typeof entries === 'object' && entries !== null) {
      const record = entries as Record<string, unknown>;
      if (typeof record.entry === 'string') return renderFiveEToolsText(record.entry);
      if (Array.isArray(record.items)) return renderFiveEToolsEntries(record.items);
      if (Array.isArray(record.entries)) return renderFiveEToolsEntries(record.entries);
    }
    return '';
  }
  const parts: string[] = [];
  for (const entry of entries) {
    const piece = renderFiveEToolsEntries(entry);
    if (piece) parts.push(piece);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}
