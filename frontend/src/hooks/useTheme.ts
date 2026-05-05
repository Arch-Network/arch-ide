import { useCallback, useSyncExternalStore } from 'react';

/**
 * The three states the theme picker exposes. We keep "system" as a
 * first-class option (rather than just light/dark) because users who
 * switch their OS theme during the day expect the IDE to follow.
 */
export type Theme = 'light' | 'dark' | 'system';

/** Resolved theme — what's actually applied to the DOM at this moment. */
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'arch-ide:theme';

const readStoredTheme = (): Theme => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw;
  } catch {
    /* localStorage may be unavailable in private mode */
  }
  return 'dark';
};

const detectResolved = (theme: Theme): ResolvedTheme => {
  if (theme === 'system') {
    return typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }
  return theme;
};

/**
 * Apply the resolved theme by toggling `.dark` on `<html>`, syncing
 * `color-scheme`, and updating the iOS `theme-color` meta. The CSS
 * variables in `index.css` are organized so `:root` carries light
 * tokens and `.dark` overrides them — toggling the class flips every
 * Tailwind utility (`bg-background`, `text-foreground`, `border-border`)
 * plus all our semantic tokens at once.
 */
const applyResolvedTheme = (resolved: ResolvedTheme) => {
  const root = document.documentElement;
  if (resolved === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  root.style.colorScheme = resolved;

  const meta = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]',
  );
  if (meta) {
    meta.setAttribute('content', resolved === 'dark' ? '#0a0a0a' : '#f7f7f7');
  }
};

/**
 * Tiny external store
 * -------------------
 * Multiple components call `useTheme()` (TopBar, Editor, …) and they
 * MUST observe the same source of truth — otherwise toggling in one
 * place leaves the others rendering against stale state.
 *
 * We use `useSyncExternalStore` instead of React Context because:
 *   1. The store needs to react to OS theme changes (matchMedia) and
 *      cross-tab `storage` events, which fits the subscribe model
 *      better than re-rendering a Provider tree.
 *   2. No Provider plumbing — any component can call `useTheme()` and
 *      stay in sync, no matter where it sits in the tree.
 */
interface ThemeState {
  theme: Theme;
  resolved: ResolvedTheme;
}

let state: ThemeState = (() => {
  // SSR-safe default; on the client this immediately gets replaced by
  // the real value via `initStore` below.
  if (typeof window === 'undefined') {
    return { theme: 'dark', resolved: 'dark' };
  }
  const t = readStoredTheme();
  return { theme: t, resolved: detectResolved(t) };
})();

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

/**
 * Push a new theme through the store: persist, recompute the
 * resolved value, mutate the DOM, and notify subscribers.
 *
 * Centralizing these side-effects here means the same code path
 * runs whether the change came from the user (`setTheme`), an OS
 * preference flip (matchMedia listener), or another tab
 * (storage event).
 */
const commit = (next: Theme, fromStorageSync = false) => {
  const resolved = detectResolved(next);
  state = { theme: next, resolved };
  if (!fromStorageSync) {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* swallow */
    }
  }
  applyResolvedTheme(resolved);
  emit();
};

let storeInitialized = false;

/**
 * One-time wiring of the global listeners. Called from inside the
 * hook so it runs lazily on first mount, but guarded so multiple
 * `useTheme` callers don't double-register handlers.
 */
const initStore = () => {
  if (storeInitialized || typeof window === 'undefined') return;
  storeInitialized = true;

  // Apply on first init so the DOM matches the stored value even if
  // the inline `<script>` in index.html somehow didn't run.
  applyResolvedTheme(state.resolved);

  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  const onMql = () => {
    if (state.theme !== 'system') return;
    commit('system');
  };
  if (mql.addEventListener) {
    mql.addEventListener('change', onMql);
  } else {
    mql.addListener(onMql);
  }

  // Cross-tab sync: if the user flips the theme in another tab,
  // mirror it here so every IDE window stays consistent.
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY) return;
    const next = readStoredTheme();
    if (next !== state.theme) commit(next, true);
  });
};

/**
 * React hook for theme state.
 *
 * Returns the user's preference (`theme`), the currently applied
 * value (`resolvedTheme`), and a setter. Every consumer subscribes
 * to the same external store, so toggling in one component
 * propagates instantly to all the others.
 */
export function useTheme() {
  initStore();

  // SSR fallback uses the same snapshot since we always have one.
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const setTheme = useCallback((next: Theme) => commit(next), []);

  const cycleTheme = useCallback(() => {
    const order: Record<Theme, Theme> = {
      light: 'dark',
      dark: 'system',
      system: 'light',
    };
    commit(order[state.theme]);
  }, []);

  // Re-export for ergonomic destructuring; `theme` is the user's
  // pick and `resolvedTheme` is what actually paints the UI.
  return {
    theme: snapshot.theme,
    resolvedTheme: snapshot.resolved,
    setTheme,
    cycleTheme,
  };
}
