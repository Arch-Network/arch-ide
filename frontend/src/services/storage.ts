// src/services/storage.ts
import { openDB, IDBPDatabase } from 'idb';
import type { FileNode, Project } from '../types';

const DB_NAME = 'arch-ide';
const DB_VERSION = 1;
const BACKUP_KEY_PREFIX = 'pg_backup_';

interface ArchIDEDB {
  projects: {
    key: string;
    value: Project;
    indexes: { 'by-name': string };
  };
}

export interface IStorageService {
  init: () => Promise<void>;
  isTextFile: (fileName: string) => boolean;
  saveProject: (project: Project) => Promise<void>;
  getProject: (id: string) => Promise<Project | null>;
  getAllProjects: () => Promise<Project[]>;
  deleteProject: (id: string) => Promise<void>;
  clearProgramBinary: () => void;
  clearProgramId: () => void;
  clearCurrentAccount: () => void;
  saveConfig: (config: any) => void;
  getConfig: () => any;
  saveProgramBinary: (binary: string | null) => void;
  getProgramBinary: () => string | null;
}

export class StorageService implements IStorageService {
  private db: IDBPDatabase<ArchIDEDB> | null = null;
  private initRetries = 0;
  private readonly maxRetries = 3;

  async init(): Promise<void> {
    try {
      this.db = await openDB<ArchIDEDB>(DB_NAME, DB_VERSION, {
        upgrade(db: IDBPDatabase<ArchIDEDB>) {
          if (!db.objectStoreNames.contains('projects')) {
            const projectStore = db.createObjectStore('projects', { keyPath: 'id' });
            projectStore.createIndex('by-name', 'name');
          }
        },
      });
      this.initRetries = 0; // Reset retry counter on success
    } catch (error) {
      console.error('Failed to initialize IndexedDB:', error);

      // Try to delete and recreate the database
      if (this.initRetries < this.maxRetries) {
        this.initRetries++;
        console.log(`Attempting to recreate database (attempt ${this.initRetries}/${this.maxRetries})`);

        try {
          // Delete the corrupted database
          await this.deleteDatabase();

          // Try to initialize again
          this.db = await openDB<ArchIDEDB>(DB_NAME, DB_VERSION, {
            upgrade(db: IDBPDatabase<ArchIDEDB>) {
              if (!db.objectStoreNames.contains('projects')) {
                const projectStore = db.createObjectStore('projects', { keyPath: 'id' });
                projectStore.createIndex('by-name', 'name');
              }
            },
          });

          this.initRetries = 0;
        } catch (retryError) {
          console.error('Failed to recreate database:', retryError);

          if (this.initRetries >= this.maxRetries) {
            const message = 'IndexedDB is unavailable. Please try:\n' +
              '1. Close all other tabs with this site\n' +
              '2. Clear browser data for this site\n' +
              '3. Restart your browser\n' +
              '4. Check if you\'re in private browsing mode';

            alert(message);
            throw new Error('IndexedDB initialization failed after multiple retries');
          } else {
            // Try again
            return this.init();
          }
        }
      } else {
        throw error;
      }
    }
  }

  private async deleteDatabase(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.deleteDatabase(DB_NAME);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        console.error('Failed to delete database:', request.error);
        reject(request.error);
      };

