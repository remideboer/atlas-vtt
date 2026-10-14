import { normalizePath, requestUrl, TFile, type App } from 'obsidian';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { tokenSizeFromCreatureSize } from '../pixi/token-renderer/tokenSizing';
import { ensureAdapterFolder } from '../plugin/vaultFolders';
import { writeAssetImage } from '../services/assetImageFiles';
import { AssetService, type TokenAsset } from '../services/AssetService';
import { SettingsService } from '../services/SettingsService';
import { t } from '../i18n';
import { hasDataFolder } from './hasDataFolder';
import { FiveEInsertError } from './insertErrors';
import { libraryStatusOf, type FiveELibraryStatus } from './libraryStatus';
import { monsterToStatblockMarkdown, safeNoteFileName } from './monsterNote';
import { layoutNameForFiveE, monsterRawToStatblockMarkdown } from './monsterStatblock';
import { loadBestiaryCatalog, loadRawMonster, type FiveEToolsDataReader } from './readBestiary';
import { tokenImageUrl } from './tokenUrl';
import {
  FIVE_E_TOOLS_ID_KEY,
  FIVE_E_TOOLS_IMAGE_BASE,
  FIVE_E_TOOLS_NOTE_ROOT,
  type FiveEMonster,
} from './types';

const byApp = new WeakMap<App, FiveEToolsBestiary>();

/** Loads the local 5e.tools bestiary and materialises library tokens for insert. */
export class FiveEToolsBestiary {
  private catalog: FiveEMonster[] | null = null;
  private catalogForPath: string | null = null;
  private loadPromise: Promise<FiveEMonster[]> | null = null;
  /** `5etools_id` → note path under `Bestiary/5etools/`. */
  private noteByUid: Map<string, string> | null = null;
  /** Normalized note path → library token. */
  private tokenByNote: Map<string, TokenAsset> | null = null;
  private libraryIndexPromise: Promise<void> | null = null;

  private constructor(
    private readonly app: App,
    private readonly settings: SettingsService,
    private readonly assets: AssetService,
  ) {}

  static forApp(app: App): FiveEToolsBestiary {
    let instance = byApp.get(app);
    if (!instance) {
      instance = new FiveEToolsBestiary(app, SettingsService.forApp(app), AssetService.getInstance(app));
      byApp.set(app, instance);
    }
    return instance;
  }

  /** Absolute path from settings, or empty when unset. */
  configuredPath(): string {
    return this.settings.getSetting('fiveEToolsPath').trim();
  }

  /** Clears the in-memory catalog (e.g. after the settings path changes). */
  invalidateCatalog(): void {
    this.catalog = null;
    this.catalogForPath = null;
    this.loadPromise = null;
    this.invalidateLibraryIndex();
  }

  /** Drop note/token maps so the next status lookup rebuilds them. */
  invalidateLibraryIndex(): void {
    this.noteByUid = null;
    this.tokenByNote = null;
    this.libraryIndexPromise = null;
  }

  async getCatalog(): Promise<FiveEMonster[]> {
    const root = this.configuredPath();
    if (!root) throw new FiveEInsertError('path', t('picker.fiveETools.noPath'));
    if (!hasDataFolder(root)) {
      throw new FiveEInsertError('path', t('picker.fiveETools.invalidPath'));
    }
    if (this.catalog && this.catalogForPath === root) return this.catalog;
    if (this.loadPromise && this.catalogForPath === root) return this.loadPromise;

    this.catalogForPath = root;
    this.loadPromise = loadBestiaryCatalog(dataReader(root))
      .then((list) => {
        this.catalog = list;
        return list;
      })
      .catch((error: unknown) => {
        this.catalog = null;
        this.catalogForPath = null;
        this.loadPromise = null;
        if (error instanceof FiveEInsertError) throw error;
        throw new FiveEInsertError(
          'path',
          error instanceof Error ? error.message : t('picker.fiveETools.loadFailed'),
        );
      });
    return this.loadPromise;
  }

  /** Whether the creature already has a bestiary note and/or a library token. */
  async libraryStatus(uid: string): Promise<FiveELibraryStatus> {
    const statuses = await this.libraryStatuses([uid]);
    return statuses[uid] ?? 'none';
  }

