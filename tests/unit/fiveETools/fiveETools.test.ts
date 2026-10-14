import { describe, expect, it } from 'vitest';
import { monsterToStatblockMarkdown, safeNoteFileName } from '../../../src/app/fiveETools/monsterNote';
import { monsterResources } from '../../../src/app/fiveETools/monsterResources';
import { layoutNameForFiveE, monsterRawToStatblockMarkdown } from '../../../src/app/fiveETools/monsterStatblock';
import { loadBestiaryCatalog, loadRawMonster } from '../../../src/app/fiveETools/readBestiary';
import { libraryStatusOf, withRecentFiveEUid } from '../../../src/app/fiveETools/libraryStatus';
import { renderFiveEToolsText } from '../../../src/app/fiveETools/renderTags';
import { searchMonsters } from '../../../src/app/fiveETools/searchMonsters';
import { tokenImageUrl } from '../../../src/app/fiveETools/tokenUrl';
import type { FiveEMonster } from '../../../src/app/fiveETools/types';
import { fiveEToolsId } from '../../../src/app/fiveETools/uid';
import type { ResourceDefinition } from '../../../src/app/resources/resourceTypes';
import { DEFAULT_SETTINGS, readStoredSettings } from '../../../src/app/services/atlasSettings';
import type { App } from 'obsidian';

const goblin: FiveEMonster = {
  name: 'Goblin',
  source: 'MM',
  uid: 'goblin|MM',
  cr: '1/4',
  size: 'Small',
  type: 'humanoid',
  alignment: 'Neutral Evil',
  ac: '15',
  hp: '7',
  hasToken: true,
};

const aeromancer: FiveEMonster = {
  name: 'Aarakocra Aeromancer',
  source: 'XMM',
  uid: 'aarakocra aeromancer|XMM',
  cr: '4',
  size: 'Medium',
  type: 'elemental',
  alignment: 'Neutral',
  ac: '16',
  hp: '66',
  hasToken: true,
};

describe('fiveEToolsId', () => {
  it('lowercases the name and keeps the source', () => {
    expect(fiveEToolsId('Aarakocra Aeromancer', 'XMM')).toBe('aarakocra aeromancer|XMM');
  });
});

describe('tokenImageUrl', () => {
  it('builds the stable 5e.tools token path', () => {
    expect(tokenImageUrl('https://5e.tools', 'XMM', 'Aarakocra Aeromancer')).toBe(
      'https://5e.tools/img/bestiary/tokens/XMM/Aarakocra%20Aeromancer.webp',
    );
  });
});

describe('searchMonsters', () => {
  const list = [goblin, aeromancer];

  it('matches name substrings case-insensitively', () => {
    expect(searchMonsters(list, 'aarak').map((m) => m.uid)).toEqual(['aarakocra aeromancer|XMM']);
  });

  it('matches source', () => {
    expect(searchMonsters(list, 'mm').map((m) => m.name)).toEqual(['Goblin']);
  });

  it('filters by type, source keyword, and CR range', () => {
    expect(searchMonsters(list, 'type:humanoid').map((m) => m.name)).toEqual(['Goblin']);
    expect(searchMonsters(list, 'source:xmm').map((m) => m.name)).toEqual(['Aarakocra Aeromancer']);
    expect(searchMonsters(list, 'cr:1-5').map((m) => m.name)).toEqual(['Aarakocra Aeromancer']);
    expect(searchMonsters(list, 'cr:0-5').map((m) => m.name)).toEqual(['Aarakocra Aeromancer', 'Goblin']);
    expect(searchMonsters(list, 'cr>=4').map((m) => m.name)).toEqual(['Aarakocra Aeromancer']);
  });

  it('keeps catalog order when the query is empty (no re-sort)', () => {
    expect(searchMonsters(list, '').map((m) => m.name)).toEqual(['Goblin', 'Aarakocra Aeromancer']);
  });
});

describe('libraryStatus helpers', () => {
  it('maps note and token presence', () => {
    expect(libraryStatusOf(false, false)).toBe('none');
    expect(libraryStatusOf(true, false)).toBe('note');
    expect(libraryStatusOf(true, true)).toBe('token');
  });

  it('keeps recent uids newest-first and capped', () => {
    expect(withRecentFiveEUid(['a', 'b'], 'c')).toEqual(['c', 'a', 'b']);
    expect(withRecentFiveEUid(['a', 'b'], 'a')).toEqual(['a', 'b']);
    const many = Array.from({ length: 12 }, (_, i) => `u${i}`);
    expect(withRecentFiveEUid(many, 'new')).toHaveLength(12);
    expect(withRecentFiveEUid(many, 'new')[0]).toBe('new');
  });
});

describe('insertTokenPicker settings', () => {
  it('defaults last source and empty recents', () => {
    expect(DEFAULT_SETTINGS.insertTokenPicker).toEqual({ lastSource: 'library', recentFiveEUids: [] });
    expect(readStoredSettings({}, 'mouse').settings.insertTokenPicker).toEqual({
      lastSource: 'library',
      recentFiveEUids: [],
    });
  });
});

describe('monsterToStatblockMarkdown', () => {
  it('writes frontmatter with statblock true, numeric hp, and 5etools_id', () => {
    const md = monsterToStatblockMarkdown(aeromancer, 'atlas-vtt/assets/aarakocra.webp');
    expect(md).toContain('statblock: true');
    expect(md).toContain('layout: "Basic 5e Layout"');
    expect(md).toContain('hp: 66');
    expect(md).not.toContain('hp: "66"');
    expect(md).toContain('5etools_id: "aarakocra aeromancer|XMM"');
    expect(md).toContain('image: "atlas-vtt/assets/aarakocra.webp"');
    expect(md).toContain('name: "Aarakocra Aeromancer"');
  });
});

