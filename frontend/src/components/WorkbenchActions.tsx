import React from 'react';
import { Hammer, Home, Loader2, Play } from 'lucide-react';
import { Button } from './ui/button';
import { cn } from '../lib/utils';

interface WorkbenchActionsProps {
  onOpenHome: () => void;
  isHomeActive: boolean;
  onBuild: () => void;
  onRunClient: () => void;
  canBuild: boolean;
  canRunClient: boolean;
  isBuilding: boolean;
  className?: string;
  variant?: 'inline' | 'mobile';
}

export const WorkbenchActions: React.FC<WorkbenchActionsProps> = ({
  onOpenHome,
  isHomeActive,
  onBuild,
  onRunClient,
  canBuild,
  canRunClient,
  isBuilding,
  className,
  variant = 'inline',
}) => {
  const isMobile = variant === 'mobile';

  return (
    <div
      className={cn(
        'flex items-center shrink-0',
        isMobile ? 'gap-2' : 'gap-1',
        className,
      )}
      aria-label="Workbench actions"
    >
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          'h-8 rounded-lg gap-1.5 text-xs font-medium',
          isMobile ? 'min-w-0 flex-1 justify-center px-2' : 'px-2 sm:px-2.5',
          isHomeActive
            ? 'bg-surface-2 text-foreground'
            : 'text-muted-foreground hover:text-foreground hover:bg-accent',
        )}
        onClick={onOpenHome}
        aria-pressed={isHomeActive}
        aria-label="Open home"
      >
        <Home className="h-4 w-4" aria-hidden="true" />
        <span className={isMobile ? 'whitespace-nowrap' : 'hidden 2xl:inline'}>Home</span>
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className={cn(
          'h-8 rounded-lg gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40',
          isMobile ? 'min-w-0 flex-1 justify-center px-2' : 'px-2 sm:px-2.5',
        )}
        onClick={onBuild}
        disabled={!canBuild || isBuilding}
        aria-label={isBuilding ? 'Building program' : 'Build program'}
      >
        {isBuilding ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <Hammer className="h-4 w-4" aria-hidden="true" />
        )}
        <span className={isMobile ? 'whitespace-nowrap' : 'hidden 2xl:inline'}>
          {isBuilding ? 'Building' : 'Build'}
        </span>
      </Button>

      <Button
        size="sm"
        className={cn(
          'h-8 rounded-lg gap-1.5 text-xs font-semibold bg-brand hover:bg-brand-hover text-brand-foreground disabled:opacity-40',
          isMobile ? 'min-w-0 flex-1 justify-center px-2' : 'px-2.5 lg:px-3',
        )}
        onClick={onRunClient}
        disabled={!canRunClient}
        aria-label="Run current TypeScript client file"
      >
        <Play className="h-4 w-4" aria-hidden="true" />
        <span className={isMobile ? 'whitespace-nowrap' : 'hidden lg:inline'}>Run</span>
      </Button>
    </div>
  );
};

export default WorkbenchActions;
