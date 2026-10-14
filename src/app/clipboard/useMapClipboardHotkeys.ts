import { useEffect, useRef } from 'react';
import type { AtlasView } from '../atlas-view';
import type { ViewAtlasStore } from '../storeFactory';
import { useMapHotkeys } from '../keyboard/useMapHotkeys';
import { runInBackground } from '../utils/backgroundTask';
import { copySelection, cutSelection, duplicateSelection, pasteClipboard } from './mapClipboardActions';
import { mapPasteTarget, trackMapPointer } from './mapPasteTarget';
import type { Point } from './mapObjectContent';

function mapCanvas(view: AtlasView | null): HTMLCanvasElement | null {
  return view?.serviceManager?.getRendererService()?.getApp()?.canvas ?? null;
}

/** Copy, cut, paste and duplicate shortcuts for the map's selected objects. */
export function useMapClipboardHotkeys(store: ViewAtlasStore, view: AtlasView | null, viewId?: string): void {
  const pointer = useRef<Point | null>(null);

  useEffect(() => {
    const track = (event: PointerEvent): void => {
      pointer.current = { x: event.clientX, y: event.clientY };
    };
    // Copy and cut defer to selected page text. Clicking the map ends any text selection, as a
    // click elsewhere on the page would, even when the canvas' pointer handling keeps it alive.
    const clearTextSelection = (event: PointerEvent): void => {
      const canvas = mapCanvas(view);
      if (canvas && event.target === canvas) canvas.ownerDocument.getSelection()?.removeAllRanges();
    };
    window.addEventListener('pointermove', track, { passive: true });
    window.addEventListener('pointerdown', clearTextSelection, true);
    const stopMapTrack = trackMapPointer(view);
    return () => {
      window.removeEventListener('pointermove', track);
      window.removeEventListener('pointerdown', clearTextSelection, true);
      stopMapTrack();
    };
  }, [view]);

  // The player view registers nothing, so its keys keep their native behaviour.
  useMapHotkeys(store.getState().isPlayerView ? {} : {
    copy: (): void => runInBackground(copySelection(store), 'Copying map objects', 'Could not copy the selection'),
    cut: (): void => runInBackground(cutSelection(store), 'Cutting map objects', 'Could not cut the selection'),
    paste: (): void => {
      const target = mapPasteTarget(view, pointer.current);
      if (target) runInBackground(pasteClipboard(store, target), 'Pasting map objects', 'Could not paste');
    },
    duplicate: (): void => {
      duplicateSelection(store);
    },
  }, viewId);
}
