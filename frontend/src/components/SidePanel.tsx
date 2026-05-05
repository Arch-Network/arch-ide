import React from 'react';
import { Files, Hammer, Search, Microscope } from 'lucide-react';
import FileExplorer from './FileExplorer';
import BuildPanel from './BuildPanel';
import ActivityBar, { type ActivityBarItem } from './ActivityBar';
import SearchPanel from './SearchPanel';
import ProgramInspector from './ProgramInspector/ProgramInspector';
import type { ProjectMutations } from './ProgramInspector/projectMutations';
import type { ArchIdl, FileNode } from '../types';
import VerticalResizeHandle from './VerticalResizeHandle';
import { Config } from '../types/config';
import { Project, ProjectAccount } from '../types';
import type { DroppedFile } from '../utils/fileDropUtils';
import { useResizablePanel } from '../hooks/useResizablePanel';
import type { SidebarView } from '../utils/storage';

// Minimum is sized to fit the BuildPanel cards (program ID copy button,
// "Request testnet funds" CTA, format toggle row). Going below ~400px
// causes those controls to clip even with min-w-0 / flex-wrap, because
// the buttons themselves have intrinsic widths.
const SIDEBAR_MIN_WIDTH = 400;
const SIDEBAR_MAX_WIDTH = 800;
const SIDEBAR_DEFAULT_WIDTH = 460;
const SIDEBAR_STORAGE_KEY = 'arch-ide:sidebar-width';

interface SidePanelProps {
  hasProjects: boolean;
  currentView: SidebarView;
  onViewChange: (view: SidebarView) => void;
  files: FileNode[];
  onFileSelect: (file: FileNode) => void;
  onUpdateTree: (
    operation: 'create' | 'delete' | 'rename' | 'move',
    path: string[],
    type?: 'file' | 'directory',
    newName?: string,
    targetParentPath?: string[]
  ) => void;
  onNewItem: (path: string[], type: 'file' | 'directory') => void;
  onFileDrop?: (files: DroppedFile[]) => void;
  onBuild: () => void;
  onDeploy: () => void;
  isBuilding: boolean;
  isDeploying: boolean;
  programId: string | undefined;
  programBinary: string | null;
  onProgramBinaryChange: (binary: string | null) => void;
  onProgramIdChange: (programId: string) => void;
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
  onIdlChange: (idl: ArchIdl | null) => void;
  inspectorMutations: ProjectMutations;
  isMobile?: boolean;
}

const SidePanel = ({ hasProjects, currentView, onViewChange, files, onFileSelect, onUpdateTree, onNewItem, onFileDrop, onBuild, onDeploy, isBuilding, isDeploying, programId, programBinary, onProgramBinaryChange, onProgramIdChange, config, onConfigChange, onConnectionStatusChange, currentAccount, onAccountChange, currentFile, project, onProjectAccountChange, onAuthorityAccountChange, onSaveToHistory, onRestoreFromHistory, onDeleteFromHistory, onProjectUpdate, onNewProject, onOpenHomeTab, binaryFileName, setBinaryFileName, addOutputMessage, connected, expandedFolders, onExpandedFoldersChange, onIdlChange, inspectorMutations, isMobile = false }: SidePanelProps) => {
  const { size: width, onMouseDown: handleResizeStart } = useResizablePanel({
    initial: SIDEBAR_DEFAULT_WIDTH,
    min: SIDEBAR_MIN_WIDTH,
    max: SIDEBAR_MAX_WIDTH,
    axis: 'horizontal',
    storageKey: SIDEBAR_STORAGE_KEY,
  });

  const activeAccount = project?.account || currentAccount;

  const sidebarItems: ActivityBarItem<SidebarView>[] = [
    {
      id: 'explorer',
      label: 'Explorer',
      icon: <Files className="h-4 w-4" aria-hidden="true" />,
    },
    {
      id: 'search',
      label: 'Search',
      icon: <Search className="h-4 w-4" aria-hidden="true" />,
    },
    {
      id: 'inspector',
      label: 'Inspect',
      icon: <Microscope className="h-4 w-4" aria-hidden="true" />,
    },
    {
      id: 'build',
      label: 'Build',
      icon: <Hammer className="h-4 w-4" aria-hidden="true" />,
      testId: 'build-tab',
    },
  ];

  return (
    <div
      className="bg-surface-1 border-r border-border flex flex-col relative h-full min-h-0"
      style={isMobile ? { width: '100%' } : { width: `${width}px` }}
    >
      <ActivityBar
        items={sidebarItems}
        current={currentView}
        onChange={onViewChange}
      />

      <div className="flex-1 overflow-auto">
        {currentView === 'explorer' && (
          <FileExplorer
            hasProjects={hasProjects}
            files={files}
            onFileSelect={onFileSelect}
            onUpdateTree={onUpdateTree}
            onNewItem={onNewItem}
            onFileDrop={onFileDrop}
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
            rpcUrl={config.rpcUrl}
          />
        )}
        {currentView === 'search' && (
          <SearchPanel files={files} onOpenFile={onFileSelect} />
        )}
        {currentView === 'inspector' && (
          <ProgramInspector
            project={project}
            config={config}
            onIdlChange={onIdlChange}
            mutations={inspectorMutations}
          />
        )}
        {currentView === 'build' && (
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