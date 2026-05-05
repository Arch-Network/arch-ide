import React, { useMemo, useState } from 'react';
import { Eye, Database, Send, History as HistoryIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import IdlImporter from './IdlImporter';
import OverviewTab from './sections/OverviewTab';
import AccountsTab from './sections/AccountsTab';
import InvokeTab from './sections/InvokeTab';
import HistoryTab from './sections/HistoryTab';
import { hexToBase58 } from '../../utils/base58';
import type { ArchIdl, InvokeHistoryEntry, Project } from '../../types';
import type { Config } from '../../types/config';
import type { ProjectMutations } from './projectMutations';

interface ProgramInspectorProps {
  project: Project | null;
  config: Config;
  onIdlChange: (idl: ArchIdl | null) => void;
  mutations: ProjectMutations;
}

type InspectorTab = 'overview' | 'accounts' | 'invoke' | 'history';

interface TabSpec {
  id: InspectorTab;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabSpec[] = [
  { id: 'overview', label: 'Overview', icon: <Eye className="h-3 w-3" aria-hidden="true" /> },
  { id: 'accounts', label: 'Accounts', icon: <Database className="h-3 w-3" aria-hidden="true" /> },
  { id: 'invoke', label: 'Invoke', icon: <Send className="h-3 w-3" aria-hidden="true" /> },
  { id: 'history', label: 'History', icon: <HistoryIcon className="h-3 w-3" aria-hidden="true" /> },
];

/**
 * Top-level Program Inspector view.
 *
 * Layout: a thin sub-tab strip (Overview / Accounts / Invoke) over the
 * IDL-aware content. When no IDL is present we render the importer as the
 * empty state instead of locking out all three tabs — Accounts still works
 * without an IDL (raw bytes only), but Overview and Invoke truly need it.
 */
export const ProgramInspector: React.FC<ProgramInspectorProps> = ({
  project,
  config,
  onIdlChange,
  mutations,
}) => {
  const [activeTab, setActiveTab] = useState<InspectorTab>('overview');
  const [showReplaceImporter, setShowReplaceImporter] = useState(false);

  /**
   * Pending replay payload — set when the user clicks "Re-run" on a
   * history entry. The Invoke tab consumes it on next render to
   * rehydrate its form state, then clears it so the same entry isn't
   * applied twice. We keep the value here (rather than in InvokeTab's
   * own state) so the tab can be unmounted between renders without
   * losing the queued replay.
   */
  const [pendingReplay, setPendingReplay] = useState<InvokeHistoryEntry | null>(null);

  const idl = project?.idl ?? null;

  // Quick-fill suggestions for the account inspector.
  const suggestions = useMemo(() => {
    const list: { label: string; address: string }[] = [];
    if (project?.account?.pubkey) {
      list.push({ label: 'Program', address: hexToBase58(project.account.pubkey) });
    }
    if (project?.authorityAccount?.pubkey) {
      list.push({ label: 'Authority', address: hexToBase58(project.authorityAccount.pubkey) });
    }
    return list;
  }, [project?.account?.pubkey, project?.authorityAccount?.pubkey]);

  if (!project) {
    return (
      <div className="flex h-full items-center justify-center px-4">
        <p className="text-xs text-muted-foreground text-center">
          Open a project to use the Program Inspector.
        </p>
      </div>
    );
  }

  if (!idl && !showReplaceImporter) {
    return (
      <div className="flex flex-col h-full">
        <Header onReplace={null} />
        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-6">
          <IdlImporter onImport={(parsed) => onIdlChange(parsed)} />
        </div>
      </div>
    );
  }

  if (showReplaceImporter) {
    return (
      <div className="flex flex-col h-full">
        <Header onReplace={null} title="Replace IDL" />
        <div className="flex-1 overflow-y-auto custom-scrollbar px-4 py-4">
          <IdlImporter
            compact
            onImport={(parsed) => {
              onIdlChange(parsed);
              setShowReplaceImporter(false);
            }}
            onCancel={() => setShowReplaceImporter(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <Header onReplace={() => setShowReplaceImporter(true)} />

      <div
        role="tablist"
        aria-label="Program Inspector views"
        className="flex border-b border-border bg-surface-1"
      >
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium border-b-2 transition-colors',
                isActive
                  ? 'border-brand text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {activeTab === 'overview' && idl && (
          <OverviewTab
            idl={idl}
            onReplaceIdl={() => setShowReplaceImporter(true)}
            onClearIdl={() => onIdlChange(null)}
          />
        )}
        {activeTab === 'accounts' && (
          <AccountsTab idl={idl} config={config} suggestions={suggestions} />
        )}
        {activeTab === 'invoke' && (
          <InvokeTab
            idl={idl}
            project={project}
            config={config}
            mutations={mutations}
            replayEntry={pendingReplay}
            onReplayConsumed={() => setPendingReplay(null)}
          />
        )}
        {activeTab === 'history' && (
          <HistoryTab
            idl={idl}
            project={project}
            mutations={mutations}
            onReplay={(entry) => {
              setPendingReplay(entry);
              setActiveTab('invoke');
            }}
          />
        )}
      </div>
    </div>
  );
};

const Header: React.FC<{ onReplace: (() => void) | null; title?: string }> = ({
  onReplace,
  title,
}) => (
  <div className="flex items-center justify-between px-3 py-2 border-b border-border">
    <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {title ?? 'Program Inspector'}
    </h2>
    {onReplace && (
      <button
        type="button"
        onClick={onReplace}
        className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
      >
        Replace IDL
      </button>
    )}
  </div>
);

export default ProgramInspector;
