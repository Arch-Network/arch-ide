import React from 'react';
import { cn } from '@/lib/utils';

interface SectionHeaderAction {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  emphasis?: 'primary' | 'default';
}

interface SectionHeaderProps {
  title: string;
  icon: React.ReactNode;
  actions?: SectionHeaderAction[];
  alwaysShowActions?: boolean;
}

const SectionHeader: React.FC<SectionHeaderProps> = ({ title, icon, actions, alwaysShowActions }) => {
  return (
    <div className="sticky top-0 z-sticky bg-surface-1/95 backdrop-blur-sm border-b border-border">
      <div className="flex items-center justify-between px-3 py-1.5 group">
        <div className="flex items-center gap-1.5">
          {icon}
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
        </div>
        {actions && actions.length > 0 && (
          <div className={cn(
            "flex items-center gap-1 transition-opacity duration-150",
            alwaysShowActions ? "opacity-100" : "opacity-0 group-hover:opacity-100 focus-within:opacity-100",
          )}>
            {actions.map((action, idx) => {
              const isPrimary = action.emphasis === 'primary';
              return (
                <button
                  key={idx}
                  type="button"
                  className={cn(
                    "transition-colors duration-150",
                    isPrimary
                      ? "bg-brand hover:bg-brand-hover text-brand-foreground font-semibold px-2 py-0.5 rounded-md flex items-center gap-1"
                      : "hover:bg-accent p-1 rounded-md text-muted-foreground hover:text-foreground",
                    "disabled:opacity-40 disabled:cursor-not-allowed",
                  )}
                  onClick={action.onClick}
                  disabled={action.disabled}
                  title={action.label}
                  aria-label={action.label}
                >
                  {action.icon}
                  {isPrimary && <span className="text-xs">{action.label}</span>}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default SectionHeader;
