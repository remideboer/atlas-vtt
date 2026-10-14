import React from 'react';
import { Modal, type App } from 'obsidian';
import type { Root } from 'react-dom/client';
import { ATLAS_NATIVE_MODAL_CLASSES } from '../../../ui/nativeModal';
import { t } from '../../../i18n';
import { TokenLibraryPickerContent, type TokenLibraryPick } from './TokenLibraryPickerContent';
import './token-picker.scss';

export interface OpenTokenLibraryPickerOptions {
  title: string;
  selectLabel: string;
  blankLabel: string;
  onPick: (pick: TokenLibraryPick) => void;
  /** Shown when the React root fails to mount. */
  failedMessage?: string;
}

/** Opens the shared library-token grid in an Obsidian modal; closes after a pick. */
export function openTokenLibraryPicker(app: App, options: OpenTokenLibraryPickerOptions): void {
  new TokenLibraryPickerModal(app, options).open();
}

class TokenLibraryPickerModal extends Modal {
  private root: Root | null = null;
  private readonly options: OpenTokenLibraryPickerOptions;

  constructor(app: App, options: OpenTokenLibraryPickerOptions) {
    super(app);
    this.options = options;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    // Above Atlas React overlays (Edit Token uses $z-atlas-modal); Obsidian's default sits under them.
    this.containerEl.addClass('token-picker-modal-layer');
    this.modalEl.addClass(...ATLAS_NATIVE_MODAL_CLASSES, 'token-picker-modal-wrapper');
    this.titleEl.setText(this.options.title);
    const container = contentEl.createDiv({ cls: 'token-picker-root' });
    import('react-dom/client').then(({ createRoot }) => {
      this.root = createRoot(container);
      this.root.render(
        React.createElement(TokenLibraryPickerContent, {
          app: this.app,
          selectLabel: this.options.selectLabel,
          blankLabel: this.options.blankLabel,
          onPick: (pick) => {
            this.options.onPick(pick);
            this.close();
          },
        }),
      );
    }).catch((error) => {
      console.error('[TokenLibraryPicker] Failed to create React root:', error);
      contentEl.setText(this.options.failedMessage ?? t('picker.editArt.failed'));
    });
  }

  onClose(): void {
    this.root?.unmount();
    this.root = null;
  }
}
