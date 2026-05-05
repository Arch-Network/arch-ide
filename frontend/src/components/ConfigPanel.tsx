import React, { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import {
  X,
  Settings as SettingsIcon,
  Globe,
  Bitcoin,
  Code2,
  Keyboard,
  Info,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './ui/button';
import GeneralSection from './settings/sections/GeneralSection';
import EditorSection from './settings/sections/EditorSection';
import NetworkSection from './settings/sections/NetworkSection';
import BitcoinSection from './settings/sections/BitcoinSection';
import KeymapSection from './settings/sections/KeymapSection';
import AboutSection from './settings/sections/AboutSection';
import { useEditorPreferences } from '../hooks/useEditorPreferences';
import type { Config } from '../types';

interface ConfigPanelProps {
  isOpen: boolean;
  onClose: () => void;
  config: Config;
  onConfigChange: Dispatch<SetStateAction<Config>>;
  onClearAllProjects?: () => void;
}

type TabId = 'general' | 'editor' | 'network' | 'bitcoin' | 'keymap' | 'about';

interface TabSpec {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabSpec[] = [
  { id: 'general', label: 'General', icon: <SettingsIcon className="h-3.5 w-3.5" /> },
  { id: 'editor', label: 'Editor', icon: <Code2 className="h-3.5 w-3.5" /> },
  { id: 'network', label: 'Network', icon: <Globe className="h-3.5 w-3.5" /> },
  { id: 'bitcoin', label: 'Bitcoin', icon: <Bitcoin className="h-3.5 w-3.5" /> },
  { id: 'keymap', label: 'Keymap', icon: <Keyboard className="h-3.5 w-3.5" /> },
  { id: 'about', label: 'About', icon: <Info className="h-3.5 w-3.5" /> },
];

/**
 * Tabbed settings surface.
 *
 * Layout: a left-rail of categories + a content pane. We ship Radix-style
 * keyboard nav (arrow up/down moves between tabs) so power users never need
 * the mouse. Each section is a self-contained component to keep the file
 * small and to make it cheap to add new tabs (Wallet, Appearance) later.
 */
export const ConfigPanel: React.FC<ConfigPanelProps> = ({
  isOpen,
  onClose,
  config,
  onConfigChange,
  onClearAllProjects,
}) => {
  const [activeTab, setActiveTab] = useState<TabId>('general');
  const { prefs, updatePrefs, resetPrefs } = useEditorPreferences();

  // Close on Escape, regardless of which control owns focus.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleTabKeyDown = (e: React.KeyboardEvent, tabId: TabId) => {
    const currentIndex = TABS.findIndex((tab) => tab.id === tabId);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      const next = TABS[(currentIndex + 1) % TABS.length];
      setActiveTab(next.id);
      (e.currentTarget.parentElement?.querySelector(`[data-tab-id="${next.id}"]`) as HTMLElement)?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const prev = TABS[(currentIndex - 1 + TABS.length) % TABS.length];
      setActiveTab(prev.id);
      (e.currentTarget.parentElement?.querySelector(`[data-tab-id="${prev.id}"]`) as HTMLElement)?.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-modal p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-3xl h-[min(640px,90vh)] flex overflow-hidden">
        {/* Left rail */}
        <aside
          className="w-44 flex-shrink-0 border-r border-border bg-surface-1 flex flex-col"
          aria-label="Settings categories"
        >
          <div className="px-4 py-4 border-b border-border">
            <h2 className="text-sm font-semibold text-foreground">Settings</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">Configure the IDE</p>
          </div>
          <nav
            role="tablist"
            aria-orientation="vertical"
            className="flex-1 py-2 space-y-0.5 px-2"
          >
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  data-tab-id={tab.id}
                  aria-selected={isActive}
                  aria-controls={`settings-panel-${tab.id}`}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => setActiveTab(tab.id)}
                  onKeyDown={(e) => handleTabKeyDown(e, tab.id)}
                  className={cn(
                    'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[13px] transition-colors',
                    isActive
                      ? 'bg-brand/15 text-brand'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent',
                  )}
                >
                  <span aria-hidden="true">{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Content */}
        <section
          id={`settings-panel-${activeTab}`}
          role="tabpanel"
          aria-labelledby={`settings-tab-${activeTab}`}
          className="flex-1 flex flex-col min-w-0"
        >
          <header className="flex items-center justify-between px-6 py-3.5 border-b border-border">
            <h3 className="text-sm font-semibold text-foreground">
              {TABS.find((t) => t.id === activeTab)?.label}
            </h3>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-7 w-7 text-muted-foreground hover:text-foreground hover:bg-accent"
              aria-label="Close settings"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </header>

          <div className="flex-1 overflow-y-auto custom-scrollbar px-6 py-5">
            {activeTab === 'general' && (
              <GeneralSection onClearAllProjects={onClearAllProjects} />
            )}
            {activeTab === 'editor' && (
              <EditorSection
                prefs={prefs}
                onUpdate={updatePrefs}
                onReset={resetPrefs}
              />
            )}
            {activeTab === 'network' && (
              <NetworkSection config={config} onConfigChange={onConfigChange} />
            )}
            {activeTab === 'bitcoin' && (
              <BitcoinSection config={config} onConfigChange={onConfigChange} />
            )}
            {activeTab === 'keymap' && <KeymapSection />}
            {activeTab === 'about' && <AboutSection />}
          </div>
        </section>
      </div>
    </div>
  );
};
