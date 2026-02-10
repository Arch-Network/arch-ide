import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Hammer,
  Rocket,
  Play,
  Loader2,
  Home,
  Search,
  ChevronsDownUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '../lib/utils';
import type { FileNode, Project, ProjectAccount } from '../types';
import { ArchPgClient } from '../utils/archPgClient';

import FileExplorerItem from './explorer/FileExplorerItem';
import SectionHeader from './explorer/SectionHeader';
import ProjectInfo from './explorer/ProjectInfo';
import FileSearchBar from './explorer/FileSearchBar';

interface FileExplorerProps {
  hasProjects: boolean;
  files: FileNode[];
  onFileSelect: (file: FileNode) => void;
  onUpdateTree: (operation: 'create' | 'delete' | 'rename', path: string[], type?: 'file' | 'directory', newName?: string) => void;
  onNewItem: (path: string[], type: 'file' | 'directory', fileName?: string, content?: string) => void;
  expandedFolders: Set<string>;
  onExpandedFoldersChange: (folders: Set<string>) => void;
  currentFile: FileNode | null;
  onNewProject?: () => void;
  onOpenHomeTab?: () => void;
  addOutputMessage: (type: string, message: string) => void;
  project: Project | null;
  onProjectAccountChange?: (account: ProjectAccount | null) => void;
  onProjectUpdate?: (project: Project) => void;
  onBuild?: () => void;
  onDeploy?: () => void;
  isBuilding?: boolean;
  isDeploying?: boolean;
  rpcUrl?: string;
}

// ── Helpers ──────────────────────────────────────────────────

/** Recursively check if any node in a tree matches the search query */
const treeMatchesSearch = (node: FileNode, query: string): boolean => {
  if (node.name.toLowerCase().includes(query)) return true;
  if (node.type === 'directory' && node.children) {
    return node.children.some((child) => treeMatchesSearch(child, query));
  }
  return false;
};

/** Filter a tree, keeping only nodes that match (or have matching descendants) */
const filterTree = (nodes: FileNode[], query: string): FileNode[] => {
  if (!query) return nodes;
  return nodes
    .filter((node) => treeMatchesSearch(node, query))
    .map((node) => {
      if (node.type === 'directory' && node.children) {
        return { ...node, children: filterTree(node.children, query) };
      }
      return node;
    });
};

/** Collect all folder paths in a tree (for expand-all-on-search) */
const collectFolderPaths = (nodes: FileNode[], parentPath: string[] = []): string[] => {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.type === 'directory') {
      const fullPath = parentPath.length === 0 && ['src', 'client'].includes(node.name)
        ? node.name
        : [...parentPath, node.name].join('/');
      paths.push(fullPath);
      if (node.children) {
        paths.push(...collectFolderPaths(node.children, [...parentPath, node.name]));
      }
    }
  }
  return paths;
};

// ── Component ────────────────────────────────────────────────

