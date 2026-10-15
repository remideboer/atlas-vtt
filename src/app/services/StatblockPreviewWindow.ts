import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { App as ObsidianApp, setIcon } from 'obsidian';
import FantasyStatblock from '../react/components/FantasyStatblock';
import { toTokenVitals, type TokenVitals } from './statblockVitalsSync';
import type { NotePreviewUIManager, PreviewAnchorRef, TokenPreviewAnchor } from './NotePreviewUIManager';
import './statblock-preview-window.scss';
import { previewEdgeGaps } from '../react/components/statblock/previewEdgeGap';
import type { TokenRollContext } from '../types/diceRollOrigin';
import { t } from '../i18n';

/** Move this far before a press becomes a drag, so click-to-roll still works. */
const DRAG_THRESHOLD_PX = 4;

const NO_DRAG = 'button, a, input, textarea, select, [role="button"], [contenteditable="true"]';

/**
 * Floating CMD+hover preview window for token statblocks: of a token placed on
 * a map, which its map's preview manager tracks, or of a token in a list (the
 * library, a collection being exported or imported). Sticky mode (menu /
 * double-click) stays until closed and can be dragged.
 */
export class StatblockPreviewWindow {
  public notePath: string;
  public element: HTMLElement | null = null;
  public originatingPin: PreviewAnchorRef | null;
  private manager: NotePreviewUIManager | null;
  private initialPos?: { x: number; y: number } | undefined;
  private reactRoot: Root | null = null;
  private contentEl: HTMLElement | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private closing = false;
  private sticky: boolean;
  private noteContent: string | undefined;
  private viewId: string | undefined;
  private originContext: TokenRollContext | undefined;
  private vitals: TokenVitals[];
  /** After the user drags, ResizeObserver must not snap back to the open position. */
  private userPlaced = false;
  private isDragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private dragStartLeft = 0;
  private dragStartTop = 0;
  private pendingDrag: { x: number; y: number; left: number; top: number } | null = null;

  constructor(
    private app: ObsidianApp,
    notePath: string,
    originatingToken: TokenPreviewAnchor | TokenVitals,
    manager: NotePreviewUIManager | null,
    initialPos?: { x: number; y: number },
    /** The note's text when it is not in the vault, e.g. inside a collection being imported. */
    noteContent?: string,
    viewId?: string,
    /** The view, scene and token a token on a map was hovered in; none for a token in a list. */
    originContext?: TokenRollContext,
    sticky = false,
  ) {
    this.notePath = notePath;
    this.originatingPin = 'type' in originatingToken ? originatingToken : null;
    this.manager = manager;
    this.initialPos = initialPos;
    this.sticky = sticky;
    this.noteContent = noteContent;
    this.viewId = viewId;
    this.originContext = originContext;
    this.vitals = [toTokenVitals(originatingToken)];

    this.element = document.body.createDiv({
      cls: 'atlas-statblock-preview-window atlas-vtt-plugin atlas-vtt-root',
    });
    this.element.setAttribute('tabindex', '-1');

    if (sticky) {
      this.element.addClass('atlas-statblock-preview-window--sticky');
      this.mountStickyChrome();
    }

    this.contentEl = this.element.createDiv({ cls: 'atlas-statblock-preview-window__body' });
    this.reactRoot = createRoot(this.contentEl);
    this.renderContent();

    if (sticky) this.bindStickyDrag();

    if (initialPos) {
      this.setPosition(initialPos.x, initialPos.y);
    }

    // The statblock mounts after this constructor returns, so the window only
    // reaches its final size later. Re-clamp on every size change, otherwise
    // the first measurement is of an empty box and the window can end up
    // hanging off the edge of the screen.
    this.resizeObserver = new ResizeObserver(() => this.reposition());
    this.resizeObserver.observe(this.element);
  }

