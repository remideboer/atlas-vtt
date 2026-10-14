import type { FiveEMonster } from './types';
import { FIVE_E_TOOLS_ID_KEY } from './types';

/** Escape a YAML double-quoted scalar. */
function yamlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** YAML scalar for HP: bare number when digits-only, else a quoted string. */
function hpYaml(value: string): string {
  const trimmed = value.trim();
  return /^\d+(?:\.\d+)?$/.test(trimmed) ? trimmed : yamlString(trimmed);
}

/**
 * Minimal Fantasy Statblocks note: frontmatter fields Atlas and FS can read,
 * plus `5etools_id` for dedupe. No 5etools tag expansion.
 */
export function monsterToStatblockMarkdown(monster: FiveEMonster, imageVaultPath: string | null): string {
  const lines = [
    '---',
    'statblock: true',
    'layout: "Basic 5e Layout"',
    `name: ${yamlString(monster.name)}`,
    `size: ${yamlString(monster.size)}`,
    `type: ${yamlString(monster.type)}`,
    ...(monster.alignment ? [`alignment: ${yamlString(monster.alignment)}`] : []),
    ...(monster.ac ? [`ac: ${yamlString(monster.ac)}`] : []),
    ...(monster.hp ? [`hp: ${hpYaml(monster.hp)}`] : []),
    ...(monster.cr ? [`cr: ${yamlString(monster.cr)}`] : []),
    ...(imageVaultPath ? [`image: ${yamlString(imageVaultPath)}`] : []),
    `${FIVE_E_TOOLS_ID_KEY}: ${yamlString(monster.uid)}`,
    '---',
    '',
    `Imported from 5e.tools (${monster.source}).`,
    '',
  ];
  return lines.join('\n');
}

/** Safe file stem for a vault path segment. */
export function safeNoteFileName(name: string): string {
  let cleaned = '';
  for (const ch of name.trim()) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 32 || '<>:"/\\|?*'.includes(ch)) continue;
    cleaned += ch;
  }
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned || 'creature';
}
