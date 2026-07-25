import { useCallback, useRef, useState } from 'react';

const DEFAULT_LIMIT = 60;
const DEFAULT_COALESCE_MS = 450;

/**
 * Undo/redo stack with coalescing for rapid edits (typing, dragging).
 * First change in a burst records the pre-edit snapshot; later changes
 * in the same burst replace the current value without extra stack entries.
 */
export function useUndoHistory<T>(opts?: { limit?: number; coalesceMs?: number }) {
  const limit = opts?.limit ?? DEFAULT_LIMIT;
  const coalesceMs = opts?.coalesceMs ?? DEFAULT_COALESCE_MS;

  const pastRef = useRef<T[]>([]);
  const futureRef = useRef<T[]>([]);
  const applyingRef = useRef(false);
  const coalesceTimer = useRef<number | null>(null);
  const burstOpenRef = useRef(false);

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  const syncFlags = useCallback(() => {
    setCanUndo(pastRef.current.length > 0);
    setCanRedo(futureRef.current.length > 0);
  }, []);

  const clone = useCallback((value: T): T => {
    try {
      return structuredClone(value);
    } catch {
      return JSON.parse(JSON.stringify(value)) as T;
    }
  }, []);

  const clearCoalesce = useCallback(() => {
    if (coalesceTimer.current != null) {
      window.clearTimeout(coalesceTimer.current);
      coalesceTimer.current = null;
    }
    burstOpenRef.current = false;
  }, []);

  /** Call before applying a user edit, with the current value */
  const recordBeforeChange = useCallback(
    (current: T) => {
      if (applyingRef.current) return;
      if (!burstOpenRef.current) {
        pastRef.current = [...pastRef.current, clone(current)].slice(-limit);
        futureRef.current = [];
        burstOpenRef.current = true;
        syncFlags();
      }
      if (coalesceTimer.current != null) window.clearTimeout(coalesceTimer.current);
      coalesceTimer.current = window.setTimeout(() => {
        burstOpenRef.current = false;
        coalesceTimer.current = null;
      }, coalesceMs);
    },
    [clone, coalesceMs, limit, syncFlags],
  );

  /** Force a new undo point (e.g. after drag end / explicit action) */
  const checkpoint = useCallback(() => {
    clearCoalesce();
  }, [clearCoalesce]);

  const undo = useCallback(
    (current: T): T | null => {
      clearCoalesce();
      const past = pastRef.current;
      if (!past.length) return null;
      const prev = past[past.length - 1]!;
      pastRef.current = past.slice(0, -1);
      futureRef.current = [...futureRef.current, clone(current)];
      applyingRef.current = true;
      syncFlags();
      queueMicrotask(() => {
        applyingRef.current = false;
      });
      return clone(prev);
    },
    [clearCoalesce, clone, syncFlags],
  );

  const redo = useCallback(
    (current: T): T | null => {
      clearCoalesce();
      const future = futureRef.current;
      if (!future.length) return null;
      const next = future[future.length - 1]!;
      futureRef.current = future.slice(0, -1);
      pastRef.current = [...pastRef.current, clone(current)].slice(-limit);
      applyingRef.current = true;
      syncFlags();
      queueMicrotask(() => {
        applyingRef.current = false;
      });
      return clone(next);
    },
    [clearCoalesce, clone, limit, syncFlags],
  );

  const reset = useCallback(() => {
    clearCoalesce();
    pastRef.current = [];
    futureRef.current = [];
    syncFlags();
  }, [clearCoalesce, syncFlags]);

  return {
    canUndo,
    canRedo,
    recordBeforeChange,
    checkpoint,
    undo,
    redo,
    reset,
    isApplying: () => applyingRef.current,
  };
}