  /** Native header + close (outside React) so clicks are never stolen by the drag session. */
  private mountStickyChrome(): void {
    if (!this.element) return;
    const header = this.element.createDiv({ cls: 'atlas-statblock-preview-window__header' });
    const drag = header.createDiv({ cls: 'atlas-statblock-preview-window__drag' });
    drag.setAttribute('aria-label', t('statblock.moveWindow'));
    const title = this.vitals[0]?.name?.trim() || t('statblock.creature');
    drag.createSpan({ cls: 'atlas-statblock-preview-window__title', text: title });

    const closeWrap = header.createDiv({ cls: 'atlas-statblock-preview-window__close' });
    const closeBtn = closeWrap.createEl('button', { cls: 'atlas-close-btn clickable-icon' });
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', t('common.close'));
    setIcon(closeBtn, 'x');
    closeBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });
    closeBtn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.hide(true);
    });
  }

  private renderContent(): void {
    if (!this.reactRoot) return;
    this.reactRoot.render(
      React.createElement(FantasyStatblock, {
        notePath: this.notePath,
        noteContent: this.noteContent,
        viewId: this.viewId,
        originContext: this.originContext,
        app: this.app,
        tokens: this.vitals,
      }),
    );
  }

  /** Turns a hover preview into a sticky one (menu / double-click on an open hover). */
  setSticky(sticky: boolean): void {
    if (this.sticky === sticky || !this.element) return;
    this.sticky = sticky;
    this.element.toggleClass('atlas-statblock-preview-window--sticky', sticky);
    if (sticky) {
      // Header must sit above the React body mount.
      const body = this.contentEl;
      this.mountStickyChrome();
      if (body) this.element.appendChild(body);
      this.bindStickyDrag();
    } else {
      this.unbindStickyDrag();
      this.element.querySelector('.atlas-statblock-preview-window__header')?.remove();
    }
  }

  private bindStickyDrag(): void {
    this.element?.addEventListener('mousedown', this.onPointerDown);
  }

  private unbindStickyDrag(): void {
    this.element?.removeEventListener('mousedown', this.onPointerDown);
    this.clearDragListeners();
  }

  private onPointerDown = (e: MouseEvent): void => {
    if (!this.sticky || !this.element || e.button !== 0) return;
    const target = e.target;
    if (!(target instanceof Element)) return;
    // Drag only from the header so the statblock body keeps wheel/trackpad scroll.
    if (!target.closest('.atlas-statblock-preview-window__header')) return;
    if (target.closest(NO_DRAG)) return;
    if (target.closest('.atlas-statblock-preview-window__close')) return;

    // Fixed windows: use viewport coords, not offsetLeft (unreliable when fixed).
    const rect = this.element.getBoundingClientRect();
    this.pendingDrag = {
      x: e.clientX,
      y: e.clientY,
      left: rect.left,
      top: rect.top,
    };
    document.addEventListener('mousemove', this.onPointerMove);
    document.addEventListener('mouseup', this.onPointerUp);
  };

  private onPointerMove = (e: MouseEvent): void => {
    if (!this.element) return;

    if (this.pendingDrag && !this.isDragging) {
      const dx = e.clientX - this.pendingDrag.x;
      const dy = e.clientY - this.pendingDrag.y;
      if (dx * dx + dy * dy < DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX) return;
      this.isDragging = true;
      this.dragStartX = this.pendingDrag.x;
      this.dragStartY = this.pendingDrag.y;
      this.dragStartLeft = this.pendingDrag.left;
      this.dragStartTop = this.pendingDrag.top;
      this.pendingDrag = null;
      this.element.classList.add('is-dragging');
      document.body.classList.add('atlas-no-select');
    }

    if (!this.isDragging) return;
    this.element.style.left = `${this.dragStartLeft + e.clientX - this.dragStartX}px`;
    this.element.style.top = `${this.dragStartTop + e.clientY - this.dragStartY}px`;
  };

  private onPointerUp = (): void => {
    const wasDragging = this.isDragging;
    this.clearDragListeners();
    if (!wasDragging) return;
    this.userPlaced = true;
    this.initialPos = undefined;
    this.clampToViewport();
  };

  private clearDragListeners(): void {
    this.pendingDrag = null;
    if (this.isDragging) {
      this.isDragging = false;
      this.element?.classList.remove('is-dragging');
      document.body.classList.remove('atlas-no-select');
    }
    document.removeEventListener('mousemove', this.onPointerMove);
    document.removeEventListener('mouseup', this.onPointerUp);
  }

  /** Keeps a dragged window inside the viewport (same gaps as the open placement). */
  private clampToViewport(): void {
    if (!this.element) return;
    const gaps = previewEdgeGaps(this.element.ownerDocument, 20);
    const winWidth = window.innerWidth;
    const winHeight = window.innerHeight;
    const width = this.element.offsetWidth;
    const height = this.element.offsetHeight;
    const maxLeft = Math.max(gaps.inline, winWidth - width - gaps.inline);
    const maxTop = Math.max(gaps.block, winHeight - height - gaps.block);
    const rect = this.element.getBoundingClientRect();
    const left = Math.min(Math.max(rect.left, gaps.inline), maxLeft);
    const top = Math.min(Math.max(rect.top, gaps.block), maxTop);
    this.element.style.left = `${left}px`;
    this.element.style.top = `${top}px`;
  }

  private reposition(): void {
    if (this.userPlaced || !this.initialPos) return;
    this.setPosition(this.initialPos.x, this.initialPos.y);
  }

  setPosition(x: number, y: number) {
    if (!this.element || this.userPlaced) return;

    const winWidth = window.innerWidth;
    const winHeight = window.innerHeight;
    // A theme that draws around the preview asks for more room than this.
    const gaps = previewEdgeGaps(this.element.ownerDocument, 20);

    this.element.classList.add('atlas-statblock-preview-window--measuring');

    window.requestAnimationFrame(() => {
      if (!this.element || this.userPlaced) return;

      // Cap the window to the viewport first, so the measurement below is of
      // the clamped box; the card body scrolls when the statblock is taller.
      this.element.style.maxHeight = `${winHeight - gaps.block * 2}px`;

      const rect = this.element.getBoundingClientRect();
      const elementWidth = rect.width || 400;
      const elementHeight = rect.height || 600;

      let finalX = x + 15;
      let finalY = y + 15;

      if (finalX + elementWidth > winWidth - gaps.inline) {
        finalX = x - elementWidth - 15;
        if (finalX < gaps.inline) {
          finalX = winWidth - elementWidth - gaps.inline;
        }
      }

      if (finalY + elementHeight > winHeight - gaps.block) {
        finalY = y - elementHeight - 15;
        if (finalY < gaps.block) {
          finalY = winHeight - elementHeight - gaps.block;
        }
      }

      finalX = Math.max(gaps.inline, finalX);
      finalY = Math.max(gaps.block, finalY);

      this.element.style.left = `${finalX}px`;
      this.element.style.top = `${finalY}px`;
      this.element.classList.remove('atlas-statblock-preview-window--measuring');
    });
  }

  hide(_force?: boolean): void {
    if (this.closing) return;
    this.closing = true;
    if (this.element) {
      this.element.classList.add('atlas-statblock-preview-window--closing');
      window.setTimeout(() => {
        this.destroy();
      }, 150);
    } else {
      this.destroy();
    }
  }

  destroy(): void {
    this.unbindStickyDrag();

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;

    // Unmount asynchronously: React forbids unmounting while it is rendering,
    // which happens when destroy() runs from inside an effect.
    const root = this.reactRoot;
    this.reactRoot = null;
    this.contentEl = null;
    if (root) window.setTimeout(() => root.unmount(), 0);

    if (this.element) {
      this.element.remove();
      this.element = null;
    }

    this.manager?.handlePreviewClosed(this);
  }

  getIsPinned(): boolean {
    return this.sticky;
  }
}
