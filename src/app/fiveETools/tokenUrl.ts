/**
 * Public token art URL, matching 5e.tools
 * (`/img/bestiary/tokens/{SOURCE}/{Name}.webp`).
 */
export function tokenImageUrl(base: string, source: string, name: string): string {
  const root = base.replace(/\/+$/, '');
  const encodedName = encodeURIComponent(name.trim());
  return `${root}/img/bestiary/tokens/${source.trim()}/${encodedName}.webp`;
}
