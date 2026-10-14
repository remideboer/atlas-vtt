import type { ContextMenuEntry } from '../../../../react/components/context-menu/AtlasContextMenu';
import type { SortOption, SortOrder } from '../types';
import { SORT_LABELS } from '../utils/assetSort';
import { t } from '../../../../i18n';

export interface ContentContextMenuDeps {
  sortBy: SortOption;
  sortOptions: readonly SortOption[];
  setSortBy: (sort: SortOption) => void;
  sortOrder: SortOrder;
  setSortOrder: (order: SortOrder) => void;
  handleCreateTokens: () => void;
  handleCreateMap: () => void;
  handleCreateCollection: () => void;
  handleCreateFolder: () => void;
  handleRefresh: () => unknown;
}

export function buildContentContextMenuEntries(
  deps: ContentContextMenuDeps
): ContextMenuEntry[] {
  const entries: ContextMenuEntry[] = [];

  entries.push({
    type: 'item',
    label: t('am.header.createToken'),
    icon: 'circle-user',
    onClick: deps.handleCreateTokens,
  });
  entries.push({
    type: 'item',
    label: t('am.header.addMap'),
    icon: 'map',
    onClick: deps.handleCreateMap,
  });
  entries.push({
    type: 'item',
    label: t('am.header.createCollection'),
    icon: 'folder-open',
    onClick: deps.handleCreateCollection,
  });

  entries.push({
    type: 'item',
    label: t('am.menu.newFolder'),
    icon: 'folder-plus',
    onClick: deps.handleCreateFolder,
  });

  entries.push({
    type: 'submenu',
    label: t('am.menu.sortBy'),
    icon: 'arrow-up-down',
    children: [
      ...deps.sortOptions.map((option): ContextMenuEntry => ({
        type: 'item', label: SORT_LABELS[option], checked: deps.sortBy === option, onClick: () => deps.setSortBy(option),
      })),
      {
        type: 'item',
        label: deps.sortOrder === 'asc' ? t('am.menu.ascending') : t('am.menu.descending'),
        icon: deps.sortOrder === 'asc' ? 'arrow-up' : 'arrow-down',
        onClick: () => deps.setSortOrder(deps.sortOrder === 'asc' ? 'desc' : 'asc'),
      },
    ],
  });

  entries.push({
    type: 'item',
    label: t('am.menu.refresh'),
    icon: 'refresh-cw',
    onClick: deps.handleRefresh,
  });

  return entries;
}
