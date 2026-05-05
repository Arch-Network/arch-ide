import { useCallback, useEffect, useRef, useState } from 'react';

type Axis = 'horizontal' | 'vertical';

interface UseResizablePanelOptions {
  /** Initial size in pixels (used until a persisted value is loaded). */
  initial: number;
  /** Minimum allowed size in pixels. */
  min: number;
  /** Maximum allowed size in pixels. */
  max: number;
  /**
   * Drag axis:
   *   - "horizontal": dragging right grows the panel (left-anchored, e.g. sidebar).
   *   - "vertical":   dragging up grows the panel (bottom-anchored, e.g. terminal).
   */
  axis: Axis;
  /** Optional localStorage key — when provided the size is persisted across reloads. */
  storageKey?: string;
}

interface UseResizablePanelResult {
  size: number;
  setSize: (size: number) => void;
  /** Attach to the resize handle's onMouseDown. Captures mouse globally during drag. */
  onMouseDown: (event: React.MouseEvent) => void;
  isDragging: boolean;
}

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

const readPersistedSize = (storageKey: string | undefined, fallback: number, min: number, max: number) => {
  if (!storageKey || typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return fallback;
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed)) return fallback;
    return clamp(parsed, min, max);
  } catch {
    return fallback;
  }
};

/**
 * Hook for an imperative drag-to-resize panel with optional localStorage persistence.
 *
 * Why imperative? CSS-only resize handles (the `resize` property) cannot persist
 * sizes, react to drag end, or coordinate with neighboring layout regions. We
 * register `mousemove`/`mouseup` listeners on `document` for the duration of
 * the drag so the cursor doesn't lose the handle when it slips off.
 */
export const useResizablePanel = ({
  initial,
  min,
  max,
  axis,
  storageKey,
}: UseResizablePanelOptions): UseResizablePanelResult => {
  const [size, setSizeState] = useState<number>(() =>
    readPersistedSize(storageKey, initial, min, max),
  );
  const [isDragging, setIsDragging] = useState(false);
  const sizeRef = useRef(size);
  sizeRef.current = size;

  const setSize = useCallback(
    (next: number) => {
      const clamped = clamp(next, min, max);
      setSizeState(clamped);
    },
    [min, max],
  );

  // Persist on size change.
  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(storageKey, String(size));
    } catch {
      // Quota errors / private mode — fail silently.
    }
  }, [storageKey, size]);

  // Re-clamp if the consumer changes the bounds at runtime (e.g. a code update
  // bumps the minimum). Without this, a stale React state from before the
  // bound change can render below the new minimum until the user drags.
  useEffect(() => {
    setSizeState((current) => {
      const clamped = clamp(current, min, max);
      return clamped === current ? current : clamped;
    });
  }, [min, max]);

  const onMouseDown = useCallback(
    (event: React.MouseEvent) => {
      event.preventDefault();
      const startX = event.pageX;
      const startY = event.pageY;
      const startSize = sizeRef.current;

      setIsDragging(true);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = axis === 'horizontal' ? 'col-resize' : 'row-resize';

      const handleMove = (e: MouseEvent) => {
        const delta = axis === 'horizontal' ? e.pageX - startX : startY - e.pageY;
        const next = clamp(startSize + delta, min, max);
        setSizeState(next);
      };

      const handleUp = () => {
        document.removeEventListener('mousemove', handleMove);
        document.removeEventListener('mouseup', handleUp);
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        setIsDragging(false);
      };

      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', handleUp);
    },
    [axis, min, max],
  );

  return { size, setSize, onMouseDown, isDragging };
};
