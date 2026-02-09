import React, { useState, useEffect } from 'react';
import { Files, Hammer } from 'lucide-react';
import { Button } from './ui/button';
import FileExplorer from './FileExplorer';
import BuildPanel from './BuildPanel';
import { cn } from '@/lib/utils';
import type { FileNode } from '../types';
import VerticalResizeHandle from './VerticalResizeHandle';
import { Config } from '../types/config';
import type { ArchIdl } from '../types';
import { storage } from '../utils/storage';
import { Project, ProjectAccount } from '../types';

type ExpandedFolders = Set<string>;

interface SidePanelProps {
  hasProjects: boolean;
  currentView: 'explorer' | 'build';
  onViewChange: (view: 'explorer' | 'build') => void;
  files: FileNode[];
  onFileSelect: (file: FileNode) => void;
  onUpdateTree: (
    operation: 'create' | 'delete' | 'rename',
    path: string[],
    type?: 'file' | 'directory',
    newName?: string
  ) => void;
  onNewItem: (path: string[], type: 'file' | 'directory') => void;
  onBuild: () => void;
  onDeploy: () => void;
  isBuilding: boolean;
  isDeploying: boolean;
  programId: string | undefined;
  programBinary: string | null;
  onProgramBinaryChange: (binary: string | null) => void;
  onProgramIdChange: (programId: string) => void;
  programIdl: ArchIdl | null;
  config: Config;
  onConfigChange: (config: Config) => void;
  onConnectionStatusChange: (connected: boolean) => void;
  currentAccount: {
    privkey: string;
    pubkey: string;
    address: string;
  } | null;
  onAccountChange: (account: { privkey: string; pubkey: string; address: string; } | null) => void;
  currentFile: FileNode | null;
  project: Project | null;
  onProjectAccountChange: (account: ProjectAccount | null) => void;
  onAuthorityAccountChange: (account: ProjectAccount | null) => void;
  onSaveToHistory?: (account: ProjectAccount) => Promise<void>;
  onRestoreFromHistory?: (index: number) => Promise<void>;
  onDeleteFromHistory?: (index: number) => Promise<void>;
  onProjectUpdate?: (project: Project) => void;
  onNewProject: () => void;
  onOpenHomeTab?: () => void;
  binaryFileName: string | null;
  setBinaryFileName: (name: string | null) => void;
  addOutputMessage: (type: any, message: any) => void;
  connected: boolean;
  expandedFolders: Set<string>;
  onExpandedFoldersChange: (folders: Set<string>) => void;
  isMobile?: boolean;
}

type View = 'explorer' | 'build';

const SidePanel = ({ hasProjects, currentView, onViewChange, files, onFileSelect, onUpdateTree, onNewItem, onBuild, onDeploy, isBuilding, isDeploying, programId, programBinary, onProgramBinaryChange, onProgramIdChange, programIdl, config, onConfigChange, onConnectionStatusChange, currentAccount, onAccountChange, currentFile, project, onProjectAccountChange, onAuthorityAccountChange, onSaveToHistory, onRestoreFromHistory, onDeleteFromHistory, onProjectUpdate, onNewProject, onOpenHomeTab, binaryFileName, setBinaryFileName, addOutputMessage, connected, expandedFolders, onExpandedFoldersChange, isMobile = false }: SidePanelProps) => {
  const MIN_WIDTH = 420;
  const MAX_WIDTH = 800;
  const [width, setWidth] = useState(MIN_WIDTH);

    const handleResizeStart = React.useCallback((e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.pageX;
      const startWidth = width;

      const handleMouseMove = (e: MouseEvent) => {
        const delta = e.pageX - startX;
        const newWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startWidth + delta));
        setWidth(newWidth);
      };

      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }, [width]);

    const activeAccount = project?.account || currentAccount;

    return (
        <div
          className="bg-gray-800 border-r border-gray-700 flex flex-col relative h-full min-h-0"
          style={isMobile ? { width: '100%' } : { width: `${width}px` }}
        >
          <div className="flex border-b border-gray-700">
        <Button
          variant="ghost"
          size="sm"
          className={cn(
            'flex-1 rounded-none border-b-2',
            currentView === 'explorer'
              ? 'bg-[#1a1a1a] border-[#F7931A] text-white'
              : 'border-transparent text-gray-400'
          )}
          onClick={() => onViewChange('explorer')}
        >
          <Files className="h-4 w-4 mr-2" />
          Explorer
        </Button>
        <Button
          variant="ghost"
          data-tutorial="build-tab"
          size="sm"
          className={cn(
            'flex-1 rounded-none border-b-2',
            currentView === 'build'
              ? 'bg-[#1a1a1a] border-[#F7931A] text-white'
              : 'border-transparent text-gray-400'
          )}
          onClick={() => onViewChange('build')}
        >
          <Hammer className="h-4 w-4 mr-2" />
          Build
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
          {currentView === 'explorer' ? (
            <FileExplorer
              hasProjects={hasProjects}
              files={files}
              onFileSelect={onFileSelect}
              onUpdateTree={onUpdateTree}
              onNewItem={onNewItem}
              expandedFolders={expandedFolders}
              onExpandedFoldersChange={onExpandedFoldersChange}
              currentFile={currentFile}
              onNewProject={onNewProject}
              onOpenHomeTab={onOpenHomeTab}
              addOutputMessage={addOutputMessage}
              project={project}
              onProjectAccountChange={onProjectAccountChange}
              onProjectUpdate={onProjectUpdate}
              onBuild={onBuild}
              onDeploy={onDeploy}
              isBuilding={isBuilding}
              isDeploying={isDeploying}
            />
          ) : (
          <BuildPanel
            hasProjects={hasProjects}
            onBuild={onBuild}
            onDeploy={onDeploy}
            isBuilding={isBuilding}
            isDeploying={isDeploying}
            programId={programId}
            programBinary={programBinary}
            onProgramBinaryChange={onProgramBinaryChange}
            onProgramIdChange={onProgramIdChange}
            config={config}
            onConfigChange={onConfigChange}
            onConnectionStatusChange={onConnectionStatusChange}
            currentAccount={activeAccount}
            onAccountChange={onAccountChange}
            project={project}
            onProjectAccountChange={onProjectAccountChange}
            onAuthorityAccountChange={onAuthorityAccountChange}
            onSaveToHistory={onSaveToHistory}
            onRestoreFromHistory={onRestoreFromHistory}
            onDeleteFromHistory={onDeleteFromHistory}
            binaryFileName={binaryFileName}
            setBinaryFileName={setBinaryFileName}
            connected={connected}
          />
        )}
      </div>
      {!isMobile && <VerticalResizeHandle onMouseDown={handleResizeStart} />}
    </div>
  );
};

export default SidePanel;