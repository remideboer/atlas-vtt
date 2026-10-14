import type { TokenEntity } from '../types';

/** Find the lowest unused instance number for tokens sharing the same imagePath. */
export function computeNextInstanceNumber(
  tokens: Record<string, TokenEntity>,
  imagePath: string,
  /** When renumbering a token that already holds this path, leave its old number out of the used set. */
  excludeId?: string,
): number {
  const usedNumbers = new Set(
    Object.entries(tokens)
      .filter(([id, t]) => t.imagePath === imagePath && id !== excludeId)
      .map(([, t]) => t.instanceNumber)
      .filter((n): n is number => n != null)
  );
  let num = 1;
  while (usedNumbers.has(num)) num++;
  return num;
}
