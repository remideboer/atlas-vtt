import { normalizePath, Notice, requestUrl, stringifyYaml, TFile, type App } from 'obsidian';
import { safeNoteFileName } from '../fiveETools/monsterNote';
import { tokenSizeFromCreatureSize } from '../pixi/token-renderer/tokenSizing';
import { ensureAdapterFolder } from '../plugin/vaultFolders';
import { t } from '../i18n';
import { AssetService, type TokenAsset } from './AssetService';
import { writeAssetImage } from './assetImageFiles';
import type { FantasyStatblocksCreature } from './FantasyStatblocksService';
import { parseNoteYaml } from './noteYaml';
import { imageReference, localImage } from './statblockImportCandidates';
import { StatblockTokenImportService } from './StatblockTokenImportService';
import { STATBLOCK_IMAGE_KEYS } from './statblockImageKeys';
import { TokenStatblockLinkService } from './TokenStatblockLinkService';

/** Notes created from a bestiary creature that was not already a vault file. */
const NOTE_ROOT = 'Bestiary';
const OMITTED = new Set(['path', 'mtime', 'bestiary']);

function noteFields(creature: FantasyStatblocksCreature): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(creature)) {
    if (OMITTED.has(key) || typeof value === 'function' || value === undefined) continue;
    fields[key] = value;
  }
  const statblock = fields.statblock;
  if (typeof statblock === 'string' && statblock !== 'true' && statblock !== 'inline') {
    if (typeof fields.layout !== 'string') fields.layout = statblock;
    fields.statblock = true;
  } else if (statblock !== true && statblock !== 'true' && statblock !== 'inline') {
    fields.statblock = true;
  }
  return fields;
}

/** Fantasy Statblocks frontmatter for a bestiary creature. `path` is left out. */
export function creatureNoteMarkdown(creature: FantasyStatblocksCreature, imagePath: string | null): string {
  const fields = noteFields(creature);
  if (imagePath) fields.image = imagePath;
  const yaml = stringifyYaml(fields).trim();
  return `---\n${yaml}\n---\n`;
}

function vaultPathOf(creature: FantasyStatblocksCreature): string {
  return typeof creature.path === 'string' ? creature.path.trim() : '';
}

async function namedNote(app: App, file: TFile, name: string): Promise<boolean> {
  const text = await app.vault.read(file);
  const body = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1];
  if (body === undefined) return false;
  try {
    const frontmatter: unknown = parseNoteYaml(body);
    return typeof frontmatter === 'object' && frontmatter !== null
      && (frontmatter as { name?: unknown }).name === name;
  } catch {
    return false;
  }
}

async function notePathFor(app: App, name: string): Promise<{ path: string; exists: boolean }> {
  const stem = safeNoteFileName(name);
  for (let index = 0; index < 50; index += 1) {
    const fileName = index === 0 ? `${stem}.md` : `${stem} ${index + 1}.md`;
    const path = normalizePath(`${NOTE_ROOT}/${fileName}`);
    const found = app.vault.getAbstractFileByPath(path);
    if (found instanceof TFile) {
      if (await namedNote(app, found, name)) return { path, exists: true };
      continue;
    }
    if (!found) return { path, exists: false };
  }
  return { path: normalizePath(`${NOTE_ROOT}/${stem}-${Date.now()}.md`), exists: false };
}

/** A vault image for the note: one it already links, or a copy of a remote image. */
async function imageForNote(app: App, creature: FantasyStatblocksCreature): Promise<string | null> {
  const source = `${NOTE_ROOT}/${safeNoteFileName(creature.name)}.md`;
  for (const key of STATBLOCK_IMAGE_KEYS) {
    const reference = imageReference(creature[key]);
    if (!reference) continue;
    const local = localImage(app, reference, source);
    if (local) return local.path;
    if (!/^https?:\/\//i.test(reference)) continue;
    try {
      const response = await requestUrl({ url: reference });
      if (!response.arrayBuffer.byteLength) continue;
      return await writeAssetImage(app, creature.name, response.arrayBuffer);
    } catch (error) {
      console.error('[Atlas] Could not save the statblock image:', error);
    }
  }
  return null;
}

async function linkedToken(app: App, path: string): Promise<TokenAsset | null> {
  const assets = AssetService.getInstance(app);
  const tokens = await assets.getTokenAssets();
  const linkedImage = await TokenStatblockLinkService.getInstance(app).getTokenLinkedToStatblock(path);
  return linkedImage ? tokens.find((token) => token.imagePath === linkedImage) ?? null : null;
}

/**
 * The library token for the creature. A bestiary entry that is not a vault note
 * is written under `Bestiary/` first, with its image saved when it has one.
 */
export async function tokenForCreature(
  app: App,
  creature: FantasyStatblocksCreature,
  collection: string,
): Promise<TokenAsset | null> {
  const existing = vaultPathOf(creature);
  const file = existing ? app.vault.getAbstractFileByPath(existing) : null;
  if (file instanceof TFile) return tokenForNote(app, existing, collection);

  const imagePath = await imageForNote(app, creature);
  await ensureAdapterFolder(app, NOTE_ROOT);
  const destination = await notePathFor(app, creature.name);
  if (destination.exists) return tokenForNote(app, destination.path, collection);

  await app.vault.create(destination.path, creatureNoteMarkdown(creature, imagePath));
  if (!imagePath) {
    new Notice(t('picker.insert.currentNoImage'));
    return null;
  }
  const size = tokenSizeFromCreatureSize(creature.size);
  return AssetService.getInstance(app).addTokenAsset({
    name: creature.name.trim(),
    imagePath,
    statblockPath: destination.path,
    tags: [],
    collection,
    ...(size !== undefined && { size }),
  });
}

async function tokenForNote(app: App, path: string, collection: string): Promise<TokenAsset | null> {
  const existing = await linkedToken(app, path);
  if (existing) return existing;
  const assets = AssetService.getInstance(app);
  const result = await new StatblockTokenImportService(app, assets).import([path], collection);
  const created = result.items.find((item) => item.asset)?.asset;
  if (created) return created;
  new Notice(result.items[0]?.message ?? t('picker.insert.currentImportFailed'));
  return null;
}
