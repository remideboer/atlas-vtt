/** Stable host for token art (not configurable in the MVP). */
export const FIVE_E_TOOLS_IMAGE_BASE = 'https://5e.tools';

/** Vault folder that holds notes written from the local bestiary. */
export const FIVE_E_TOOLS_NOTE_ROOT = 'Bestiary/5etools';

/** Frontmatter key used to find a note again after the first insert. */
export const FIVE_E_TOOLS_ID_KEY = '5etools_id';

/**
 * One bestiary creature as Atlas needs it for search and a minimal Fantasy
 * Statblocks note. Raw 5etools fields are normalised where the note needs text.
 */
export interface FiveEMonster {
  name: string;
  source: string;
  /** Lowercase `name|SOURCE` uid. */
  uid: string;
  cr: string;
  /** Fantasy Statblocks size word when known (Medium, Large, …). */
  size: string;
  type: string;
  alignment: string;
  ac: string;
  hp: string;
  hasToken: boolean;
}
