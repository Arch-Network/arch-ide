import React from 'react';
import { AlertCircle, WrapText, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FileNode, Project } from '../types';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { findFileInProject } from '../utils/projectTree';
import { isHomeTab } from '../utils/homeTab';

interface TabBarProps {
  openFiles: FileNode[];
  currentFile: FileNode | null;
  onSelectFile: (file: FileNode) => void;
  onCloseFile: (file: FileNode) => void;
  currentProject: Project | null;
  isWordWrapEnabled?: boolean;
  onToggleWordWrap?: () => void;
  /** Paths with edits that have not reached storage yet. */
  unsavedPaths?: ReadonlyMap<string, unknown>;
  /** Error from the last failed save; unsaved tabs show it until a save succeeds. */
  saveError?: string | null;
}

const TabBar = ({ openFiles, currentFile, onSelectFile, onCloseFile, currentProject, isWordWrapEnabled = true, onToggleWordWrap, unsavedPaths, saveError }: TabBarProps) => {
  const visibleOpenFiles = openFiles.filter((file) => !isHomeTab(file));
  const nameCounts = new Map<string, number>();
  visibleOpenFiles.forEach((f) => nameCounts.set(f.name, (nameCounts.get(f.name) || 0) + 1));
  const parentDir = (file: FileNode) =>
    file.path && file.path.includes('/') ? file.path.slice(0, file.path.lastIndexOf('/')) : '';

  const handleTabSelect = (file: FileNode) => {
    // Prefer the openFiles entry because it carries the latest in-memory edits;
    // fall back to the persisted project tree if the tab predates a save.
    const openFile = openFiles.find(f => (f.path || f.name) === (file.path || file.name));
    if (openFile) {
      onSelectFile(openFile);
      return;
    }
    const projectFile = findFileInProject(currentProject?.files || [], file.path || file.name);
    onSelectFile(projectFile || file);
  };

  return (
    <div className="flex items-center bg-surface-1 border-b border-border" role="tablist" aria-label="Open files">
      <div className="flex overflow-x-auto flex-1 min-w-0">
        {visibleOpenFiles.map((file) => {
          const isActive = (currentFile?.path || currentFile?.name) === (file.path || file.name);
          const isUnsaved = unsavedPaths?.has(file.path || file.name) ?? false;
          const saveFailed = isUnsaved && !!saveError;
          return (
            <div
              key={file.path || file.name}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              className={cn(
                "flex items-center gap-2 px-4 py-2 border-r border-border cursor-pointer transition-colors",
                "hover:bg-accent",
                isActive && "bg-accent text-foreground",
                !isActive && "text-foreground/70",
              )}
              onClick={() => handleTabSelect(file)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleTabSelect(file);
                }
              }}
            >
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className={cn("flex items-center text-sm", saveFailed && "text-danger")}>
                      {file.name}
                      {(nameCounts.get(file.name) || 0) > 1 && parentDir(file) && (
                        <span className="ml-1.5 text-xs text-muted-foreground">{parentDir(file)}</span>
                      )}
                      {saveFailed ? (
                        <AlertCircle className="ml-1.5 h-3.5 w-3.5" aria-hidden="true" />
                      ) : isUnsaved && (
                        <span className="ml-1.5 h-2 w-2 rounded-full bg-foreground/70" aria-hidden="true" />
                      )}
                      {isUnsaved && (
                        <span className="sr-only">{saveFailed ? ', not saved' : ', unsaved changes'}</span>
                      )}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{file.path ? file.path : file.name}</p>
                    {saveFailed ? (
                      <p className="text-danger">Not saved: {saveError}. Retrying automatically.</p>
                    ) : isUnsaved && (
                      <p className="text-muted-foreground">Unsaved changes</p>
                    )}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <button
                type="button"
                aria-label={`Close ${file.name}`}
                className="opacity-50 hover:opacity-100 hover:bg-surface-3 rounded p-0.5 -mr-0.5"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseFile(file);
                }}
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>

      {onToggleWordWrap && (
        <div className="flex items-center px-2 border-l border-border">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onToggleWordWrap}
                  className={cn(
                    "h-8 w-8 rounded-md flex items-center justify-center hover:bg-accent transition-colors",
                    isWordWrapEnabled ? "text-foreground" : "text-muted-foreground"
                  )}
                  aria-label={isWordWrapEnabled ? "Disable word wrap" : "Enable word wrap"}
                  aria-pressed={isWordWrapEnabled}
                >
                  <WrapText className="h-4 w-4" aria-hidden="true" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isWordWrapEnabled ? "Word wrap: On" : "Word wrap: Off"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
    </div>
  );
};

export default TabBar;