  /**
   * Library presence for many uids after one vault scan (note frontmatter + token
   * assets). Prefer this over repeated `libraryStatus` calls.
   */
  async libraryStatuses(uids: readonly string[]): Promise<Record<string, FiveELibraryStatus>> {
    await this.ensureLibraryIndex();
    const notes = this.noteByUid!;
    const tokens = this.tokenByNote!;
    const out: Record<string, FiveELibraryStatus> = {};
    for (const uid of uids) {
      const notePath = notes.get(uid);
      if (!notePath) {
        out[uid] = 'none';
        continue;
      }
      out[uid] = libraryStatusOf(true, tokens.has(normalizePath(notePath)));
    }
    return out;
  }

  private async ensureLibraryIndex(): Promise<void> {
    if (this.noteByUid && this.tokenByNote) return;
    if (this.libraryIndexPromise) {
      await this.libraryIndexPromise;
      return;
    }
    this.libraryIndexPromise = (async (): Promise<void> => {
      await this.assets.initialize();
      const notes = new Map<string, string>();
      const prefix = `${FIVE_E_TOOLS_NOTE_ROOT}/`;
      for (const file of this.app.vault.getMarkdownFiles()) {
        if (!file.path.startsWith(prefix)) continue;
        const fields = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
        const id = fields?.[FIVE_E_TOOLS_ID_KEY];
        if (typeof id === 'string' && id) notes.set(id, file.path);
      }
      const tokens = new Map<string, TokenAsset>();
      for (const token of await this.assets.getTokenAssets()) {
        if (!token.statblockPath) continue;
        tokens.set(normalizePath(token.statblockPath), token);
      }
      this.noteByUid = notes;
      this.tokenByNote = tokens;
    })();
    try {
      await this.libraryIndexPromise;
    } catch (error) {
      this.libraryIndexPromise = null;
      this.noteByUid = null;
      this.tokenByNote = null;
      throw error;
    }
  }

  /**
   * Returns an existing library token for the creature, or creates a note + token
   * (downloading art from 5e.tools when possible).
   */
  async ensureTokenForMonster(monster: FiveEMonster, collectionId: string): Promise<TokenAsset> {
    try {
      await this.ensureLibraryIndex();
      const existingNote = this.findNotePath(monster.uid);
      if (existingNote) {
        const linked = this.findTokenForNote(existingNote);
        if (linked) {
          await this.upgradeStubNote(monster, existingNote, linked.imagePath || null);
          return linked;
        }
      }

      return await this.assets.runExclusive(async () => {
        await this.ensureLibraryIndex();
        const noteAgain = this.findNotePath(monster.uid);
        if (noteAgain) {
          const linked = this.findTokenForNote(noteAgain);
          if (linked) return linked;
        }

        let imagePath = '';
        if (monster.hasToken) {
          const downloaded = await downloadTokenArt(monster);
          if (downloaded) {
            try {
              imagePath = await writeAssetImage(this.app, monster.name, downloaded);
            } catch (error) {
              console.debug('[Atlas] 5e.tools token art write failed', error);
              // Place with a ring if the vault cannot store the art.
            }
          }
        }

        let notePath: string;
        try {
          const markdown = await this.statblockMarkdown(monster, imagePath || null);
          if (noteAgain) {
            notePath = noteAgain;
            const file = this.app.vault.getAbstractFileByPath(notePath);
            if (file instanceof TFile) {
              await this.app.vault.modify(file, markdown);
            }
          } else {
            notePath = await this.writeNote(monster, markdown);
          }
          this.noteByUid?.set(monster.uid, notePath);
        } catch (error) {
          if (error instanceof FiveEInsertError) throw error;
          throw new FiveEInsertError(
            'vault',
            error instanceof Error ? error.message : t('picker.fiveETools.vaultFailed'),
          );
        }

        const already = this.findTokenForNote(notePath);
        if (already) return already;

        try {
          const size = tokenSizeFromCreatureSize(monster.size);
          const asset = await this.assets.addTokenAsset({
            name: monster.name,
            imagePath,
            statblockPath: notePath,
            tags: [],
            collection: collectionId,
            showRing: !imagePath,
            ...(size !== undefined && { size }),
          });
          this.tokenByNote?.set(normalizePath(notePath), asset);
          this.app.workspace.trigger('atlas-vtt:refresh-assets');
          return asset;
        } catch (error) {
          if (error instanceof FiveEInsertError) throw error;
          throw new FiveEInsertError(
            'vault',
            error instanceof Error ? error.message : t('picker.fiveETools.vaultFailed'),
          );
        }
      });
    } catch (error) {
      if (error instanceof FiveEInsertError) throw error;
      throw new FiveEInsertError(
        'unknown',
        error instanceof Error ? error.message : t('picker.fiveETools.insertFailed'),
      );
    }
  }

