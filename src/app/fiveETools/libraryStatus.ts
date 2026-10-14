/** Whether a 5e.tools creature already has a vault note and/or library token. */
export type FiveELibraryStatus = 'none' | 'note' | 'token';

/** Pure mapping used by the picker badge and unit tests. */
export function libraryStatusOf(hasNote: boolean, hasToken: boolean): FiveELibraryStatus {
  if (hasToken) return 'token';
  if (hasNote) return 'note';
  return 'none';
}

export const RECENT_FIVE_E_LIMIT = 12;

/** Newest uid first, deduped, capped. */
export function withRecentFiveEUid(uids: readonly string[], uid: string): string[] {
  return [uid, ...uids.filter((entry) => entry !== uid)].slice(0, RECENT_FIVE_E_LIMIT);
}
