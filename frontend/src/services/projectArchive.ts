import JSZip from 'jszip';
import type { ArchIdl, FileNode, Project, ProjectAccount, ProjectFramework } from '../types';
import { validateIdl } from '../utils/idl/validate';

/** Zip-root file carrying the project data that the file tree cannot. */
export const MANIFEST_FILE = 'arch-project.json';
const MANIFEST_VERSION = 1;

export interface ProjectManifest {
  version: typeof MANIFEST_VERSION;
  name: string;
  description?: string;
  framework?: ProjectFramework;
  idl?: ArchIdl | null;
  /** Present only when the user opted in at export; these hold private keys. */
  account?: ProjectAccount;
  authorityAccount?: ProjectAccount;
}

const TEXT_DATA_URL_PREFIX = 'data:text/plain;base64,';

/** Storage keeps file content as base64 data URLs; the zip should hold the source text. */
const decodeStoredContent = (content: string): string => {
  if (!content.startsWith(TEXT_DATA_URL_PREFIX)) return content;
  const binary = atob(content.slice(TEXT_DATA_URL_PREFIX.length));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
};

export async function buildProjectZip(project: Project, includeKeypairs: boolean): Promise<Blob> {
  const zip = new JSZip();
  const manifest: ProjectManifest = {
    version: MANIFEST_VERSION,
    name: project.name,
    description: project.description,
    framework: project.framework,
    idl: project.idl ?? null,
    ...(includeKeypairs ? { account: project.account, authorityAccount: project.authorityAccount } : {}),
  };
  zip.file(MANIFEST_FILE, JSON.stringify(manifest, null, 2));

  const addToZip = (nodes: FileNode[], currentPath: string = '') => {
    for (const node of nodes) {
      const path = currentPath ? `${currentPath}/${node.name}` : node.name;
      if (node.type === 'file' && node.content !== undefined) {
        zip.file(path, decodeStoredContent(node.content));
      } else if (node.type === 'directory' && node.children) {
        addToZip(node.children, path);
      }
    }
  };
  addToZip(project.files);
  return zip.generateAsync({ type: 'blob' });
}

const isAccount = (value: unknown): value is ProjectAccount =>
  !!value &&
  typeof value === 'object' &&
  ['privkey', 'pubkey', 'address'].every((key) => typeof (value as Record<string, unknown>)[key] === 'string');

/** Throws on anything this version did not write, so a damaged manifest is never half-applied. */
const parseManifest = (text: string): ProjectManifest => {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(`${MANIFEST_FILE} is not valid JSON`);
  }
  const m = (raw ?? {}) as Record<string, unknown>;
  if (m.version !== MANIFEST_VERSION) {
    throw new Error(`${MANIFEST_FILE} has unsupported version ${JSON.stringify(m.version)}`);
  }
  if (typeof m.name !== 'string' || !m.name.trim()) {
    throw new Error(`${MANIFEST_FILE} has no project name`);
  }
  if (m.description !== undefined && typeof m.description !== 'string') {
    throw new Error(`${MANIFEST_FILE} has an invalid description`);
  }
  if (m.framework !== undefined && m.framework !== 'native' && m.framework !== 'satellite') {
    throw new Error(`${MANIFEST_FILE} has unknown framework ${JSON.stringify(m.framework)}`);
  }
  let idl: ArchIdl | null = null;
  if (m.idl !== undefined && m.idl !== null) {
    const result = validateIdl(m.idl);
    if (!result.ok || !result.idl) throw new Error(`${MANIFEST_FILE} has an invalid IDL: ${result.reason}`);
    idl = result.idl;
  }
  for (const key of ['account', 'authorityAccount'] as const) {
    if (m[key] !== undefined && !isAccount(m[key])) throw new Error(`${MANIFEST_FILE} has an invalid ${key}`);
  }
  return {
    version: MANIFEST_VERSION,
    name: m.name.trim(),
    description: m.description as string | undefined,
    framework: m.framework as ProjectFramework | undefined,
    idl,
    account: m.account as ProjectAccount | undefined,
    authorityAccount: m.authorityAccount as ProjectAccount | undefined,
  };
};

/** Reads a project zip. Zips exported before the manifest existed return `manifest: null`. */
export async function readProjectZip(file: Blob): Promise<{ manifest: ProjectManifest | null; files: FileNode[] }> {
  const zip = await JSZip.loadAsync(file);
  const manifestEntry = zip.file(MANIFEST_FILE);
  const manifest = manifestEntry ? parseManifest(await manifestEntry.async('text')) : null;

  const fileNodes: FileNode[] = [];
  const fileMap = new Map<string, FileNode>();
  for (const [path, zipEntry] of Object.entries(zip.files)) {
    if (zipEntry.dir || path === MANIFEST_FILE) continue;
    const content = await zipEntry.async('text');
    const parts = path.split('/');
    let currentPath = '';

    for (const [index, part] of parts.entries()) {
      const isFile = index === parts.length - 1;
      const fullPath = currentPath + part;

      if (!fileMap.has(fullPath)) {
        const node: FileNode = {
          name: part,
          type: isFile ? 'file' : 'directory',
          path: fullPath,
          ...(isFile ? { content } : { children: [] }),
        };
        fileMap.set(fullPath, node);
        if (currentPath === '') {
          fileNodes.push(node);
        } else {
          fileMap.get(currentPath.slice(0, -1))?.children?.push(node);
        }
      }

      if (!isFile) {
        currentPath += part + '/';
      }
    }
  }

  return { manifest, files: fileNodes };
}
