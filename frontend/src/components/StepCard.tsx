import React, { useState } from 'react';
import { Check, ChevronDown, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type StepStatus = 'pending' | 'complete' | 'active' | 'error';

interface StepCardProps {
  step: number;
  title: string;
  status?: StepStatus;
  actions?: React.ReactNode;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  isLast?: boolean;
}

const statusConfig: Record<StepStatus, { ring: string; bg: string; text: string; icon?: React.ReactNode }> = {
  pending: {
    ring: 'ring-gray-600',
    bg: 'bg-gray-700/80',
    text: 'text-gray-400',
  },
  active: {
    ring: 'ring-[#F7931A]/60',
    bg: 'bg-[#F7931A]/20',
    text: 'text-[#F7931A]',
  },
  complete: {
    ring: 'ring-emerald-500/60',
    bg: 'bg-emerald-500/20',
    text: 'text-emerald-400',
    icon: <Check className="h-3 w-3" />,
  },
  error: {
    ring: 'ring-red-500/60',
    bg: 'bg-red-500/20',
    text: 'text-red-400',
    icon: <AlertCircle className="h-3 w-3" />,
  },
};

export const StepCard: React.FC<StepCardProps> = ({
  step,
  title,
  status = 'pending',
  actions,
  children,
  collapsible = false,
  defaultCollapsed = false,
  isLast = false,
}) => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const config = statusConfig[status];

  return (
    <div className="relative flex gap-3">
      {/* Vertical stepper connector */}
      <div className="flex flex-col items-center flex-shrink-0 pt-0.5">
        {/* Step circle */}
        <div
          className={cn(
            'h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold ring-2 transition-all duration-300',
            config.ring,
            config.bg,
            config.text,
          )}
        >
          {config.icon || step}
        </div>
        {/* Connector line */}
        {!isLast && (
          <div className={cn(
            'w-px flex-1 mt-2 transition-colors duration-300',
            status === 'complete' ? 'bg-emerald-500/30' : 'bg-gray-700/60',
          )} />
        )}
      </div>

      {/* Card content */}
      <div className="flex-1 min-w-0 pb-5">
        <section
          className={cn(
            'rounded-lg border transition-all duration-200',
            status === 'complete'
              ? 'border-emerald-500/20 bg-gray-800/40'
              : status === 'active'
                ? 'border-[#F7931A]/20 bg-gray-800/60 shadow-sm shadow-[#F7931A]/5'
                : status === 'error'
                  ? 'border-red-500/20 bg-gray-800/40'
                  : 'border-gray-700/40 bg-gray-800/40',
          )}
        >
          {/* Header */}
          <div
            className={cn(
              'flex items-center justify-between px-4 py-3',
              collapsible && 'cursor-pointer select-none',
            )}
            onClick={collapsible ? () => setIsCollapsed(!isCollapsed) : undefined}
          >
            <div className="flex items-center gap-2 min-w-0">
              <h3 className="text-sm font-semibold tracking-wide uppercase text-gray-200">
                {title}
              </h3>
              {status === 'complete' && (
                <span className="text-[10px] font-medium text-emerald-400/80 bg-emerald-500/10 px-1.5 py-0.5 rounded">
                  Done
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              {actions}
              {collapsible && (
                <ChevronDown
                  className={cn(
                    'h-4 w-4 text-gray-500 transition-transform duration-200',
                    isCollapsed && '-rotate-90',
                  )}
                />
              )}
            </div>
          </div>

          {/* Body */}
          <div
            className={cn(
              'overflow-hidden transition-all duration-200',
              isCollapsed ? 'max-h-0' : 'max-h-[600px]',
            )}
          >
            <div className="px-4 pb-4 space-y-3">
              {children}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default StepCard;
