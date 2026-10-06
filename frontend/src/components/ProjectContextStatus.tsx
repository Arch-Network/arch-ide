import React from 'react';
import { CheckCircle2, Code2, FileCode2, Package, XCircle } from 'lucide-react';
import { cn } from '../lib/utils';
import type { FileNode, Project } from '../types';
import { isHomeTab } from '../utils/homeTab';

interface ProjectContextStatusProps {
  project: Project | null;
  currentFile: FileNode | null;
  hasProgramBinary: boolean;
}

const StatusPill = ({
  ready,
  label,
  title,
}: {
  ready: boolean;
  label: string;
  title: string;
}) => (
  <span
    title={title}
    className={cn(
      'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] leading-none',
      ready
        ? 'bg-success/10 text-success'
        : 'bg-surface-3 text-muted-foreground',
    )}
  >
    {ready ? (
      <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
    ) : (
      <XCircle className="h-3 w-3" aria-hidden="true" />
    )}
    {label}
  </span>
);

export const ProjectContextStatus: React.FC<ProjectContextStatusProps> = ({
  project,
  currentFile,
  hasProgramBinary,
}) => {
  const framework = project?.framework === 'satellite' ? 'Satellite' : 'Native';
  const hasRunnableClient = Boolean(currentFile?.name.endsWith('.ts'));

  if (!project) {
    return (
      <div className="flex items-center gap-1.5 min-w-0 text-muted-foreground">
        <Package className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span className="truncate">No project selected</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex items-center gap-1.5 min-w-0" title={`Current project: ${project.name}`}>
        <Package className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="truncate text-foreground/80">{project.name}</span>
      </div>

      <span className="hidden md:inline-flex items-center gap-1 rounded bg-surface-3 px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground">
        <Code2 className="h-3 w-3" aria-hidden="true" />
        {framework}
      </span>

      <StatusPill
        ready={hasProgramBinary}
        label={hasProgramBinary ? 'Built' : 'Not built'}
        title={hasProgramBinary ? 'Program artifact is ready.' : 'Build the program to create a deployable artifact.'}
      />

      <StatusPill
        ready={hasRunnableClient}
        label={hasRunnableClient ? 'Client ready' : 'Open client'}
        title={hasRunnableClient ? `Runnable client file: ${currentFile?.name}` : 'Open a TypeScript client file before running.'}
      />

      {currentFile && !isHomeTab(currentFile) && (
        <div className="hidden lg:flex items-center gap-1 min-w-0 text-muted-foreground" title={currentFile.path || currentFile.name}>
          <FileCode2 className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate max-w-[180px]">{currentFile.path || currentFile.name}</span>
        </div>
      )}
    </div>
  );
};

export default ProjectContextStatus;
