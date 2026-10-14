/** Stable id stored on notes and used for dedupe: lowercase name + source. */
export function fiveEToolsId(name: string, source: string): string {
  return `${name.trim().toLowerCase()}|${source.trim()}`;
}
