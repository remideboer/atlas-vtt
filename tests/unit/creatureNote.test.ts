import { describe, expect, it } from 'vitest';
import { creatureNoteMarkdown } from '../../src/app/services/creatureNote';

describe('creatureNoteMarkdown', () => {
  it('writes a bestiary note and leaves the source path out', () => {
    const markdown = creatureNoteMarkdown({
      name: 'Goblin',
      path: 'somewhere/else.md',
      mtime: 1,
      bestiary: true,
      statblock: 'Basic 5e Layout',
      cr: '1/4',
    }, 'atlas-vtt/assets/goblin.png');

    expect(markdown.startsWith('---\n')).toBe(true);
    expect(markdown).toContain('name: Goblin');
    expect(markdown).toContain('statblock: true');
    expect(markdown).toContain('layout: Basic 5e Layout');
    expect(markdown).toContain('image: atlas-vtt/assets/goblin.png');
    expect(markdown).not.toContain('somewhere/else');
    expect(markdown).not.toContain('mtime');
  });

  it('keeps an explicit layout and a true statblock flag', () => {
    const markdown = creatureNoteMarkdown({
      name: 'Orc',
      statblock: true,
      layout: 'PF2e',
    }, null);

    expect(markdown).toContain('statblock: true');
    expect(markdown).toContain('layout: PF2e');
    expect(markdown).not.toContain('image:');
  });
});
