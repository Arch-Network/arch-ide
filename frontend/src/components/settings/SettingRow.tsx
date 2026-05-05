import React from 'react';
import { cn } from '@/lib/utils';

interface SettingRowProps {
  label: React.ReactNode;
  description?: string;
  htmlFor?: string;
  children: React.ReactNode;
  /** When true, label and control stack vertically (use for inputs that need full width). */
  vertical?: boolean;
}

/**
 * Layout primitive used by every settings section. Keeping a single atom
 * means alignment, spacing, and a11y wiring (`htmlFor` ↔ control `id`) stay
 * consistent across General / Editor / Network / Keymap.
 */
export const SettingRow: React.FC<SettingRowProps> = ({
  label,
  description,
  htmlFor,
  children,
  vertical = false,
}) => {
  return (
    <div
      className={cn(
        'py-3 first:pt-0 last:pb-0',
        vertical ? 'space-y-2' : 'flex items-center justify-between gap-4',
      )}
    >
      <div className={cn('min-w-0', vertical ? 'space-y-0.5' : 'flex-1 space-y-0.5')}>
        {htmlFor ? (
          <label
            htmlFor={htmlFor}
            className="block text-sm font-medium text-foreground/90"
          >
            {label}
          </label>
        ) : (
          <div className="block text-sm font-medium text-foreground/90">{label}</div>
        )}
        {description && (
          <p className="text-[11px] text-muted-foreground leading-snug">
            {description}
          </p>
        )}
      </div>
      <div className={cn(vertical ? 'w-full' : 'flex-shrink-0')}>{children}</div>
    </div>
  );
};

interface SettingGroupProps {
  title?: string;
  description?: string;
  children: React.ReactNode;
}

export const SettingGroup: React.FC<SettingGroupProps> = ({ title, description, children }) => (
  <section className="border-b border-border last:border-b-0 pb-4 mb-4 last:mb-0 last:pb-0">
    {title && (
      <header className="mb-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h3>
        {description && (
          <p className="text-[11px] text-muted-foreground/80 mt-0.5">{description}</p>
        )}
      </header>
    )}
    <div className="divide-y divide-border/40">{children}</div>
  </section>
);
