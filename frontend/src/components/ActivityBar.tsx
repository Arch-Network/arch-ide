import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from './ui/tooltip';

export interface ActivityBarItem<TViewId extends string = string> {
  id: TViewId;
  label: string;
  icon: React.ReactNode;
  /** Optional notification dot rendered in the corner. */
  hasIndicator?: boolean;
  /** Optional Cypress/tutorial hook. */
  testId?: string;
}

interface ActivityBarProps<TViewId extends string = string> {
  items: ActivityBarItem<TViewId>[];
  current: TViewId;
  onChange: (id: TViewId) => void;
  /**
   * Layout orientation:
   *   - "horizontal" → strip across the top of the sidebar (current behavior).
   *   - "vertical"   → narrow column on the far left (VS Code style; future use).
   */
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

/**
 * Extensible activity bar replacing the hand-rolled two-button toggle.
 *
 * Adding a new view = appending one entry to the `items` array. The component
 * stays presentational; routing remains in `App.tsx`'s `currentView` state so
 * we don't re-architect navigation just to swap chrome.
 */
export const ActivityBar = <TViewId extends string>({
  items,
  current,
  onChange,
  orientation = 'horizontal',
  className,
}: ActivityBarProps<TViewId>) => {
  const isVertical = orientation === 'vertical';

  return (
    <TooltipProvider delayDuration={300}>
      <div
        role="tablist"
        aria-label="Sidebar views"
        aria-orientation={isVertical ? 'vertical' : 'horizontal'}
        className={cn(
          'flex border-border',
          isVertical
            ? 'flex-col w-12 border-r bg-surface-1 py-2 gap-1'
            : 'border-b',
          className,
        )}
      >
        {items.map((item) => {
          const isActive = current === item.id;
          const button = (
            <Button
              key={item.id}
              variant="ghost"
              size="sm"
              role="tab"
              aria-selected={isActive}
              data-tutorial={item.testId}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(item.id)}
              className={cn(
                'relative transition-colors',
                isVertical
                  ? 'h-10 w-10 mx-auto rounded-lg'
                  : 'flex-1 rounded-none border-b-2 h-9',
                !isVertical && isActive && 'bg-surface-2 border-brand text-foreground',
                !isVertical && !isActive &&
                  'border-transparent text-muted-foreground hover:text-foreground',
                isVertical && isActive && 'bg-surface-2 text-brand',
                isVertical && !isActive && 'text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
            >
              <span className="inline-flex items-center gap-2">
                <span aria-hidden="true">{item.icon}</span>
                {!isVertical && <span>{item.label}</span>}
              </span>
              {item.hasIndicator && (
                <span
                  className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-brand"
                  aria-hidden="true"
                />
              )}
            </Button>
          );

          if (!isVertical) return button;

          return (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>{button}</TooltipTrigger>
              <TooltipContent side="right">
                <p className="text-xs">{item.label}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </TooltipProvider>
  );
};

export default ActivityBar;