      request.onblocked = () => {
        console.warn('Database deletion blocked. Please close all other tabs.');
        // Resolve anyway and try to continue
        setTimeout(() => resolve(), 1000);
      };
    });
  }

  isTextFile(fileName: string): boolean {
    const textExtensions = [
      'txt', 'rs', 'toml', 'json', 'js', 'ts', 'tsx', 'jsx',
      'md', 'css', 'scss', 'html', 'xml', 'yaml', 'yml',
      'sh', 'bash', 'zsh', 'fish', 'py', 'rb', 'php', 'java',
      'c', 'cpp', 'h', 'hpp', 'go', 'swift', 'kt', 'lock',
      'cargo', 'gitignore', 'env'
    ];
    const extension = fileName.split('.').pop()?.toLowerCase();
    return textExtensions.includes(extension || '');
  }

  private decodeFileContent(content: string, fileName: string): string {
    if (!content.startsWith('data:')) {
      return content;
    }

    try {
      const base64Content = content.split(';base64,')[1];
      if (!base64Content) {
        console.error('Invalid base64 content format');
        return content;
      }
      return atob(base64Content);
    } catch (e) {
      console.error('Failed to decode base64 content:', e);
      return content;
    }
    return content;
  }

  // Empty files are valid (New File creates ''); only missing or undecodable content is not.
  private isValidContent = (content: string | undefined): boolean => {
    if (typeof content !== 'string') return false;
    if (content.startsWith('data:text/plain;base64,')) {
      try {
        atob(content.replace(/^data:text\/plain;base64,/, ''));
        return true;
      } catch {
        return false;
      }
    }
    return true;
  };

  async saveProject(project: Project): Promise<void> {
    if (!this.db) await this.init();

    // Validate files before saving - recursively check all files including nested ones
    const validateFileNodes = (nodes: FileNode[], path: string = ''): string[] => {
      const invalidFiles: string[] = [];
      for (const node of nodes) {
        const fullPath = path ? `${path}/${node.name}` : node.name;
        if (node.type === 'file' && !this.isValidContent(node.content)) {
          console.error(`Invalid content detected for file: ${fullPath}`);
          invalidFiles.push(fullPath);
        }
        if (node.type === 'directory' && node.children) {
          invalidFiles.push(...validateFileNodes(node.children, fullPath));
        }
      }
      return invalidFiles;
    };

    const invalidFiles = validateFileNodes(project.files);
    if (invalidFiles.length > 0) {
      console.error('Cannot save project with invalid files:', invalidFiles);
      throw new Error(`Cannot save project with invalid files: ${invalidFiles.join(', ')}`);
    }

    // Add detailed logging for the initial project state
    console.group('StorageService.saveProject - Initial State');
    console.log('Project ID:', project.id);
    console.log('Project Name:', project.name);
    console.log('File Count:', project.files.length);
    console.log('Files:', project.files.map(f => ({
      name: f.name,
      type: f.type,
      contentPreview: f.content?.substring(0, 100),
      contentLength: f.content?.length
    })));
    console.groupEnd();

    // Don't encode already encoded content
    const shouldEncodeContent = (content: string) => {
      const isEncoded = content.startsWith('data:');
      console.log(`Content encoding check - Already encoded: ${isEncoded}`);
      return !isEncoded;
    };

    // Encode file contents when saving project
    const encodeFileNodes = (nodes: FileNode[]): FileNode[] => {
      console.group('Encoding file nodes');
      console.log('Processing nodes:', nodes.length);

      const encodedNodes = nodes.map(node => {
        if (node.type === 'file' && node.content && shouldEncodeContent(node.content)) {
          console.log(`Encoding file: ${node.name}`);
          console.log('Original content length:', node.content.length);

          // Use TextEncoder to handle UTF-8 characters properly
          let base64Content: string;
          try {
            // Convert string to UTF-8 bytes, then to base64
            const utf8Bytes = new TextEncoder().encode(node.content);
            base64Content = btoa(String.fromCharCode(...utf8Bytes));
          } catch (e) {
            // Fallback for very large content: use btoa directly (may fail on Unicode)
            console.warn(`UTF-8 encoding failed for ${node.name}, falling back to btoa:`, e);
            base64Content = btoa(unescape(encodeURIComponent(node.content)));
          }

          console.log('Encoded content length:', base64Content.length);

          const encoded = {
            ...node,
            content: `data:text/plain;base64,${base64Content}`
          };

          // Verify encoding
          try {
            const decoded = atob(base64Content);
            const utf8Bytes = new Uint8Array(decoded.split('').map(c => c.charCodeAt(0)));
            const decodedContent = new TextDecoder().decode(utf8Bytes);
            const encodingValid = decodedContent === node.content;
            console.log(`Encoding verification for ${node.name}: ${encodingValid ? 'PASSED' : 'FAILED'}`);
            if (!encodingValid) {
              console.warn('Content mismatch detected!');
            }
          } catch (e) {
            console.error(`Encoding verification failed for ${node.name}:`, e);
          }

          return encoded;
        }

        return {
          ...node,
          children: node.children ? encodeFileNodes(node.children) : undefined
        };
      });

      console.groupEnd();
      return encodedNodes;
    };

    const encodedFiles = encodeFileNodes(project.files);

    // Verify encoded project before saving
    console.group('StorageService.saveProject - Pre-save Verification');
    console.log('Encoded File Count:', encodedFiles.length);
    console.log('Encoded Files:', encodedFiles.map(f => ({
      name: f.name,
      type: f.type,
      isEncoded: f.content?.startsWith('data:'),
      contentLength: f.content?.length
    })));
    console.groupEnd();

    console.group('Pre-save Content Integrity Check');
    this.verifyFileNodeIntegrity(project.files);
    console.groupEnd();

    try {
      await this.db!.put('projects', {
        ...project,
        files: encodedFiles,
        lastModified: new Date(),
        lastAccessed: project.lastAccessed || new Date()
      });

      // Verify save by reading back
      const savedProject = await this.db!.get('projects', project.id);
      console.group('StorageService.saveProject - Save Verification');
      console.log('Project retrieved successfully:', !!savedProject);
      if (savedProject) {
        console.log('Saved file count:', savedProject.files.length);
        console.group('Detailed File Verification');
        const verifyFileNodes = (nodes: FileNode[], depth = 0) => {
          nodes.forEach(node => {
            console.group(`${'-'.repeat(depth)} ${node.name} (${node.type})`);
            if (node.type === 'file') {
              const contentStart = node.content?.substring(0, 50);
              console.log({
                path: node.path,
                contentLength: node.content?.length || 0,
                isEncoded: node.content?.startsWith('data:'),
                contentPreview: contentStart ? `${contentStart}...` : 'empty',
                contentHash: node.content ? this.hashString(node.content) : 'no content'
              });
            }
            if (node.children?.length) {
              verifyFileNodes(node.children, depth + 1);
            }
            console.groupEnd();
          });
        };

        verifyFileNodes(savedProject.files);
        console.groupEnd();
      }
      console.groupEnd();

      if (savedProject) {
        console.group('Post-save Content Integrity Check');
        this.verifyFileNodeIntegrity(savedProject.files);
        console.groupEnd();
      }

    } catch (error) {
      console.error('Failed to save project:', error);
      throw error;
    }
  }

  async getProject(id: string): Promise<Project | null> {
    if (!this.db) {
      await this.init();
    }

    const project = await this.db!.get('projects', id);

    // Validate project files recursively
    const hasInvalidFiles = (nodes: FileNode[]): boolean => {
      for (const node of nodes) {
        if (node.type === 'file' && !this.isValidContent(node.content)) {
          return true;
        }
        if (node.type === 'directory' && node.children && hasInvalidFiles(node.children)) {
          return true;
        }
      }
      return false;
    };

    if (project && hasInvalidFiles(project.files)) {
      console.error('Invalid project state detected - attempting to restore from backup');

      // Try to restore from backup
      const backup = localStorage.getItem(`${BACKUP_KEY_PREFIX}${id}`);
      if (backup) {
        const backupProject = JSON.parse(backup);
        await this.saveProject(backupProject);
        return backupProject;
      }

      throw new Error('Project files are corrupted and no backup is available');
    }

    return project;
  }

  async getAllProjects(): Promise<Project[]> {
    if (!this.db) await this.init();
    const projects = await this.db!.getAll('projects');

    // Only strip content in production
    if (import.meta.env.PROD) {
      return projects.map(project => ({
        ...project,
        files: this.stripFileContent(project.files)
      }));
    }

    return projects;
  }

  async deleteProject(id: string): Promise<void> {
    if (!this.db) await this.init();
    await this.db!.delete('projects', id);
  }

  private stripFileContent(files: FileNode[]): FileNode[] {
    return files.map(file => ({
      ...file,
      content: file.type === 'file' ? '' : undefined,
      children: file.children ? this.stripFileContent(file.children) : undefined,
      path: file.path
    }));
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16); // Convert to hex
  }

  private verifyFileNodeIntegrity(nodes: FileNode[], parentPath: string = ''): void {
    const seenContent = new Map<string, string>();

    const checkNode = (node: FileNode, path: string) => {
      if (node.type === 'file' && node.content) {
        // Check if we've seen this exact content before
        const contentHash = this.hashString(node.content);
        if (seenContent.has(contentHash)) {
          const previousPath = seenContent.get(contentHash);
          console.error(`Content duplication detected!`, {
            currentFile: path + '/' + node.name,
            previousFile: previousPath,
            contentPreview: node.content.substring(0, 100)
          });
        } else {
          seenContent.set(contentHash, path + '/' + node.name);
        }
      }

      if (node.children) {
        const newPath = path ? `${path}/${node.name}` : node.name;
        node.children.forEach(child => checkNode(child, newPath));
      }
    };

    nodes.forEach(node => checkNode(node, parentPath));
  }

  clearProgramBinary(): void {
    localStorage.removeItem('programBinary');
  }

  clearProgramId(): void {
    localStorage.removeItem('programId');
  }

  clearCurrentAccount(): void {
    localStorage.removeItem('currentAccount');
  }

  saveConfig: (config: any) => void = (config) => localStorage.setItem('config', JSON.stringify(config));
  getConfig: () => any = () => JSON.parse(localStorage.getItem('config') || 'null');
  saveProgramBinary: (binary: string | null) => void = (binary) => localStorage.setItem('programBinary', binary || '');
  getProgramBinary: () => string | null = () => localStorage.getItem('programBinary');
}

export const storage: IStorageService = new StorageService();