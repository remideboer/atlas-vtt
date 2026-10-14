import React, { memo, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Notice, type App } from 'obsidian';
import { FiveEToolsBestiary } from '../../../fiveETools/FiveEToolsBestiary';
import { hasDataFolder } from '../../../fiveETools/hasDataFolder';
import type { FiveELibraryStatus } from '../../../fiveETools/libraryStatus';
import { directoryPickerAvailable, pickDirectory } from '../../../fiveETools/pickDirectory';
import { searchMonsters } from '../../../fiveETools/searchMonsters';
import { tokenImageUrl } from '../../../fiveETools/tokenUrl';
import {
  FIVE_E_TOOLS_IMAGE_BASE,
  type FiveEMonster,
} from '../../../fiveETools/types';
import { SettingsService } from '../../../services/SettingsService';
import { t } from '../../../i18n';
import { Button } from '../primitives/button';

const LIST_LIMIT = 100;
const SOURCE_CHIP_LIMIT = 24;

interface FiveEToolsPickerContentProps {
  app: App;
  onSelectionChange: (monster: FiveEMonster | null) => void;
  onConfirm: () => void;
  busy: boolean;
  busyUid: string | null;
  recentUids: readonly string[];
  statusRevision: number;
}

/** Searchable list of creatures from the local 5e.tools bestiary. */
export function FiveEToolsPickerContent({
  app,
  onSelectionChange,
  onConfirm,
  busy,
  busyUid,
  recentUids,
  statusRevision,
}: FiveEToolsPickerContentProps): React.JSX.Element {
  const bestiary = useMemo(() => FiveEToolsBestiary.forApp(app), [app]);
  const listId = useId();
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [catalog, setCatalog] = useState<FiveEMonster[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pathDraft, setPathDraft] = useState(() => bestiary.configuredPath());
  const [pathRevision, setPathRevision] = useState(0);
  const [editingPath, setEditingPath] = useState(false);
  const [sourceFilters, setSourceFilters] = useState<string[]>([]);
  const [activeUid, setActiveUid] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, FiveELibraryStatus>>({});
  const [brokenThumbs, setBrokenThumbs] = useState<Record<string, true>>({});
  const statusesRef = useRef(statuses);
  statusesRef.current = statuses;
  const fetchedStatusRevision = useRef(statusRevision);

  useEffect(() => {
    setPathDraft(bestiary.configuredPath());
  }, [bestiary, pathRevision]);

  useEffect(() => {
    if (!bestiary.configuredPath()) {
      setCatalog(null);
      setError(t('picker.fiveETools.noPath'));
      setLoading(false);
      setEditingPath(true);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void bestiary.getCatalog()
      .then((list) => {
        if (!cancelled) {
          setCatalog(list);
          setLoading(false);
          setEditingPath(false);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setCatalog(null);
          setLoading(false);
          setEditingPath(true);
          const message = err instanceof Error ? err.message : t('picker.fiveETools.loadFailed');
          setError(message);
          console.error('[InsertTokenPicker] 5e.tools catalog failed', err);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [bestiary, pathRevision]);

  useEffect(() => {
    searchRef.current?.focus();
  }, [catalog]);

  const sourceFilterSet = useMemo(() => new Set(sourceFilters), [sourceFilters]);

  const sources = useMemo(() => {
    if (!catalog) return [];
    const counts = new Map<string, number>();
    for (const monster of catalog) {
      counts.set(monster.source, (counts.get(monster.source) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], undefined, { sensitivity: 'base' }))
      .slice(0, SOURCE_CHIP_LIMIT)
      .map(([source]) => source);
  }, [catalog]);

  const byUid = useMemo(() => {
    const map = new Map<string, FiveEMonster>();
    for (const monster of catalog ?? []) map.set(monster.uid, monster);
    return map;
  }, [catalog]);

  const recentMonsters = useMemo(
    () => recentUids.map((uid) => byUid.get(uid)).filter((monster): monster is FiveEMonster => Boolean(monster)),
    [byUid, recentUids],
  );

  const matched = useMemo(() => {
    if (!catalog) return [];
    let list = searchMonsters(catalog, deferredQuery);
    if (sourceFilterSet.size > 0) {
      list = list.filter((monster) => sourceFilterSet.has(monster.source));
    }
    return list;
  }, [catalog, deferredQuery, sourceFilterSet]);

  const results = useMemo(() => matched.slice(0, LIST_LIMIT), [matched]);
  const resultUidsKey = useMemo(() => results.map((monster) => monster.uid).join('\n'), [results]);
  const recentUidsKey = useMemo(() => recentMonsters.map((monster) => monster.uid).join('\n'), [recentMonsters]);

  const selected = (activeUid
    ? results.find((monster) => monster.uid === activeUid) ?? byUid.get(activeUid)
    : undefined) ?? results[0] ?? null;

  useEffect(() => {
    onSelectionChange(selected);
  }, [onSelectionChange, selected]);

  useEffect(() => {
    if (activeUid && results.some((monster) => monster.uid === activeUid)) return;
    setActiveUid(results[0]?.uid ?? null);
  }, [resultUidsKey, activeUid, results]);

  useEffect(() => {
    if (!catalog) return;
    const uids = [
      ...resultUidsKey.split('\n').filter(Boolean),
      ...recentUidsKey.split('\n').filter(Boolean),
    ];
    const unique = [...new Set(uids)];
    const refreshAll = fetchedStatusRevision.current !== statusRevision;
    fetchedStatusRevision.current = statusRevision;
    const toFetch = refreshAll
      ? unique
      : unique.filter((uid) => statusesRef.current[uid] === undefined);
    if (toFetch.length === 0) return;
    let cancelled = false;
    void bestiary.libraryStatuses(toFetch).then((entries) => {
      if (cancelled) return;
      setStatuses((prev) => (refreshAll ? entries : { ...prev, ...entries }));
    });
    return () => {
      cancelled = true;
    };
  }, [bestiary, catalog, resultUidsKey, recentUidsKey, statusRevision]);

  const markBroken = useMemo(() => {
    const handlers = new Map<string, () => void>();
    return (uid: string): (() => void) => {
      let handler = handlers.get(uid);
      if (!handler) {
        handler = (): void => {
          setBrokenThumbs((prev) => (prev[uid] ? prev : { ...prev, [uid]: true }));
        };
        handlers.set(uid, handler);
      }
      return handler;
    };
  }, []);

  const applyPath = (path: string): void => {
    const trimmed = path.trim();
    if (!trimmed) {
      new Notice(t('picker.fiveETools.noPath'));
      return;
    }
    if (!hasDataFolder(trimmed)) {
      new Notice(t('picker.fiveETools.invalidPath'));
      return;
    }
    setPathDraft(trimmed);
    SettingsService.forApp(app).setSetting('fiveEToolsPath', trimmed);
    bestiary.invalidateCatalog();
    setPathRevision((n) => n + 1);
  };

  const browsePath = (): void => {
    if (!directoryPickerAvailable()) {
      new Notice(t('picker.fiveETools.browseUnavailable'));
      return;
    }
    void pickDirectory(pathDraft || undefined).then((chosen) => {
      if (chosen) applyPath(chosen);
    });
  };

  const toggleSource = (source: string): void => {
    setSourceFilters((current) => (
      current.includes(source) ? current.filter((entry) => entry !== source) : [...current, source]
    ));
  };

  const selectMonster = (monster: FiveEMonster): void => {
    setActiveUid(monster.uid);
  };

  const onSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>): void => {
    if (event.nativeEvent.isComposing || results.length === 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const index = Math.max(0, results.findIndex((monster) => monster.uid === activeUid));
      const next = results[Math.min(results.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)))];
      if (next) setActiveUid(next.uid);
    } else if (event.key === 'Enter' && selected) {
      event.preventDefault();
      if (busy) {
        new Notice(t('picker.fiveETools.busy'));
        return;
      }
      onConfirm();
    }
  };

  const showSetup = editingPath || (!loading && (!bestiary.configuredPath() || (error !== null && catalog === null)));

  if (showSetup) {
    return (
      <div className="token-picker-fivee token-picker-fivee--empty">
        <p className="token-picker-fivee__message">
          {error ?? t('picker.fiveETools.noPath')}
        </p>
        <div className="token-picker-fivee__setup">
          <div className="token-picker-fivee__path-row">
            <input
              type="text"
              className="token-picker-search-input"
              placeholder={t('settings.fiveETools.pathPlaceholder')}
              value={pathDraft}
              onChange={(event) => setPathDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  applyPath(pathDraft);
                }
              }}
              aria-label={t('settings.fiveETools.path')}
              disabled={busy}
            />
            <Button variant="outline" size="sm" onClick={browsePath} disabled={busy}>
              {t('picker.fiveETools.browse')}
            </Button>
          </div>
          <Button variant="default" size="sm" onClick={() => applyPath(pathDraft)} disabled={busy || !pathDraft.trim()}>
            {t('picker.fiveETools.loadBestiary')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="token-picker-fivee">
      <div className="token-picker-search">
        <input
          ref={searchRef}
          type="search"
          className="token-picker-search-input"
          placeholder={t('picker.fiveETools.search')}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onSearchKeyDown}
          disabled={busy || loading}
          aria-label={t('picker.fiveETools.search')}
          aria-controls={listId}
          aria-activedescendant={activeUid ? `${listId}-${cssId(activeUid)}` : undefined}
        />
      </div>
      <div className="token-picker-fivee__path-bar">
        <span className="token-picker-fivee__path" aria-label={bestiary.configuredPath()}>
          {bestiary.configuredPath()}
        </span>
        <Button variant="outline" size="sm" onClick={() => setEditingPath(true)} disabled={busy}>
          {t('picker.fiveETools.changeFolder')}
        </Button>
      </div>
      {sources.length > 0 && (
        <div className="token-picker-fivee__chips" role="group" aria-label={t('picker.fiveETools.sources')}>
          {sources.map((source) => (
            <button
              key={source}
              type="button"
              className={`token-picker-fivee__chip${sourceFilterSet.has(source) ? ' is-active' : ''}`}
              aria-pressed={sourceFilterSet.has(source)}
              disabled={busy || loading}
              onClick={() => toggleSource(source)}
            >
              {source}
            </button>
          ))}
        </div>
      )}
      {busy && busyUid && (
        <p className="token-picker-fivee__message">
          {t('picker.fiveETools.placing', { name: byUid.get(busyUid)?.name ?? busyUid })}
        </p>
      )}
      {loading && (
        <p className="token-picker-fivee__message">{t('picker.fiveETools.loading')}</p>
      )}
      {!loading && catalog && (
        <div className="token-picker-fivee__body">
          <div className="token-picker-fivee__main">
            {query.trim() === '' && recentMonsters.length > 0 && (
              <div className="token-picker-fivee__recent">
                <div className="token-picker-fivee__section-label">{t('picker.fiveETools.recent')}</div>
                <ul className="token-picker-fivee__recent-list">
                  {recentMonsters.map((monster) => (
                    <li key={`recent-${monster.uid}`}>
                      <MonsterRow
                        listId={listId}
                        monster={monster}
                        active={monster.uid === activeUid}
                        busy={busy}
                        placing={busyUid === monster.uid}
                        status={statuses[monster.uid] ?? 'none'}
                        brokenThumb={Boolean(brokenThumbs[monster.uid])}
                        onBroken={markBroken(monster.uid)}
                        onFocusUid={setActiveUid}
                        onSelect={selectMonster}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {results.length === 0 ? (
              <p className="token-picker-fivee__message">{t('picker.fiveETools.noMatch')}</p>
            ) : (
              <ul
                id={listId}
                className="token-picker-fivee__list"
                role="listbox"
                aria-label={t('picker.fiveETools.list')}
              >
                {results.map((monster) => (
                  <li key={monster.uid} role="presentation">
                    <MonsterRow
                      listId={listId}
                      monster={monster}
                      active={monster.uid === activeUid}
                      busy={busy}
                      placing={busyUid === monster.uid}
                      status={statuses[monster.uid] ?? 'none'}
                      brokenThumb={Boolean(brokenThumbs[monster.uid])}
                      onBroken={markBroken(monster.uid)}
                      onFocusUid={setActiveUid}
                      onSelect={selectMonster}
                    />
                  </li>
                ))}
              </ul>
            )}
            {matched.length > LIST_LIMIT && (
              <p className="token-picker-fivee__hint">{t('picker.fiveETools.truncated', { count: LIST_LIMIT })}</p>
            )}
          </div>
          {selected && (
            <aside className="token-picker-fivee__preview" aria-label={t('picker.fiveETools.preview')}>
              <MonsterThumb
                monster={selected}
                broken={Boolean(brokenThumbs[selected.uid])}
                onBroken={markBroken(selected.uid)}
                large
              />
              <h3 className="token-picker-fivee__preview-name">{selected.name}</h3>
              <p className="token-picker-fivee__preview-meta">
                {selected.size}
                {selected.type ? ` · ${selected.type}` : ''}
                {selected.alignment ? ` · ${selected.alignment}` : ''}
              </p>
              <p className="token-picker-fivee__preview-meta">
                {selected.ac ? t('picker.fiveETools.previewAc', { ac: selected.ac }) : ''}
                {selected.ac && selected.hp ? ' · ' : ''}
                {selected.hp ? t('picker.fiveETools.previewHp', { hp: selected.hp }) : ''}
              </p>
              <p className="token-picker-fivee__preview-meta">
                {selected.cr ? t('picker.fiveETools.previewCr', { cr: selected.cr }) : ''}
                {selected.cr ? ' · ' : ''}
                {selected.source}
              </p>
              {!selected.hasToken && (
                <p className="token-picker-fivee__preview-note">{t('picker.fiveETools.noArt')}</p>
              )}
              {(statuses[selected.uid] === 'token' || statuses[selected.uid] === 'note') && (
                <p className="token-picker-fivee__badge">{t('picker.fiveETools.inLibrary')}</p>
              )}
            </aside>
          )}
        </div>
      )}
    </div>
  );
}

function cssId(uid: string): string {
  return uid.replace(/[^a-zA-Z0-9_-]/g, '_');
}

interface MonsterRowProps {
  listId: string;
  monster: FiveEMonster;
  active: boolean;
  busy: boolean;
  placing: boolean;
  status: FiveELibraryStatus;
  brokenThumb: boolean;
  onBroken: () => void;
  onFocusUid: (uid: string) => void;
  onSelect: (monster: FiveEMonster) => void;
}

const MonsterRow = memo(function MonsterRow({
  listId,
  monster,
  active,
  busy,
  placing,
  status,
  brokenThumb,
  onBroken,
  onFocusUid,
  onSelect,
}: MonsterRowProps): React.JSX.Element {
  return (
    <button
      type="button"
      id={`${listId}-${cssId(monster.uid)}`}
      role="option"
      aria-selected={active}
      className={`token-picker-fivee__row${active ? ' is-active' : ''}${placing ? ' is-placing' : ''}`}
      disabled={busy}
      onFocus={() => onFocusUid(monster.uid)}
      onClick={() => onSelect(monster)}
    >
      <MonsterThumb monster={monster} broken={brokenThumb} onBroken={onBroken} />
      <span className="token-picker-fivee__row-text">
        <span className="token-picker-fivee__name">{monster.name}</span>
        <span className="token-picker-fivee__meta">
          {monster.source}
          {monster.cr ? ` · CR ${monster.cr}` : ''}
          {monster.type ? ` · ${monster.type}` : ''}
        </span>
      </span>
      {(status === 'token' || status === 'note') && (
        <span className="token-picker-fivee__badge">{t('picker.fiveETools.inLibrary')}</span>
      )}
    </button>
  );
});

interface MonsterThumbProps {
  monster: FiveEMonster;
  broken: boolean;
  onBroken: () => void;
  large?: boolean;
}

const MonsterThumb = memo(function MonsterThumb({
  monster,
  broken,
  onBroken,
  large,
}: MonsterThumbProps): React.JSX.Element {
  const showArt = monster.hasToken && !broken;
  if (!showArt) {
    return (
      <div
        className={`token-picker-fivee__thumb token-picker-fivee__thumb--blank${large ? ' token-picker-fivee__thumb--large' : ''}`}
        aria-hidden="true"
      />
    );
  }
  return (
    <div className={`token-picker-fivee__thumb${large ? ' token-picker-fivee__thumb--large' : ''}`}>
      <img
        src={tokenImageUrl(FIVE_E_TOOLS_IMAGE_BASE, monster.source, monster.name)}
        alt=""
        loading={large ? 'eager' : 'lazy'}
        decoding="async"
        onError={onBroken}
      />
    </div>
  );
});
