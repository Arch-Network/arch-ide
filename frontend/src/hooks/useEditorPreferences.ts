import { useCallback, useEffect, useState } from 'react';

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
  const legacy = window.localStorage.getItem(LEGACY_WORD_WRAP_KEY);
  if (legacy !== null) {
    return { ...DEFAULT_EDITOR_PREFS, wordWrap: legacy === 'true' };
  }
  return DEFAULT_EDITOR_PREFS;
};

/**
 * Hook returning the persisted editor preferences plus a partial setter.
 *
 * Designed to be used at the app shell layer: pass `prefs` down into
 * `<Editor />` and `setPrefs` into the Settings UI. Storage writes are batched
 * by React's render cycle so rapid slider drags won't thrash localStorage.
 */
export const useEditorPreferences = () => {
  const [prefs, setPrefs] = useState<EditorPreferences>(readPreferences);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
      // Keep legacy key in sync so any other module still reading it stays
      // consistent until they are migrated.
      window.localStorage.setItem(LEGACY_WORD_WRAP_KEY, String(prefs.wordWrap));
    } catch {
      // Quota / private mode — fail silently.
    }
  }, [prefs]);

  const updatePrefs = useCallback(<K extends keyof EditorPreferences>(
    key: K,
    value: EditorPreferences[K],
  ) => {
    setPrefs((current) => ({ ...current, [key]: value }));
  }, []);

  const resetPrefs = useCallback(() => setPrefs(DEFAULT_EDITOR_PREFS), []);

  return { prefs, setPrefs, updatePrefs, resetPrefs };
};
