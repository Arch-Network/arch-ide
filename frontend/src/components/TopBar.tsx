import React from 'react';
import { PanelLeft, Settings, Search } from 'lucide-react';
import { Button } from './ui/button';
import ProjectList from './ProjectList';
import { ThemeToggle } from './ThemeToggle';
import { Logo } from './Logo';
import type { Project } from '../types';

interface TopBarProps {
  projects: Project[];
  currentProject: Project | null;
  onSelectProject: (project: Project, clearOpenFiles?: boolean) => void;
  onNewProject: () => void;
  onDeleteProject: (id: string) => Promise<void>;
  onProjectsChange: (projects: Project[]) => void;
  onDeleteAllProjects: () => Promise<void>;
  onOpenSettings: () => void;
  onOpenMobileSidebar: () => void;
  onOpenCommandPalette: () => void;
}

const detectMac = () =>
  typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

/**
 * Slim top bar: branding + project selector + global actions.
 *
 * Lives outside the workbench split so it never overlaps Monaco's overflow
 * widgets and keeps a stable height. Mobile shows a `PanelLeft` button to
 * reveal the sidebar drawer; desktop hides it via `md:hidden`.
 */
export const TopBar: React.FC<TopBarProps> = ({
  projects,
  currentProject,
  onSelectProject,
  onNewProject,
  onDeleteProject,
  onProjectsChange,
  onDeleteAllProjects,
  onOpenSettings,
  onOpenMobileSidebar,
  onOpenCommandPalette,
}) => {
  const isMac = detectMac();
  const cmdLabel = isMac ? '⌘ K' : 'Ctrl K';

  return (
    <nav
      className="flex items-center justify-between gap-3 px-3 py-1.5 md:px-4 md:py-1.5 bg-surface-1 border-b border-border/60"
      aria-label="Application"
    >
      <div className="flex items-center gap-2.5 min-w-0 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden h-8 w-8"
          onClick={onOpenMobileSidebar}
          aria-label="Open sidebar"
        >
          <PanelLeft className="h-5 w-5" aria-hidden="true" />
        </Button>
        <Logo className="h-5 w-auto md:h-6 text-foreground" />
        <span className="hidden md:inline text-sm font-semibold tracking-wide text-muted-foreground">
          IDE
        </span>
      </div>

      <div className="flex items-center gap-1.5 min-w-0">
        <button
          type="button"
          onClick={onOpenCommandPalette}
          aria-label="Open command palette"
          className="hidden md:inline-flex items-center gap-2 h-8 pl-2.5 pr-2 rounded-lg bg-background/60 hover:bg-accent border border-border text-muted-foreground hover:text-foreground transition-colors text-xs"
        >
          <Search className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Search commands…</span>
          <kbd className="ml-2 font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface-2 border border-border text-muted-foreground/90">
            {cmdLabel}
          </kbd>
        </button>

        <Button
          variant="ghost"
          size="icon"
          className="md:hidden h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
          onClick={onOpenCommandPalette}
          aria-label="Open command palette"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
        </Button>

        <ProjectList
          projects={projects}
          currentProject={currentProject || undefined}
          onSelectProject={onSelectProject}
          onNewProject={onNewProject}
          onDeleteProject={onDeleteProject}
          onProjectsChange={onProjectsChange}
          onDeleteAllProjects={onDeleteAllProjects}
        />

        <div className="hidden md:block h-5 w-px bg-border/60 mx-1" aria-hidden="true" />

        <ThemeToggle />

        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
          onClick={onOpenSettings}
          aria-label="Open settings"
        >
          <Settings className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
};

export default TopBar;
