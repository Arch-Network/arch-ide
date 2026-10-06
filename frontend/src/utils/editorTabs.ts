import type { FileNode } from '../types';
import { createHomeTab, HOME_TAB_PATH } from './homeTab';
import { findFileInProject } from './projectTree';

const tabsKey = (projectId: string) => `editorTabs_${projectId}`;
const tabPath = (file: FileNode) => file.path || file.name;

export function saveProjectTabs(projectId: string, tabs: FileNode[], active: FileNode | null) {
  if (tabs.length === 0) {
    localStorage.removeItem(tabsKey(projectId));
    return;
  }
  localStorage.setItem(tabsKey(projectId), JSON.stringify({
    tabs: tabs.map(tabPath),
    active: active ? tabPath(active) : null,
  }));
}

/** The project's saved tabs that still exist in `files`, or null when none do. */
export function loadProjectTabs(projectId: string, files: FileNode[]): { tabs: FileNode[]; active: FileNode } | null {
  let saved: { tabs?: unknown; active?: unknown } | null;
  try {
    saved = JSON.parse(localStorage.getItem(tabsKey(projectId)) ?? 'null');
  } catch {
    return null;
  }
  if (!saved || !Array.isArray(saved.tabs)) return null;

  const activePath = saved.active;
  const tabs = saved.tabs
    .map((path) => (path === HOME_TAB_PATH ? createHomeTab() : typeof path === 'string' ? findFileInProject(files, path) : null))
    .filter((file): file is FileNode => file !== null);
  if (tabs.length === 0) return null;
  return { tabs, active: tabs.find((file) => tabPath(file) === activePath) ?? tabs[0] };
}

export function clearProjectTabs(projectId: string) {
  localStorage.removeItem(tabsKey(projectId));
}
