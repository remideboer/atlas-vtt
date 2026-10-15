export interface ModalDragOptions {
  /** Least distance kept between the modal and the edges of the viewport. */
  margin?: number;
}

interface Position {
  x: number;
  y: number;
}

function viewportOf(el: HTMLElement): { width: number; height: number } {
  const win = el.ownerDocument.defaultView ?? window;
  return { width: win.innerWidth, height: win.innerHeight };
}

function clamp(el: HTMLElement, position: Position, margin: number): Position {
  const { width, height } = viewportOf(el);
  const maxX = Math.max(margin, width - el.offsetWidth - margin);
  const maxY = Math.max(margin, height - el.offsetHeight - margin);
  return {
    x: Math.min(Math.max(position.x, margin), maxX),
    y: Math.min(Math.max(position.y, margin), maxY),
  };
}

function place(el: HTMLElement, position: Position): void {
  el.style.left = `${position.x}px`;
  el.style.top = `${position.y}px`;
}

function pinIfNeeded(el: HTMLElement): Position {
  const rect = el.getBoundingClientRect();
  const position = { x: rect.left, y: rect.top };
  if (el.style.position !== 'fixed') {
    el.style.position = 'fixed';
    el.style.margin = '0';
    el.style.transform = 'none';
    place(el, position);
  }
  return {
    x: Number.parseFloat(el.style.left) || position.x,
    y: Number.parseFloat(el.style.top) || position.y,
  };
}

/**
 * Lets the user move an Obsidian `modalEl` by dragging `handleEl` (title or header).
 * Presses on buttons / close controls are ignored. Returns a dispose that removes listeners.
 */
export function attachModalDrag(
  modalEl: HTMLElement,
  handleEl: HTMLElement,
  { margin = 16 }: ModalDragOptions = {},
): () => void {
  const win = modalEl.ownerDocument.defaultView ?? window;
  let endActiveDrag: (() => void) | null = null;

  const onPointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    if (!(event.target instanceof Element)) return;
    if (event.target.closest('button, input, select, textarea, .modal-close-button, .modal-header-button')) {
      return;
    }
    event.preventDefault();

    const startPointer = { x: event.clientX, y: event.clientY };
    const startPanel = pinIfNeeded(modalEl);
    let latest = startPanel;
    modalEl.classList.add('is-dragging');
    modalEl.ownerDocument.body.classList.add('atlas-no-select');

    const onMove = (move: PointerEvent): void => {
      latest = {
        x: startPanel.x + move.clientX - startPointer.x,
        y: startPanel.y + move.clientY - startPointer.y,
      };
      place(modalEl, latest);
    };

    const onUp = (): void => {
      endActiveDrag = null;
      win.removeEventListener('pointermove', onMove);
      win.removeEventListener('pointerup', onUp);
      win.removeEventListener('pointercancel', onUp);
      modalEl.classList.remove('is-dragging');
      modalEl.ownerDocument.body.classList.remove('atlas-no-select');
      const settled = clamp(modalEl, latest, margin);
      place(modalEl, settled);
    };

    endActiveDrag = (): void => {
      win.removeEventListener('pointermove', onMove);
      win.removeEventListener('pointerup', onUp);
      win.removeEventListener('pointercancel', onUp);
      modalEl.classList.remove('is-dragging');
      modalEl.ownerDocument.body.classList.remove('atlas-no-select');
      endActiveDrag = null;
    };

    win.addEventListener('pointermove', onMove);
    win.addEventListener('pointerup', onUp);
    win.addEventListener('pointercancel', onUp);
  };

  handleEl.addEventListener('pointerdown', onPointerDown);

  return (): void => {
    handleEl.removeEventListener('pointerdown', onPointerDown);
    endActiveDrag?.();
  };
}
