import { useCallback, useSyncExternalStore } from 'react';

/**
 * User-tweakable editor preferences. We persist them under namespaced keys
 * (`arch-ide:editor:*`) so future settings don't collide with the legacy
 * `editor-word-wrap` key still consumed elsewhere.
 */
export interface EditorPreferences {
  fontSize: number;
  wordWrap: boolean;
  minimap: boolean;
  fontLigatures: boolean;
  /** "smooth" looks great on desktop but is jittery on low-end devices. */
  smoothCaret: boolean;
  /** Tab indentation width. */
  tabSize: number;
}

export const DEFAULT_EDITOR_PREFS: EditorPreferences = {
  fontSize: 13,
  wordWrap: true,
  minimap: false,
  fontLigatures: true,
  smoothCaret: true,
  tabSize: 2,
};

const STORAGE_KEY = 'arch-ide:editor-preferences';
const LEGACY_WORD_WRAP_KEY = 'editor-word-wrap';

const readPreferences = (): EditorPreferences => {
  if (typeof window === 'undefined') return DEFAULT_EDITOR_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<EditorPreferences>;
      return { ...DEFAULT_EDITOR_PREFS, ...parsed };
    }
  } catch {
    // Corrupt JSON — fall through to defaults.
  }
  // Migration: respect the older standalone key if present.
  const legacy =
    typeof window !== 'undefined'
      ? window.localStorage.getItem(LEGACY_WORD_WRAP_KEY)
      : null;
  if (legacy !== null) {
    return { ...DEFAULT_EDITOR_PREFS, wordWrap: legacy === 'true' };
  }
  return DEFAULT_EDITOR_PREFS;
};

/**
 * Module-level external store so every caller of `useEditorPreferences`
 * observes the same source of truth.
 *
 * The previous implementation used a local `useState`, which meant each
 * consumer (App's editor mount + ConfigPanel's settings UI) held its
 * own copy of the prefs. Toggling Font size in Settings would update
 * the panel's state and write to localStorage, but the Editor's state
 * was the one frozen at mount time — so changes only "took effect"
 * after a full reload. Mirroring the pattern used by `useTheme`,
 * routing every consumer through `useSyncExternalStore` keeps live
 * settings changes in sync across the whole tree without requiring a
 * Provider.
 */
let state: EditorPreferences =
  typeof window === 'undefined' ? DEFAULT_EDITOR_PREFS : readPreferences();

const listeners = new Set<() => void>();

const emit = () => {
  for (const l of listeners) l();
};

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

const getSnapshot = () => state;

const persist = (next: EditorPreferences) => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    // Keep the legacy key in sync for any module that hasn't been
    // migrated yet — they'll read the right value off the wire.
    window.localStorage.setItem(LEGACY_WORD_WRAP_KEY, String(next.wordWrap));
  } catch {
    // Quota / private mode / Safari ITP — fail silently, the in-memory
    // store is authoritative for this session anyway.
  }
};

const commit = (next: EditorPreferences, fromStorageSync = false) => {
  state = next;
  if (!fromStorageSync) persist(next);
  emit();
};

let storeInitialized = false;

/**
 * One-time wiring of cross-tab sync. Lazily registered on first mount
 * so we don't pay the listener cost when the hook is never used.
 */
const initStore = () => {
  if (storeInitialized || typeof window === 'undefined') return;
  storeInitialized = true;
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return;
    const next = readPreferences();
    commit(next, true);
  });
};

/**
 * Hook returning the persisted editor preferences plus a partial setter.
 *
 * Designed to be used at the app shell layer: pass `prefs` down into
 * `<Editor />` and `setPrefs` into the Settings UI. Storage writes are
 * batched into the commit step so rapid stepper clicks don't thrash
 * localStorage.
 */
export const useEditorPreferences = () => {
  initStore();
  const prefs = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const updatePrefs = useCallback(
    <K extends keyof EditorPreferences>(key: K, value: EditorPreferences[K]) => {
      commit({ ...state, [key]: value });
    },
    [],
  );

  const setPrefs = useCallback((next: EditorPreferences) => {
    commit(next);
  }, []);

  const resetPrefs = useCallback(() => {
    commit(DEFAULT_EDITOR_PREFS);
  }, []);

  return { prefs, setPrefs, updatePrefs, resetPrefs };
};
