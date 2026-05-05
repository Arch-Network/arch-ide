import React, { useState, useCallback } from 'react';
import { Folder, ChevronRight, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import RenameDialog from '../RenameDialog';
import FileContextMenu from './FileContextMenu';
import { getFileIcon, getNodePath } from './fileIcons';
import type { FileNode } from '../../types';

const INDENT_PX = 16;
const TREE_MOVE_MIME = 'application/x-arch-ide-tree-move';

interface FileExplorerItemProps {
  node: FileNode;
  path?: string[];
  depth?: number;
  onSelect: (file: FileNode) => void;
  onUpdateTree: (operation: 'create' | 'delete' | 'rename' | 'move', path: string[], type?: 'file' | 'directory', newName?: string, targetParentPath?: string[]) => void;
  onNewItem: (path: string[], type: 'file' | 'directory', fileName?: string, content?: string) => void;
  expandedFolders: Set<string>;
  onExpandedFoldersChange: (folders: Set<string>) => void;
  currentFile: FileNode | null;
  searchQuery?: string;
}

const FileExplorerItem: React.FC<FileExplorerItemProps> = ({
  node,
  path = [],
  depth = 0,
  onSelect,
  onUpdateTree,
  onNewItem,
  expandedFolders,
  onExpandedFoldersChange,
  currentFile,
  searchQuery,
}) => {
  const nodePath = getNodePath(node, path);
  const fullPath = [...path, node.name];
  const [isRenameDialogOpen, setIsRenameDialogOpen] = useState(false);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const [isDropTarget, setIsDropTarget] = useState(false);
  const isExpanded = expandedFolders.has(nodePath);
  const isSelected = currentFile?.path === nodePath;
  const isDirectory = node.type === 'directory';

  const isInvalidDropTarget = useCallback(
    (sourcePath: string[]): boolean => {
      const sourceStr = sourcePath.join('/');
      const targetStr = fullPath.join('/');
      if (sourceStr === targetStr) return true;
      if (targetStr.startsWith(sourceStr + '/')) return true;
      return false;
    },
    [fullPath]
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent) => {
      e.dataTransfer.setData(TREE_MOVE_MIME, JSON.stringify({ sourcePath: fullPath }));
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', node.name);
    },
    [fullPath, node.name]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!isDirectory || !e.dataTransfer.types.includes(TREE_MOVE_MIME)) return;
      e.preventDefault();
      e.stopPropagation();
      try {
        const raw = e.dataTransfer.getData(TREE_MOVE_MIME);
        const { sourcePath } = JSON.parse(raw) as { sourcePath: string[] };
        if (isInvalidDropTarget(sourcePath)) {
          e.dataTransfer.dropEffect = 'none';
          setIsDropTarget(false);
          return;
        }
        e.dataTransfer.dropEffect = 'move';
        setIsDropTarget(true);
      } catch {
        setIsDropTarget(false);
      }
    },
    [isDirectory, isInvalidDropTarget]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.stopPropagation();
    setIsDropTarget(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      if (!isDirectory || !e.dataTransfer.types.includes(TREE_MOVE_MIME)) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDropTarget(false);
      try {
        const raw = e.dataTransfer.getData(TREE_MOVE_MIME);
        const { sourcePath } = JSON.parse(raw) as { sourcePath: string[] };
        if (isInvalidDropTarget(sourcePath)) return;
        onUpdateTree('move', sourcePath, undefined, undefined, fullPath);
      } catch {
        // ignore
      }
    },
    [isDirectory, isInvalidDropTarget, fullPath, onUpdateTree]
  );

  const handleClick = () => {
    if (isDirectory) {
      const newExpandedFolders = new Set(expandedFolders);
      if (isExpanded) {
        newExpandedFolders.delete(nodePath);
      } else {
        newExpandedFolders.add(nodePath);
      }
      onExpandedFoldersChange(newExpandedFolders);
    } else {
      onSelect({ ...node, path: nodePath });
    }
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!['src', 'client'].includes(node.name)) {
      setIsRenameDialogOpen(true);
    }
  };

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenuPos({ x: e.clientX, y: e.clientY });
    setContextMenuOpen(true);
  }, []);

  const handleRenameSubmit = (newName: string) => {
    onUpdateTree('rename', [...path, node.name], node.type, newName);
    setIsRenameDialogOpen(false);
  };

  // Highlight matching text in search
  const renderName = () => {
    if (!searchQuery) {
      return <span className="text-[13px] leading-tight">{node.name}</span>;
    }
    const idx = node.name.toLowerCase().indexOf(searchQuery.toLowerCase());
    if (idx === -1) {
      return <span className="text-[13px] leading-tight">{node.name}</span>;
    }
    return (
      <span className="text-[13px] leading-tight">
        {node.name.slice(0, idx)}
        <span className="bg-warning/30 text-warning rounded-sm px-0.5">{node.name.slice(idx, idx + searchQuery.length)}</span>
        {node.name.slice(idx + searchQuery.length)}
      </span>
    );
  };

  const childCount = isDirectory && node.children ? node.children.length : 0;

  return (
    <div className="select-none">
      <div
        className={cn(
          "flex items-center gap-1.5 py-[3px] px-2 cursor-pointer transition-colors duration-100 relative",
          isSelected
            ? "bg-brand/10 border-l-2 border-brand"
            : "border-l-2 border-transparent hover:bg-accent",
          isDropTarget && "bg-brand/20 border-l-2 border-brand/80",
        )}
        style={{ paddingLeft: `${depth * INDENT_PX + 8}px` }}
        role={isDirectory ? 'treeitem' : 'option'}
        aria-selected={isSelected || undefined}
        aria-expanded={isDirectory ? isExpanded : undefined}
        draggable
        onDragStart={handleDragStart}
        onDragOver={isDirectory ? handleDragOver : undefined}
        onDragLeave={isDirectory ? handleDragLeave : undefined}
        onDrop={isDirectory ? handleDrop : undefined}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
      >
        {/* Indentation guides */}
        {depth > 0 && Array.from({ length: depth }).map((_, i) => (
          <div
            key={i}
            className="absolute top-0 bottom-0 border-l border-border/40 pointer-events-none"
            style={{ left: `${i * INDENT_PX + 11}px` }}
            aria-hidden="true"
          />
        ))}

        {/* Chevron for directories */}
        {isDirectory ? (
          <span className="shrink-0 w-4 flex items-center justify-center">
            {isExpanded ? (
              <ChevronDown size={14} className="text-muted-foreground" aria-hidden="true" />
            ) : (
              <ChevronRight size={14} className="text-muted-foreground" aria-hidden="true" />
            )}
          </span>
        ) : (
          <span className="shrink-0 w-4" />
        )}

        {/* Icon */}
        {isDirectory ? (
          <Folder size={15} className={cn("shrink-0", isExpanded ? "text-info" : "text-info/70")} aria-hidden="true" />
        ) : (
          getFileIcon(node.name)
        )}

        {/* Name */}
        <div className="flex-1 min-w-0 truncate">
          {renderName()}
        </div>

        {/* Child count badge for collapsed folders */}
        {isDirectory && !isExpanded && childCount > 0 && (
          <span className="text-[10px] text-muted-foreground/70 tabular-nums shrink-0" aria-label={`${childCount} items`}>
            {childCount}
          </span>
        )}
      </div>

      {/* Right-click context menu */}
      <FileContextMenu
        node={node}
        open={contextMenuOpen}
        onOpenChange={setContextMenuOpen}
        position={contextMenuPos}
        onNewFile={() => onNewItem([...path, node.name], 'file')}
        onNewFolder={() => onNewItem([...path, node.name], 'directory')}
        onDelete={() => onUpdateTree('delete', [...path, node.name])}
        onRename={() => {
          if (!['src', 'client'].includes(node.name)) {
            setIsRenameDialogOpen(true);
          }
        }}
      />

      <RenameDialog
        isOpen={isRenameDialogOpen}
        onClose={() => setIsRenameDialogOpen(false)}
        onRename={handleRenameSubmit}
        currentName={node.name}
        type={node.type}
      />

      {/* Children */}
      {isDirectory && node.children && (
        <div
          className={cn(
            "overflow-hidden transition-all duration-150",
            isExpanded ? "max-h-[5000px] opacity-100" : "max-h-0 opacity-0",
          )}
        >
          {node.children
            .sort((a, b) => {
              if (a.type === 'directory' && b.type === 'file') return -1;
              if (a.type === 'file' && b.type === 'directory') return 1;
              return a.name.localeCompare(b.name);
            })
            .map((child) => (
              <FileExplorerItem
                key={`${nodePath}/${child.name}`}
                node={child}
                path={[...path, node.name]}
                depth={depth + 1}
                onSelect={onSelect}
                onUpdateTree={onUpdateTree}
                onNewItem={onNewItem}
                expandedFolders={expandedFolders}
                onExpandedFoldersChange={onExpandedFoldersChange}
                currentFile={currentFile}
                searchQuery={searchQuery}
              />
            ))}
        </div>
      )}
    </div>
  );
};

export default FileExplorerItem;
