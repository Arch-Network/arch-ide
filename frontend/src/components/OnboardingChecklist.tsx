import React from 'react';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ONBOARDING_STEPS, setOnboardingOpen, useOnboarding, type OnboardingStep } from '../hooks/useOnboarding';
import type { SidebarView } from '../utils/storage';

interface OnboardingChecklistProps {
  onNewProject: () => void;
  onViewChange: (view: SidebarView) => void;
}

// Actions only open always-visible surfaces (a sidebar tab or the New Project dialog).
const STEP_COPY: Record<OnboardingStep, { label: string; hint: string; action: string; view?: SidebarView }> = {
  create: {
    label: 'Create a project',
    hint: 'Choose Satellite: its build produces the IDL the Invoke step uses.',
    action: 'New project',
  },
  build: {
    label: 'Build it',
    hint: 'Press Build at the top of the Build tab.',
    action: 'Open Build tab',
    view: 'build',
  },
  deploy: {
    label: 'Deploy it',
    hint: 'On the Build tab, add a program keypair with +, generate an authority and get faucet funds, then press Deploy.',
    action: 'Open Build tab',
    view: 'build',
  },
  invoke: {
    label: 'Invoke an instruction',
    hint: 'On the Inspect tab, open Invoke, fill in an instruction and submit it.',
    action: 'Open Inspect tab',
    view: 'inspector',
  },
};

export const OnboardingChecklist: React.FC<OnboardingChecklistProps> = ({ onNewProject, onViewChange }) => {
  const { open, done } = useOnboarding();
  if (!open) return null;

  const current = ONBOARDING_STEPS.find((step) => !done.includes(step));

  return (
    <section aria-label="Getting started" className="border-b border-border bg-surface-2/60 px-4 py-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground/90">
          Getting started
          <span className="ml-2 font-mono font-normal text-muted-foreground">
            {done.length}/{ONBOARDING_STEPS.length}
          </span>
        </h3>
        <button
          type="button"
          onClick={() => setOnboardingOpen(false)}
          className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          aria-label="Hide getting started checklist"
          title="Hide (reopen from the project menu)"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <ol className="space-y-1.5">
        {ONBOARDING_STEPS.map((step, index) => {
          const copy = STEP_COPY[step];
          const isDone = done.includes(step);
          const isCurrent = step === current;
          return (
            <li key={step} aria-current={isCurrent ? 'step' : undefined} className="flex items-start gap-2 min-w-0">
              <span
                className={cn(
                  'mt-0.5 h-5 w-5 rounded-full flex items-center justify-center shrink-0 text-[10px] font-semibold',
                  isDone ? 'bg-success/15 text-success' : isCurrent ? 'bg-brand/15 text-brand' : 'bg-surface-3 text-muted-foreground',
                )}
              >
                {isDone ? <Check className="h-3 w-3" aria-hidden="true" /> : index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn('text-xs font-medium', isCurrent ? 'text-foreground' : 'text-muted-foreground')}>
                  {copy.label}
                  {isDone && <span className="sr-only"> (done)</span>}
                </p>
                {isCurrent && (
                  <>
                    <p className="text-[11px] leading-snug text-muted-foreground mt-0.5">{copy.hint}</p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-1.5 h-7"
                      onClick={() => (copy.view ? onViewChange(copy.view) : onNewProject())}
                    >
                      {copy.action}
                    </Button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {!current && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">Your program is built, deployed and invoked.</p>
          <Button size="sm" variant="outline" className="h-7" onClick={() => setOnboardingOpen(false)}>
            Close
          </Button>
        </div>
      )}
    </section>
  );
};

export default OnboardingChecklist;
