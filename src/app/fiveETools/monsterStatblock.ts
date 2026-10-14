import type { App } from 'obsidian';
import { listLayoutNames } from '../services/FantasyStatblocksService';
import {
  acTextOf,
  alignmentTextOf,
  crTextOf,
  sizeWordOf,
} from './monsterFields';
import {
  conditionListOf,
  damageListOf,
  hpLineOf,
  initiativeLineOf,
  languagesLineOf,
  namedBlocksOf,
  saveMapOf,
  sensesLineOf,
  speedLineOf,
  spellcastingBlocksOf,
  statsOf,
  typeLineOf,
  type NamedBlock,
} from './monsterStatblockFields';
import { FIVE_E_TOOLS_ID_KEY } from './types';
import { fiveEToolsId } from './uid';

const DEFAULT_LAYOUT = 'Basic 5e Layout';
const FIVE_POINT_FIVE = /5\.5|2024/i;

/** Prefer a Fantasy Statblocks layout named for 5.5e/2024 when installed. */
export function layoutNameForFiveE(app: App): string {
  for (const name of listLayoutNames(app)) {
    if (FIVE_POINT_FIVE.test(name)) return name;
  }
  return DEFAULT_LAYOUT;
}

function yamlString(value: string): string {
  return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function yamlScalar(value: string): string {
  const trimmed = value.trim();
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) return trimmed;
  return yamlString(trimmed);
}

function yamlMap(name: string, map: Record<string, string>): string[] {
  const lines = [`${name}:`];
  for (const [key, value] of Object.entries(map)) {
    lines.push(`  ${key}: ${yamlString(value)}`);
  }
  return lines;
}

function yamlBlocks(name: string, blocks: NamedBlock[]): string[] {
  if (blocks.length === 0) return [];
  const lines = [`${name}:`];
  for (const block of blocks) {
    lines.push(`  - name: ${yamlString(block.name)}`);
    lines.push(`    desc: ${yamlString(block.desc)}`);
  }
  return lines;
}

export interface MonsterStatblockOptions {
  layout: string;
  imageVaultPath: string | null;
}

/**
 * Fantasy Statblocks frontmatter for a raw 5e.tools monster object.
 * Falls back to a minimal note when name/source are missing.
 */
export function monsterRawToStatblockMarkdown(
  raw: Record<string, unknown>,
  options: MonsterStatblockOptions,
): string {
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  const source = typeof raw.source === 'string' ? raw.source.trim() : '';
  if (!name || !source) {
    return [
      '---',
      'statblock: true',
      `layout: ${yamlString(options.layout)}`,
      '---',
      '',
    ].join('\n');
  }

  const uid = fiveEToolsId(name, source);
  const size = sizeWordOf(raw.size);
  const type = typeLineOf(raw.type);
  const alignment = alignmentTextOf(raw.alignment);
  const ac = acTextOf(raw.ac);
  const hp = hpLineOf(raw.hp);
  const speed = speedLineOf(raw.speed);
  const cr = crTextOf(raw.cr);
  const stats = statsOf(raw);
  const saves = saveMapOf(raw.save);
  const skills = saveMapOf(raw.skill);
  const senses = sensesLineOf(raw.senses, raw.passive);
  const languages = languagesLineOf(raw.languages);
  const initiative = initiativeLineOf(raw.initiative);
  const resistances = damageListOf(raw.resist);
  const immunities = damageListOf(raw.immune);
  const vulnerabilities = damageListOf(raw.vulnerable);
  const conditionImmunities = conditionListOf(raw.conditionImmune);

  const traits = [
    ...namedBlocksOf(raw.trait),
    ...spellcastingBlocksOf(raw.spellcasting),
  ];
  const actions = namedBlocksOf(raw.action);
  const bonusActions = namedBlocksOf(raw.bonus);
  const reactions = namedBlocksOf(raw.reaction);
  const legendary = namedBlocksOf(raw.legendary);

  const lines = [
    '---',
    'statblock: true',
    `layout: ${yamlString(options.layout)}`,
    `name: ${yamlString(name)}`,
    `size: ${yamlString(size)}`,
    `type: ${yamlString(type)}`,
    ...(alignment ? [`alignment: ${yamlString(alignment)}`] : []),
    ...(ac ? [`ac: ${yamlScalar(ac)}`] : []),
    ...(hp ? [`hp: ${yamlScalar(hp)}`] : []),
    ...(speed ? [`speed: ${yamlString(speed)}`] : []),
    ...(initiative ? [`initiative: ${yamlString(initiative)}`] : []),
    ...(stats ? [`stats: [${stats.join(', ')}]`] : []),
    ...(saves ? yamlMap('saves', saves) : []),
    ...(skills ? yamlMap('skillsaves', skills) : []),
    ...(senses ? [`senses: ${yamlString(senses)}`] : []),
    ...(typeof raw.passive === 'number' && Number.isFinite(raw.passive)
      ? [`passive: ${raw.passive}`]
      : []),
    ...(languages ? [`languages: ${yamlString(languages)}`] : []),
    ...(vulnerabilities ? [`damage_vulnerabilities: ${yamlString(vulnerabilities)}`] : []),
    ...(resistances ? [`damage_resistances: ${yamlString(resistances)}`] : []),
    ...(immunities ? [`damage_immunities: ${yamlString(immunities)}`] : []),
    ...(conditionImmunities ? [`condition_immunities: ${yamlString(conditionImmunities)}`] : []),
    ...(cr ? [`cr: ${yamlScalar(cr)}`] : []),
    ...(options.imageVaultPath ? [`image: ${yamlString(options.imageVaultPath)}`] : []),
    `${FIVE_E_TOOLS_ID_KEY}: ${yamlString(uid)}`,
    ...yamlBlocks('traits', traits),
    ...yamlBlocks('actions', actions),
    ...yamlBlocks('bonus_actions', bonusActions),
    ...yamlBlocks('reactions', reactions),
    ...yamlBlocks('legendary_actions', legendary),
    '---',
    '',
    `Imported from 5e.tools (${source}).`,
    '',
  ];
  return lines.join('\n');
}
