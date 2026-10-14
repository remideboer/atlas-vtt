import React from 'react';
import { Modal, Scope, type App } from 'obsidian';
import { createRoot, type Root } from 'react-dom/client';
import { handledByAnotherControl } from '../../../../keyboard/tooltipEscape';
import { AtlasUIContext } from '../../../../react/root/AtlasUIContext';
import { TokenCreator } from '../TokenCreator';

export interface TokenCreatorModalOptions {
  /** Collection the new tokens are saved into; defaults to the vault default. */
  selectedCollection?: string;
  /** Which creator tab opens first; command palette keeps `statblocks`. */
  initialSource?: 'images' | 'statblocks';
}

/** Command palette / insert-picker host for the same creator used by Asset Manager. */
export class TokenCreatorModal extends Modal {
  private root: Root | null = null;
  private readonly options: TokenCreatorModalOptions;

  constructor(app: App, options: TokenCreatorModalOptions = {}) {
    super(app);
    this.options = options;
    // Handle Escape before the native modal scope so nested menus can dismiss first.
    this.scope = new Scope(this.scope);
    this.scope.register([], 'Escape', event => {
      if (this.modalEl.querySelector('[role="menu"]') || handledByAnotherControl(event)) return;
      event.preventDefault();
      this.close();
    });
  }

  onOpen(): void {
    this.containerEl.addClass('atlas-vtt-plugin', 'token-picker-modal-layer');
    this.modalEl.addClass('atlas-token-creator-host');
    this.root = createRoot(this.contentEl);
    this.root.render(
      <AtlasUIContext.Provider value={{ app: this.app, view: null, pixiApp: null, renderer: null }}>
        <TokenCreator
          isOpen
          initialSource={this.options.initialSource ?? 'statblocks'}
          {...(this.options.selectedCollection !== undefined && {
            selectedCollection: this.options.selectedCollection,
          })}
          onClose={() => this.close()}
        />
      </AtlasUIContext.Provider>,
    );
  }

  onClose(): void {
    this.root?.unmount();
    this.root = null;
  }
}
