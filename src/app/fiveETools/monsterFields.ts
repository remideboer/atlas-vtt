const SIZE_LETTERS: Record<string, string> = {
  T: 'Tiny',
  S: 'Small',
  M: 'Medium',
  L: 'Large',
  H: 'Huge',
  G: 'Gargantuan',
};

const ALIGNMENT_LETTERS: Record<string, string> = {
  L: 'Lawful',
  N: 'Neutral',
  C: 'Chaotic',
  G: 'Good',
  E: 'Evil',
  U: 'Unaligned',
  A: 'Any',
};

/** First size letter/word from a 5etools `size` field → Fantasy Statblocks word. */
export function sizeWordOf(value: unknown): string {
  if (typeof value === 'string') {
    const letter = value.trim().toUpperCase();
    if (SIZE_LETTERS[letter]) return SIZE_LETTERS[letter];
    const word = value.trim();
    return word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : 'Medium';
  }
  if (Array.isArray(value) && value.length > 0) return sizeWordOf(value[0]);
  return 'Medium';
}

export function typeTextOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'type' in value) {
    const type = (value as { type?: unknown }).type;
    return typeof type === 'string' ? type : 'creature';
  }
  return 'creature';
}

export function alignmentTextOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!Array.isArray(value) || value.length === 0) return '';
  if (value.every((part) => typeof part === 'string' && part.length === 1)) {
    return value
      .map((letter) => ALIGNMENT_LETTERS[String(letter).toUpperCase()] ?? String(letter))
      .join(' ');
  }
  return value.map(String).join(' ');
}

export function acTextOf(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') return value;
  if (!Array.isArray(value) || value.length === 0) return '';
  const first: unknown = value[0];
  if (typeof first === 'number' && Number.isFinite(first)) return String(first);
  if (first && typeof first === 'object' && 'ac' in first) {
    const ac = (first as { ac?: unknown }).ac;
    if (typeof ac === 'number' && Number.isFinite(ac)) return String(ac);
  }
  return '';
}

export function hpTextOf(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'average' in value) {
    const average = (value as { average?: unknown }).average;
    if (typeof average === 'number' && Number.isFinite(average)) return String(average);
  }
  return '';
}

export function crTextOf(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && 'cr' in value) {
    return crTextOf((value as { cr?: unknown }).cr);
  }
  return '';
}

export function hasTokenFlag(value: unknown): boolean {
  return value === true;
}
