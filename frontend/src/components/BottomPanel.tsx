import React, { useMemo, useState } from 'react';
import { Terminal, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { Output, type OutputMessage } from './Output';
import ResizeHandle from './ResizeHandle';
import { cn } from '@/lib/utils';

type BottomTabId = 'output' | 'problems';

interface BottomTabConfig {
  id: BottomTabId;
  label: string;
  icon: React.ReactNode;
  /** Optional badge count (e.g. number of problems). */
  count?: number;
  /** Optional severity class for the badge. */
  badgeTone?: 'default' | 'danger' | 'warning';
}

interface BottomPanelProps {
  height: number;
  onResizeStart: (event: React.MouseEvent) => void;
  messages: OutputMessage[];
  onClear: () => void;
  /** When true the panel renders only its tab strip. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

/**
 * Tabbed bottom dock.
 *
 * Today: Output console + a Problems view derived from `error`-level messages.
 * Tomorrow (Phase 2 follow-ups): Transactions + Network. We keep tab state in
 * local component state because users rarely care about persisting which
 * bottom tab was active across reloads — Output should be the default.
 */
export const BottomPanel: React.FC<BottomPanelProps> = ({
  height,
  onResizeStart,
  messages,
  onClear,
  collapsed = false,
  onToggleCollapsed,
}) => {
  const [activeTab, setActiveTab] = useState<BottomTabId>('output');

  const problems = useMemo(
    () => messages.filter((msg) => msg.type === 'error'),
    [messages],
  );

  const tabs: BottomTabConfig[] = [
    {
      id: 'output',
      label: 'Output',
      icon: <Terminal className="h-3.5 w-3.5" aria-hidden="true" />,
    },
    {
      id: 'problems',
      label: 'Problems',
      icon: <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />,
      count: problems.length,
      badgeTone: problems.length > 0 ? 'danger' : 'default',
    },
  ];

  const renderBadge = (tab: BottomTabConfig) => {
    if (tab.count === undefined || tab.count === 0) return null;
    return (
      <span
        className={cn(
          'ml-1 inline-flex min-w-[18px] justify-center rounded-full px-1 py-0.5 text-[10px] leading-none border',
          tab.badgeTone === 'danger' && 'bg-danger/15 text-danger border-danger/30',
          tab.badgeTone === 'warning' && 'bg-warning/15 text-warning border-warning/30',
          tab.badgeTone === 'default' && 'bg-accent text-foreground/70 border-border',
        )}
        aria-label={`${tab.count} ${tab.label.toLowerCase()}`}
      >
        {tab.count > 99 ? '99+' : tab.count}
      </span>
    );
  };

  return (
    <div
      style={{ height: collapsed ? undefined : height }}
      className={cn(
        'flex flex-col flex-shrink-0 border-t border-border bg-background',
        collapsed && 'h-9',
      )}
    >
      {!collapsed && <ResizeHandle onMouseDown={onResizeStart} />}

      <div className="flex items-center justify-between bg-surface-1 border-b border-border" role="tablist" aria-label="Bottom panel">
        <div className="flex items-center">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id && !collapsed;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                tabIndex={isActive ? 0 : -1}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors border-b-2',
                  isActive
                    ? 'border-brand text-foreground'
                    : 'border-transparent text-muted-foreground hover:text-foreground',
                )}
                onClick={() => {
                  if (collapsed) onToggleCollapsed?.();
                  setActiveTab(tab.id);
                }}
              >
                {tab.icon}
                <span>{tab.label}</span>
                {renderBadge(tab)}
              </button>
            );
          })}
        </div>

        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="px-2 py-1.5 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            aria-label={collapsed ? 'Expand bottom panel' : 'Collapse bottom panel'}
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="flex-1 min-h-0">
          {activeTab === 'output' && (
            <Output messages={messages} onClear={onClear} />
          )}
          {activeTab === 'problems' && (
            <ProblemsView problems={problems} />
          )}
        </div>
      )}
    </div>
  );
};

const ProblemsView: React.FC<{ problems: OutputMessage[] }> = ({ problems }) => {
  if (problems.length === 0) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground gap-2 px-4 text-center">
        <AlertTriangle className="h-6 w-6 text-success/70" aria-hidden="true" />
        <p className="text-sm">No problems detected</p>
        <p className="text-xs text-muted-foreground/70">
          Build errors and runtime issues will appear here
        </p>
      </div>
    );
  }

  return (
    <ul className="h-full overflow-y-auto custom-scrollbar divide-y divide-border" role="list">
      {problems.map((problem, index) => (
        <li
          key={`${problem.id ?? index}-${index}`}
          className="flex items-start gap-2 px-3 py-2 hover:bg-accent/40 transition-colors"
        >
          <AlertTriangle
            className="h-3.5 w-3.5 text-danger mt-0.5 flex-shrink-0"
            aria-hidden="true"
          />
          <div className="flex-1 min-w-0">
            <pre className="text-xs text-foreground/90 whitespace-pre-wrap break-words font-mono">
              {problem.content}
            </pre>
            {problem.timestamp && (
              <p className="mt-1 text-[10px] text-muted-foreground">
                {new Date(problem.timestamp).toLocaleTimeString()}
              </p>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
};

export default BottomPanel;