describe('renderFiveEToolsText', () => {
  it('expands common attack and damage tags', () => {
    expect(renderFiveEToolsText('{@atk mw} {@hit 4} to hit. {@h} {@damage 1d6 + 2} slashing.')).toBe(
      'Melee Weapon Attack: +4 to hit. Hit: 1d6 + 2 slashing.',
    );
  });

  it('leaves no raw tag braces for unknown tags', () => {
    expect(renderFiveEToolsText('{@creature goblin|MM} and {@spell fireball}')).toBe('goblin and fireball');
    expect(renderFiveEToolsText('{@weird stuff}')).not.toContain('{@');
  });
});

describe('monsterRawToStatblockMarkdown', () => {
  const rawGoblin = {
    name: 'Goblin',
    source: 'MM',
    size: ['S'],
    type: { type: 'humanoid', tags: ['goblinoid'] },
    alignment: ['N', 'E'],
    ac: [15],
    hp: { average: 7, formula: '2d6' },
    speed: { walk: 30 },
    str: 8,
    dex: 14,
    con: 10,
    int: 10,
    wis: 8,
    cha: 8,
    skill: { Stealth: 6 },
    senses: ['darkvision 60 ft.'],
    passive: 9,
    languages: ['Common', 'Goblin'],
    cr: '1/4',
    trait: [{ name: 'Nimble Escape', entries: ['The goblin can take the Disengage or Hide action as a bonus action.'] }],
    action: [{
      name: 'Scimitar',
      entries: ['{@atk mw} {@hit 4} to hit, reach 5 ft. {@h} {@damage 1d6 + 2} slashing damage.'],
    }],
  };

  it('writes layout, stats, actions, and no raw tags', () => {
    const md = monsterRawToStatblockMarkdown(rawGoblin, {
      layout: 'Basic 5e Layout',
      imageVaultPath: 'atlas-vtt/assets/goblin.webp',
    });
    expect(md).toContain('layout: "Basic 5e Layout"');
    expect(md).toContain('stats: [8, 14, 10, 10, 8, 8]');
    expect(md).toContain('hp: "7 (2d6)"');
    expect(md).toContain('type: "humanoid (goblinoid)"');
    expect(md).toContain('actions:');
    expect(md).toContain('name: "Scimitar"');
    expect(md).toContain('Melee Weapon Attack:');
    expect(md).not.toContain('{@');
    expect(md).toContain('5etools_id: "goblin|MM"');
  });
});

describe('layoutNameForFiveE', () => {
  it('falls back to Basic 5e Layout when Fantasy Statblocks is absent', () => {
    expect(layoutNameForFiveE({} as App)).toBe('Basic 5e Layout');
  });
});

describe('monsterResources', () => {
  const hp: ResourceDefinition = {
    key: 'hp',
    name: 'HP',
    field: 'hp',
    direction: 'drains',
    color: '#c44',
    defeatedWhenSpent: true,
    visibleToPlayers: true,
    slot: 0,
  };

  it('maps monster hp onto the hit-point resource', () => {
    expect(monsterResources(aeromancer, [hp])).toEqual({ hp: { current: 66, max: 66 } });
    expect(monsterResources({ ...goblin, hp: '7' }, [hp])).toEqual({ hp: { current: 7, max: 7 } });
  });
});

describe('safeNoteFileName', () => {
  it('strips path characters', () => {
    expect(safeNoteFileName('Aarakocra/Aeromancer: XMM')).toBe('AarakocraAeromancer XMM');
  });
});

describe('loadBestiaryCatalog', () => {
  const files: Record<string, string> = {
    'bestiary/index.json': JSON.stringify({ MM: 'bestiary-mm.json', XMM: 'bestiary-xmm.json' }),
    'bestiary/bestiary-mm.json': JSON.stringify({
      monster: [{
        name: 'Goblin',
        source: 'MM',
        size: ['S'],
        type: 'humanoid',
        ac: [15],
        hp: { average: 7 },
        cr: '1/4',
        hasToken: true,
        str: 8,
        dex: 14,
        con: 10,
        int: 10,
        wis: 8,
        cha: 8,
        action: [{ name: 'Scimitar', entries: ['{@atk mw} {@hit 4}.'] }],
      }],
    }),
    'bestiary/bestiary-xmm.json': JSON.stringify({
      monster: [{
        name: 'Aarakocra Aeromancer',
        source: 'XMM',
        size: ['M'],
        type: 'elemental',
        alignment: ['N'],
        ac: [16],
        hp: { average: 66 },
        cr: '4',
        hasToken: true,
      }],
    }),
  };
  const read = async (path: string): Promise<string> => {
    const text = files[path];
    if (text === undefined) throw new Error(`missing ${path}`);
    return text;
  };

  it('merges monsters from the index', async () => {
    const catalog = await loadBestiaryCatalog(read);
    expect(catalog).toHaveLength(2);
    expect(catalog.find((m) => m.uid === 'aarakocra aeromancer|XMM')?.hp).toBe('66');
    expect(catalog.find((m) => m.uid === 'goblin|MM')?.size).toBe('Small');
  });

  it('loads the raw monster for a uid', async () => {
    const raw = await loadRawMonster(read, 'goblin|MM');
    expect(raw?.str).toBe(8);
    expect(Array.isArray(raw?.action)).toBe(true);
  });
});
