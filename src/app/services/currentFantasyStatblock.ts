import type { App, WorkspaceLeaf } from 'obsidian';
import { getActiveWorkspaceLeaf } from '../utils/embeddedLeafFocus';
import {
  bestiaryCreatureByName,
  getFantasyStatblocksApi,
  type FantasyStatblocksCreature,
} from './FantasyStatblocksService';

/** Fantasy Statblocks' search pane (`getViewType` of its creature view). */
const CREATURE_PANE = 'fantasy-statblocks-creature-pane';
const PLACEHOLDER = 'Select a creature to view it here.';

interface CreaturePane {
  render: (creature?: unknown) => unknown;
  containerEl: HTMLElement;
  getViewType?: () => string;
}

const shown = new WeakMap<CreaturePane, FantasyStatblocksCreature>();
const wrapped = new WeakSet<(creature?: unknown) => unknown>();

function isHtmlElement(value: unknown): value is HTMLElement {
  if (typeof value !== 'object' || value === null) return false;
  const node = value as { instanceOf?: (type: typeof HTMLElement) => boolean };
  return typeof node.instanceOf === 'function' && node.instanceOf(HTMLElement);
}

function isCreaturePane(view: unknown): view is CreaturePane {
  if (typeof view !== 'object' || view === null) return false;
  const pane = view as CreaturePane;
  return typeof pane.render === 'function' && isHtmlElement(pane.containerEl);
}

function isNamedCreature(value: unknown): value is FantasyStatblocksCreature {
  if (typeof value !== 'object' || value === null) return false;
  const name = (value as FantasyStatblocksCreature).name;
  return typeof name === 'string' && name.trim() !== '';
}

function viewType(view: unknown): string | null {
  if (typeof view !== 'object' || view === null) return null;
  const getType = (view as { getViewType?: () => string }).getViewType;
  return typeof getType === 'function' ? getType.call(view) : null;
}

function paneOf(leaf: WorkspaceLeaf | null | undefined): CreaturePane | null {
  const view = leaf?.view;
  return isCreaturePane(view) ? view : null;
}

/** The open creature pane: the active leaf when it is that view, otherwise the first one. */
function creaturePane(app: App): CreaturePane | null {
  const active = getActiveWorkspaceLeaf(app.workspace);
  if (viewType(active?.view) === CREATURE_PANE) {
    const pane = paneOf(active);
    if (pane) return pane;
  }
  return paneOf(app.workspace.getLeavesOfType(CREATURE_PANE)[0]);
}

function wrapRender(pane: CreaturePane): void {
  if (wrapped.has(pane.render)) return;
  const original = pane.render;
  const next = function (this: CreaturePane, creature?: unknown): unknown {
    if (isNamedCreature(creature)) shown.set(this, creature);
    else shown.delete(this);
    return original.call(this, creature);
  };
  wrapped.add(next);
  pane.render = next;
}

/** Wraps every open creature pane so the next `render` is remembered. */
export function watchFantasyStatblockPanes(app: App): void {
  for (const leaf of app.workspace.getLeavesOfType(CREATURE_PANE)) {
    const pane = paneOf(leaf);
    if (pane) wrapRender(pane);
  }
}

function creatureFromHeading(pane: CreaturePane): FantasyStatblocksCreature | null {
  const block = pane.containerEl.querySelector('.creature-statblock-container');
  if (!block) return null;
  const text = block.textContent?.trim() ?? '';
  if (text === '' || text === PLACEHOLDER) return null;
  const heading = block.querySelector('h1, h2, h3, h4, h5, h6');
  const name = heading?.textContent?.trim() ?? '';
  if (name === '') return null;
  const api = getFantasyStatblocksApi();
  return api ? bestiaryCreatureByName(api, name) : null;
}

/**
 * The creature Fantasy Statblocks is showing in its search pane, or null when
 * that pane is closed or still on its empty placeholder.
 */
export function currentFantasyStatblock(app: App): FantasyStatblocksCreature | null {
  watchFantasyStatblockPanes(app);
  const pane = creaturePane(app);
  if (!pane) return null;
  const remembered = shown.get(pane);
  if (remembered && isNamedCreature(remembered)) return remembered;
  return creatureFromHeading(pane);
}
