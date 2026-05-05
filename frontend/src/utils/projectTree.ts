import type { FileNode } from '../types';

/**
 * Tree-walking utilities for the project file tree.
 *
 * These were previously inlined in `App.tsx` (and duplicated in `Editor.tsx`),
 * which coupled leaf components like `TabBar` to the app shell. Centralizing
 * them here breaks that cycle.
 */

/**
 * Finds the first file whose `path` matches `targetPath` exactly, falling back
 * to a name match if the file has no path. Recurses into directories.
 */
export const findFileInProject = (
  nodes: FileNode[],
  targetPath: string,
): FileNode | null => {
  for (const node of nodes) {
    if (node.type === 'file' && (node.path === targetPath || node.name === targetPath)) {
      return node;
    }
    if (node.type === 'directory' && node.children) {
      const found = findFileInProject(node.children, targetPath);
      if (found) return found;
    }
  }
  return null;
};

/**
 * Strict variant: only matches files by their stored `path` (no name fallback).
 * Used by save flows that must operate on a specific tree position.
 */
export const findFileByPath = (
  nodes: FileNode[],
  targetPath: string,
): FileNode | null => {
  for (const node of nodes) {
    if (node.type === 'file' && node.path === targetPath) return node;
    if (node.type === 'directory' && node.children) {
      const found = findFileByPath(node.children, targetPath);
      if (found) return found;
    }
  }
  return null;
};

/**
 * Walks `files` until it reaches `target`, joining the names with `/` to
 * reconstruct an absolute path. Returns `target.name` if not found.
 */
export const constructFullPath = (
  target: FileNode,
  files: FileNode[],
): string => {
  const walk = (
    nodes: FileNode[],
    currentPath: string = '',
  ): string | null => {
    for (const node of nodes) {
      if (node === target) return currentPath + node.name;
      if (node.children) {
        const found = walk(node.children, `${currentPath}${node.name}/`);
        if (found) return found;
      }
    }
    return null;
  };

  return walk(files) || target.name;
};
