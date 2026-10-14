import { afterEach, describe, expect, it } from 'vitest';
import type { App, WorkspaceLeaf } from 'obsidian';
import { currentFantasyStatblock, watchFantasyStatblockPanes } from '../../src/app/services/currentFantasyStatblock';
import type { FantasyStatblocksApi, FantasyStatblocksCreature } from '../../src/app/services/FantasyStatblocksService';

const PANE = 'fantasy-statblocks-creature-pane';
const PLACEHOLDER = 'Select a creature to view it here.';

interface PaneView {
  containerEl: HTMLElement;
  leaf: WorkspaceLeaf;
  getViewType(): string;
  render(creature?: { name?: string }): void;
}

function pane(): { view: PaneView; leaf: WorkspaceLeaf } {
  const container = document.createElement('div');
  const block = document.createElement('div');
  block.className = 'creature-statblock-container';
  container.append(block);
  Object.defineProperty(container, 'instanceOf', {
    value: (type: unknown): boolean => type === HTMLElement,
  });
  const view = {
    containerEl: container,
    leaf: null as unknown as WorkspaceLeaf,
    getViewType(): string {
      return PANE;
    },
    render(creature?: { name?: string }): void {
      block.replaceChildren();
      if (!creature?.name) {
        const em = document.createElement('em');
        em.textContent = PLACEHOLDER;
        block.append(em);
        return;
      }
      const heading = document.createElement('h1');
      heading.textContent = creature.name;
      block.append(heading);
    },
  };
  const leaf = { view } as unknown as WorkspaceLeaf;
  view.leaf = leaf;
  return { view, leaf };
}

function appOf(leaves: WorkspaceLeaf[], active: WorkspaceLeaf | null = null): App {
  return {
    workspace: {
      getLeavesOfType: () => leaves,
      getActiveViewOfType: () => active?.view ?? null,
    },
  } as unknown as App;
}

describe('currentFantasyStatblock', () => {
  afterEach(() => {
    delete (window as unknown as { FantasyStatblocks?: FantasyStatblocksApi }).FantasyStatblocks;
  });

  it('returns the creature the pane last rendered', () => {
    const { view, leaf } = pane();
    const app = appOf([leaf]);
    const creature = { name: 'Goblin', path: 'Bestiary/Goblin.md' };
    watchFantasyStatblockPanes(app);
    view.render(creature);

    expect(currentFantasyStatblock(app)).toEqual(creature);
  });

  it('forgets the creature when the pane is cleared', () => {
    const { view, leaf } = pane();
    const app = appOf([leaf]);
    watchFantasyStatblockPanes(app);
    view.render({ name: 'Goblin', path: 'Bestiary/Goblin.md' });
    view.render();

    expect(currentFantasyStatblock(app)).toBeNull();
  });

  it('ignores the empty placeholder', () => {
    const { view, leaf } = pane();
    view.render();

    expect(currentFantasyStatblock(appOf([leaf]))).toBeNull();
  });

  it('reads a heading shown before the pane was wrapped', () => {
    const { view, leaf } = pane();
    view.render({ name: 'Goblin' });
    const resolved: FantasyStatblocksCreature = { name: 'Goblin', path: 'Bestiary/Goblin.md' };
    (window as unknown as { FantasyStatblocks: FantasyStatblocksApi }).FantasyStatblocks = {
      isResolved: () => true,
      hasCreature: (name: string) => name === 'Goblin',
      getCreatureFromBestiary: (name: string) => (name === 'Goblin' ? resolved : null),
    } as FantasyStatblocksApi;

    expect(currentFantasyStatblock(appOf([leaf]))).toEqual(resolved);
  });
});
