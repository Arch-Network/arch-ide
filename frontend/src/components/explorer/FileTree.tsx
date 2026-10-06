import React, { useRef, useState } from 'react';
import FileExplorerItem, { type FileExplorerItemProps } from './FileExplorerItem';
import type { FileNode } from '../../types';

type FileTreeProps = Omit<FileExplorerItemProps, 'node' | 'path' | 'depth' | 'tabStopPath' | 'onItemFocus'> & {
  label: string;
  nodes: FileNode[];
};

/** True when `path` names a node in `nodes` and every folder above it is expanded. */
const isVisiblePath = (nodes: FileNode[], path: string, expandedFolders: Set<string>): boolean => {
  const names = path.split('/');
  let level: FileNode[] | undefined = nodes;
  for (let i = 0; i < names.length; i++) {
    const node: FileNode | undefined = level?.find((n) => n.name === names[i]);
    if (!node) return false;
    if (i < names.length - 1 && !expandedFolders.has(names.slice(0, i + 1).join('/'))) return false;
    level = node.children;
  }
  return true;
};

const levelOf = (el: HTMLElement) => Number(el.getAttribute('aria-level'));

/**
 * An ARIA tree with a roving tabindex: one item is in the tab order, and the
 * arrow keys move focus between the items that are currently visible.
 * Opening a file and expanding/collapsing a folder are handled by the item.
 */
const FileTree: React.FC<FileTreeProps> = ({ label, nodes, ...itemProps }) => {
  const treeRef = useRef<HTMLDivElement>(null);
  const [activePath, setActivePath] = useState<string | null>(null);

  const { expandedFolders, currentFile } = itemProps;
  const tabStopPath =
    [activePath, currentFile?.path].find((p): p is string => !!p && isVisiblePath(nodes, p, expandedFolders))
    ?? nodes[0]?.name;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const item = e.target as HTMLElement;
    if (item.getAttribute('role') !== 'treeitem' || !treeRef.current) return;
    const items = Array.from(treeRef.current.querySelectorAll<HTMLElement>('[role="treeitem"]'))
      .filter((el) => !el.closest('[role="group"][aria-hidden="true"]'));
    const index = items.indexOf(item);
    let target: HTMLElement | undefined;
    switch (e.key) {
      case 'ArrowDown': target = items[index + 1]; break;
      case 'ArrowUp': target = items[index - 1]; break;
      case 'Home': target = items[0]; break;
      case 'End': target = items[items.length - 1]; break;
      case 'ArrowRight': {
        const next = items[index + 1];
        if (next && levelOf(next) > levelOf(item)) target = next;
        break;
      }
      case 'ArrowLeft':
        target = items.slice(0, index).reverse().find((el) => levelOf(el) < levelOf(item));
        break;
      default:
        return;
    }
    e.preventDefault();
    target?.focus();
  };

  return (
    <div ref={treeRef} role="tree" aria-label={label} onKeyDown={handleKeyDown}>
      {nodes.map((node) => (
        <FileExplorerItem
          key={node.name}
          node={node}
          {...itemProps}
          tabStopPath={tabStopPath}
          onItemFocus={setActivePath}
        />
      ))}
    </div>
  );
};

export default FileTree;