const FileExplorer: React.FC<FileExplorerProps> = ({
  hasProjects,
  files,
  onFileSelect,
  onUpdateTree,
  onNewItem,
  expandedFolders,
  onExpandedFoldersChange,
  currentFile,
  onNewProject,
  onOpenHomeTab,
  addOutputMessage,
  project,
  onProjectUpdate,
  onBuild,
  onDeploy,
  isBuilding = false,
  isDeploying = false,
  rpcUrl,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [worker, setWorker] = useState<Worker | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Worker for running client code
  useEffect(() => {
    const newWorker = new Worker(new URL('../workers/clientWorker.ts', import.meta.url), { type: 'module' });
    newWorker.onmessage = (event) => {
      const { type, message } = event.data;
      switch (type) {
        case 'info':
        case 'error':
        case 'success':
          addOutputMessage(type, message);
          break;
        default:
          addOutputMessage('info', message);
      }
    };
    setWorker(newWorker);
    return () => { newWorker.terminate(); };
  }, [addOutputMessage]);

  // Group and filter files
  const lowerQuery = searchQuery.toLowerCase();
  const filteredFiles = useMemo(() => filterTree(files, lowerQuery), [files, lowerQuery]);

  const programFiles = filteredFiles.filter((f) => f.name === 'src');
  const clientFiles = filteredFiles.filter((f) => f.name === 'client');
  const otherFiles = filteredFiles.filter((f) => !['src', 'client'].includes(f.name));

  // When search query changes and has value, expand all matching folders
  useEffect(() => {
    if (searchQuery) {
      const allPaths = collectFolderPaths(filteredFiles);
      if (allPaths.length > 0) {
        const expanded = new Set(expandedFolders);
        allPaths.forEach((p) => expanded.add(p));
        onExpandedFoldersChange(expanded);
      }
    }
  }, [searchQuery]);

  const handleCollapseAll = useCallback(() => {
    onExpandedFoldersChange(new Set());
  }, [onExpandedFoldersChange]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];
    onFileSelect({ name: file.name, type: 'file', content: '' });
  };

  const runClientCode = async () => {
    if (!currentFile || !currentFile.name.endsWith('.ts')) {
      addOutputMessage('error', 'No TypeScript file selected');
      return;
    }
    const clientCode = currentFile.content;
    if (!clientCode) {
      addOutputMessage('error', 'Client code not found');
      return;
    }
    addOutputMessage('info', 'Executing code...');
    try {
      await ArchPgClient.execute({
        fileName: currentFile.name,
        code: clientCode,
        onMessage: (type: string, message: string) => {
          addOutputMessage(type, message);
        },
        authorityAccount: project?.authorityAccount || null,
        rpcUrl: rpcUrl,
      });
    } catch (error: unknown) {
      if (error instanceof Error) {
        addOutputMessage('error', error.message);
      } else {
        addOutputMessage('error', 'An unknown error occurred');
      }
    }
  };

  const handleProjectUpdate = (updatedProject: Project) => {
    onProjectUpdate?.(updatedProject);
  };

  // Shared tree props
  const treeProps = {
    onSelect: onFileSelect,
    onUpdateTree,
    onNewItem,
    expandedFolders,
    onExpandedFoldersChange,
    currentFile,
    searchQuery: searchQuery || undefined,
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex justify-between items-center px-3 py-2 border-b border-gray-700/60">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Explorer</h2>
        <div className="flex items-center gap-0.5">
          {hasProjects && (
            <>
              <button
                className="hover:bg-gray-700/60 p-1 rounded-md transition-colors text-gray-500 hover:text-gray-300"
                onClick={() => setIsSearchOpen(!isSearchOpen)}
                title="Search Files"
              >
                <Search size={14} />
              </button>
              <button
                className="hover:bg-gray-700/60 p-1 rounded-md transition-colors text-gray-500 hover:text-gray-300"
                onClick={handleCollapseAll}
                title="Collapse All"
              >
                <ChevronsDownUp size={14} />
              </button>
            </>
          )}
          {onOpenHomeTab && (
            <button
              className="hover:bg-gray-700/60 p-1 rounded-md transition-colors text-gray-500 hover:text-gray-300"
              onClick={onOpenHomeTab}
              title="Open Home Tab"
            >
              <Home size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Search bar */}
      {isSearchOpen && (
        <FileSearchBar
          value={searchQuery}
          onChange={setSearchQuery}
          onClose={() => { setIsSearchOpen(false); setSearchQuery(''); }}
        />
      )}

      {/* Tree content */}
      <div className="flex-1 overflow-y-auto">
        {!hasProjects ? (
          <div className="flex flex-col items-center justify-center h-full gap-4 text-gray-400 px-6">
            <p className="text-sm text-center">No projects found</p>
            <Button
              variant="default"
              onClick={onNewProject}
              className="bg-[#F7931A] hover:bg-[#d47b16] text-white font-semibold"
            >
              Create New Project
            </Button>
          </div>
        ) : (
          <>
            {project && <ProjectInfo project={project} onProjectUpdate={handleProjectUpdate} />}

            {/* Program Section */}
            {programFiles.length > 0 && (
              <>
                <SectionHeader
                  title="Program"
                  icon={<Hammer size={14} className="text-orange-400" />}
                  actions={[
                    {
                      icon: isBuilding ? <Loader2 size={14} className="animate-spin" /> : <Hammer size={14} />,
                      label: "Build",
                      onClick: () => onBuild?.(),
                      disabled: isBuilding || !hasProjects,
                    },
                    {
                      icon: isDeploying ? <Loader2 size={14} className="animate-spin" /> : <Rocket size={14} />,
                      label: "Deploy",
                      onClick: () => onDeploy?.(),
                      disabled: isDeploying || !hasProjects,
                    },
                  ]}
                />
                {programFiles.map((node) => (
                  <FileExplorerItem key={`program-${node.name}`} node={node} {...treeProps} />
                ))}
              </>
            )}

            {/* Client Section */}
            {clientFiles.length > 0 && (
              <>
                <SectionHeader
                  title="Client"
                  icon={<Play size={14} className="text-green-400" />}
                  actions={[
                    {
                      icon: <Play size={14} />,
                      label: "Run",
                      onClick: runClientCode,
                      emphasis: 'primary' as const,
                    },
                  ]}
                  alwaysShowActions
                />
                {clientFiles.map((node) => (
                  <FileExplorerItem key={`client-${node.name}`} node={node} {...treeProps} />
                ))}
              </>
            )}

            {/* Other Files */}
            {otherFiles.length > 0 && otherFiles.map((node) => (
              <FileExplorerItem key={`other-${node.name}`} node={node} {...treeProps} />
            ))}

            {/* No results when searching */}
            {searchQuery && programFiles.length === 0 && clientFiles.length === 0 && otherFiles.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-gray-500">
                <Search size={24} className="mb-2 text-gray-600" />
                <p className="text-xs">No files matching "{searchQuery}"</p>
              </div>
            )}
          </>
        )}
      </div>

      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        onChange={handleFileSelect}
        multiple
      />
    </div>
  );
};

export default FileExplorer;