  private findNotePath(uid: string): string | null {
    if (this.noteByUid) return this.noteByUid.get(uid) ?? null;
    const prefix = `${FIVE_E_TOOLS_NOTE_ROOT}/`;
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!file.path.startsWith(prefix)) continue;
      const fields = this.app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined;
      const id = fields?.[FIVE_E_TOOLS_ID_KEY];
      if (typeof id === 'string' && id === uid) return file.path;
    }
    return null;
  }

  private findTokenForNote(notePath: string): TokenAsset | null {
    const normalized = normalizePath(notePath);
    if (this.tokenByNote) return this.tokenByNote.get(normalized) ?? null;
    return null;
  }

  /** Rewrites an older stub note (no layout/stats) with a full Fantasy Statblocks body. */
  private async upgradeStubNote(
    monster: FiveEMonster,
    notePath: string,
    imagePath: string | null,
  ): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(notePath);
    if (!(file instanceof TFile)) return;
    try {
      const current = await this.app.vault.read(file);
      // Full conversions always carry ability scores or action blocks; stubs do not.
      if (/\nstats:/.test(current) || /\nactions:/.test(current)) return;
      const markdown = await this.statblockMarkdown(monster, imagePath);
      await this.app.vault.modify(file, markdown);
    } catch (error) {
      console.debug('[Atlas] 5e.tools stub note upgrade failed', error);
    }
  }

  /** Full Fantasy Statblocks YAML when the raw bestiary entry loads; else the stub note. */
  private async statblockMarkdown(monster: FiveEMonster, imagePath: string | null): Promise<string> {
    const root = this.configuredPath();
    if (root && hasDataFolder(root)) {
      try {
        const raw = await loadRawMonster(dataReader(root), monster.uid);
        if (raw) {
          return monsterRawToStatblockMarkdown(raw, {
            layout: layoutNameForFiveE(this.app),
            imageVaultPath: imagePath,
          });
        }
      } catch (error) {
        console.debug('[Atlas] 5e.tools raw monster load failed', error);
      }
    }
    return monsterToStatblockMarkdown(monster, imagePath);
  }

  private async writeNote(monster: FiveEMonster, markdown: string): Promise<string> {
    const folder = normalizePath(`${FIVE_E_TOOLS_NOTE_ROOT}/${monster.source}`);
    await ensureAdapterFolder(this.app, folder);
    let path = normalizePath(`${folder}/${safeNoteFileName(monster.name)}.md`);
    if (this.app.vault.getAbstractFileByPath(path)) {
      path = normalizePath(`${folder}/${safeNoteFileName(monster.name)}-${monster.source}.md`);
    }
    if (this.app.vault.getAbstractFileByPath(path)) {
      path = normalizePath(`${folder}/${safeNoteFileName(monster.name)}-${Date.now()}.md`);
    }
    await this.app.vault.create(path, markdown);
    return path;
  }
}

function dataReader(root: string): FiveEToolsDataReader {
  return async (pathFromData: string): Promise<string> => {
    const absolute = join(root, 'data', ...pathFromData.split('/'));
    return readFile(absolute, 'utf8');
  };
}

async function downloadTokenArt(monster: FiveEMonster): Promise<ArrayBuffer | null> {
  const url = tokenImageUrl(FIVE_E_TOOLS_IMAGE_BASE, monster.source, monster.name);
  try {
    const response = await requestUrl({ url, throw: false });
    if (response.status < 200 || response.status >= 300) return null;
    const data = response.arrayBuffer;
    return data.byteLength > 0 ? data : null;
  } catch (error) {
    console.debug('[Atlas] 5e.tools token art download failed', url, error);
    return null;
  }
}
