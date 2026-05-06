import React from 'react';
import { PanelLeft, Search, Settings } from 'lucide-react';
import { Button } from './ui/button';
import ProjectList from './ProjectList';
import { ThemeToggle } from './ThemeToggle';
import { Logo } from './Logo';
import type { Project } from '../types';
import WorkbenchActions from './WorkbenchActions';

interface TopBarProps {
  projects: Project[];
  currentProject: Project | null;
  onSelectProject: (project: Project, clearOpenFiles?: boolean) => void;
  onNewProject: () => void;
  onDeleteProject: (id: string) => Promise<void>;
  onProjectsChange: (projects: Project[]) => void;
  onDeleteAllProjects: () => Promise<void>;
  onOpenHome: () => void;
  isHomeActive: boolean;
  onBuild: () => void;
  onRunClient: () => void;
  canBuild: boolean;
  canRunClient: boolean;
  isBuilding: boolean;
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
  onOpenHome,
  isHomeActive,
  onBuild,
  onRunClient,
  canBuild,
  canRunClient,
  isBuilding,
  onOpenSettings,
  onOpenMobileSidebar,
  onOpenCommandPalette,
}) => {
  const isMac = detectMac();
  const cmdLabel = isMac ? '⌘ K' : 'Ctrl K';

  return (
    <nav
      className="flex flex-col gap-1 px-2 py-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2 sm:px-3 sm:py-1.5 md:px-4 bg-surface-1 border-b border-border/60"
      aria-label="Application"
    >
      <div className="flex w-full items-center justify-between gap-1.5 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden h-8 w-8 shrink-0"
            onClick={onOpenMobileSidebar}
            aria-label="Open sidebar"
          >
            <PanelLeft className="h-5 w-5" aria-hidden="true" />
          </Button>
          <Logo className="h-5 w-20 shrink-0 sm:w-auto md:h-6 text-foreground" />
          <span className="hidden xl:inline text-sm font-semibold tracking-wide text-muted-foreground">
            IDE
          </span>
        </div>

        <div className="flex flex-1 items-center justify-end gap-1 min-w-0">
          <button
            type="button"
            onClick={onOpenCommandPalette}
            aria-label="Open command palette"
            className="hidden xl:inline-flex items-center gap-2 h-8 w-[190px] 2xl:w-[240px] min-w-0 pl-2.5 pr-2 rounded-lg bg-background/60 hover:bg-accent border border-border text-muted-foreground hover:text-foreground transition-colors text-xs"
          >
            <Search className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">Search commands…</span>
            <kbd className="ml-2 font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface-2 border border-border text-muted-foreground/90">
              {cmdLabel}
            </kbd>
          </button>

          <Button
            variant="ghost"
            size="icon"
            className="xl:hidden h-8 w-8 shrink-0 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
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

          <div className="hidden lg:block h-5 w-px bg-border/60 mx-0.5" aria-hidden="true" />

          <div className="hidden sm:block">
            <WorkbenchActions
              onOpenHome={onOpenHome}
              isHomeActive={isHomeActive}
              onBuild={onBuild}
              onRunClient={onRunClient}
              canBuild={canBuild}
              canRunClient={canRunClient}
              isBuilding={isBuilding}
            />
          </div>

          <div className="hidden lg:block h-5 w-px bg-border/60 mx-0.5" aria-hidden="true" />

          <div className="hidden min-[420px]:block">
            <ThemeToggle />
          </div>

          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
            onClick={onOpenSettings}
            aria-label="Open settings"
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      <div className="sm:hidden w-full border-t border-border/60 pt-1">
        <WorkbenchActions
          className="w-full"
          variant="mobile"
          onOpenHome={onOpenHome}
          isHomeActive={isHomeActive}
          onBuild={onBuild}
          onRunClient={onRunClient}
          canBuild={canBuild}
          canRunClient={canRunClient}
          isBuilding={isBuilding}
        />
      </div>
    </nav>
  );
};

export default TopBar;
