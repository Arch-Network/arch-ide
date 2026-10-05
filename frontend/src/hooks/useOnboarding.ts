import { useSyncExternalStore } from 'react';

export type OnboardingStep = 'create' | 'build' | 'deploy' | 'invoke';

export const ONBOARDING_STEPS: readonly OnboardingStep[] = ['create', 'build', 'deploy', 'invoke'];

interface OnboardingState {
  open: boolean;
  done: OnboardingStep[];
}

const STORAGE_KEY = 'arch-ide:onboarding';
const EMPTY: OnboardingState = { open: false, done: [] };

const readState = (): OnboardingState => {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (!parsed) return EMPTY;
    return {
      open: parsed.open === true,
      done: ONBOARDING_STEPS.filter((step) => Array.isArray(parsed.done) && parsed.done.includes(step)),
    };
  } catch {
    return EMPTY;
  }
};

let state: OnboardingState = typeof window === 'undefined' ? EMPTY : readState();

const listeners = new Set<() => void>();

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

const getSnapshot = () => state;

const commit = (next: OnboardingState) => {
  state = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // The in-memory state still drives this session.
  }
  for (const l of listeners) l();
};

/** Call only from the code path that performed the step, after it succeeded. */
export const completeOnboardingStep = (step: OnboardingStep) => {
  if (!state.done.includes(step)) commit({ ...state, done: [...state.done, step] });
};

export const setOnboardingOpen = (open: boolean) => {
  if (state.open !== open) commit({ ...state, open });
};

export const useOnboarding = () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
