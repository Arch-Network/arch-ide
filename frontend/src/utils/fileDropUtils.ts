/**
 * Utility for reading files/folders dropped from the OS file manager (Finder, Explorer, etc.)
 * Uses the `webkitGetAsEntry()` API to preserve directory structure.
 */

// ── Types ────────────────────────────────────────────────────

export interface DroppedFile {
  /** Relative path preserving folder hierarchy, e.g. "instructions/mod.rs" */
  relativePath: string;
  /** Text content of the file */
  content: string;
  /** Just the file name, e.g. "mod.rs" */
  fileName: string;
}

// Text file extensions we support reading as text
const TEXT_EXTENSIONS = new Set([
  'txt', 'rs', 'toml', 'json', 'js', 'ts', 'tsx', 'jsx',
  'md', 'css', 'scss', 'html', 'xml', 'yaml', 'yml',
  'sh', 'bash', 'zsh', 'fish', 'py', 'rb', 'php', 'java',
  'c', 'cpp', 'h', 'hpp', 'go', 'swift', 'kt', 'lock',
  'cargo', 'gitignore', 'env', 'svg',
]);

// ── Public API ───────────────────────────────────────────────

/**
 * Read all files from a DataTransfer drop event, preserving folder hierarchy.
 * Returns a flat array of DroppedFile entries with their relative paths.
 *
 * Skips binary files and hidden files/folders (starting with ".").
 *
 * NOTE: macOS Finder can expose both directory entries AND individual file entries
 * for the same files in dataTransfer.items. We process directories first, then
 * only add standalone file entries that weren't already found via directory traversal.
 */
export async function readDroppedItems(dataTransfer: DataTransfer): Promise<{
  files: DroppedFile[];
  skippedCount: number;
}> {
  const items = dataTransfer.items;
  const allFiles: DroppedFile[] = [];
  let skippedCount = 0;

  // Try webkitGetAsEntry first — this is the only way to get folder structure
  if (items && items.length > 0 && typeof items[0].webkitGetAsEntry === 'function') {
    // Separate directory and file entries upfront
    const dirEntries: FileSystemDirectoryEntry[] = [];
    const fileEntries: FileSystemFileEntry[] = [];

    for (let i = 0; i < items.length; i++) {
      const entry = items[i].webkitGetAsEntry();
      if (!entry || entry.name.startsWith('.')) continue;

      if (entry.isDirectory) {
        dirEntries.push(entry as FileSystemDirectoryEntry);
      } else if (entry.isFile) {
        fileEntries.push(entry as FileSystemFileEntry);
      }
    }

    // Phase 1: Process all directories first (these have full path information).
    // When a single top-level directory is dropped, read its CONTENTS directly
    // (don't wrap them under the folder's name) since the user is importing
    // the contents, not the container. When multiple items are dragged
    // (mix of dirs and files), keep the directory names as path segments.
    const isSingleFolderDrop = dirEntries.length === 1 && fileEntries.length === 0;

    const dirPromises = dirEntries.map(dir => {
      if (isSingleFolderDrop) {
        // Read the contents directly -- children get basePath = '' so their
        // paths are relative to the folder, not including the folder name.
        return readDirectoryContents(dir).then(result => {
          allFiles.push(...result.files);
          skippedCount += result.skippedCount;
        });
      }
      return readDirectoryEntries(dir, '').then(result => {
        allFiles.push(...result.files);
        skippedCount += result.skippedCount;
      });
    });
    await Promise.all(dirPromises);

    // Build a set of filenames already found via directory traversal
    const knownFileNames = new Set(allFiles.map(f => f.fileName));

    // Phase 2: Process standalone file entries, skipping any that were already
    // found inside a directory (macOS Finder often duplicates them as flat entries)
    const filePromises = fileEntries.map(fileEntry => {
      // Skip if this filename was already found via directory traversal
      if (knownFileNames.has(fileEntry.name)) return Promise.resolve();

      return readFileEntry(fileEntry, '').then(result => {
        if (result) {
          allFiles.push(result);
        } else {
          skippedCount++;
        }
      });
    });
    await Promise.all(filePromises);
  } else {
    // Fallback: flat file list (no folder structure)
    const files = dataTransfer.files;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.name.startsWith('.')) continue;

      if (isTextFile(file.name)) {
        const content = await readFileAsText(file);
        allFiles.push({
          relativePath: file.name,
          content,
          fileName: file.name,
        });
      } else {
        skippedCount++;
      }
    }
  }

  // Final safety: deduplicate entries where the same fileName appears both
  // as a bare name (relativePath === fileName) and with a directory path.
  // Keep only the version with the directory path.
  const dedupedFiles = deduplicateDroppedFiles(allFiles);
  skippedCount += allFiles.length - dedupedFiles.length;

  return { files: dedupedFiles, skippedCount };
}

/**
 * Determine the target root directory for a file based on its extension.
 * - .rs and .toml files go under "src" (Program section)
 * - .ts and .tsx files go under "client" (Client section)
 * - Other text files go under "src" by default
 */
export function getTargetRoot(fileName: string): 'src' | 'client' {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (['ts', 'tsx', 'js', 'jsx'].includes(ext)) {
    return 'client';
  }
  // Rust, TOML, and everything else goes to Program
  return 'src';
}

/**
 * Strip a leading root prefix from a relative path to avoid duplication.
 * e.g. stripLeadingRoot("src/instructions/mod.rs", "src") => "instructions/mod.rs"
 * e.g. stripLeadingRoot("client/index.ts", "client") => "index.ts"
 * e.g. stripLeadingRoot("instructions/mod.rs", "src") => "instructions/mod.rs" (no change)
 */
export function stripLeadingRoot(relativePath: string, root: string): string {
  const prefix = root + '/';
  if (relativePath.startsWith(prefix)) {
    return relativePath.slice(prefix.length);
  }
  return relativePath;
}

/**
 * Remove duplicate entries where a file appears both as a bare filename
 * (e.g. "bit_math.rs") and with a directory path (e.g. "math/bit_math.rs").
 * Keeps only the version with the directory path since it has the correct location.
 */
function deduplicateDroppedFiles(files: DroppedFile[]): DroppedFile[] {
  // Find filenames that have at least one entry with a directory path
  const hasNestedVersion = new Set<string>();
  for (const f of files) {
    if (f.relativePath !== f.fileName) {
      hasNestedVersion.add(f.fileName);
    }
  }

  // Remove bare-filename entries when a nested version exists
  return files.filter(f => {
    if (f.relativePath === f.fileName && hasNestedVersion.has(f.fileName)) {
      return false; // Drop this flat duplicate
    }
    return true;
  });
}

// ── Internal helpers ─────────────────────────────────────────

/**
 * Read a directory's CONTENTS without including the directory's own name
 * in the path. Used when a single folder is dropped -- we want the contents,
 * not a wrapper folder.
 */
async function readDirectoryContents(
  dirEntry: FileSystemDirectoryEntry
): Promise<{ files: DroppedFile[]; skippedCount: number }> {
  const files: DroppedFile[] = [];
  let skippedCount = 0;

  const entries = await getAllDirectoryEntries(dirEntry);
  const promises: Promise<void>[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue;

    if (entry.isFile) {
      promises.push(
        readFileEntry(entry as FileSystemFileEntry, '').then(result => {
          if (result) files.push(result);
          else skippedCount++;
        })
      );
    } else if (entry.isDirectory) {
      // Subdirectories DO include their name in the path
      promises.push(
        readDirectoryEntries(entry as FileSystemDirectoryEntry, '').then(result => {
          files.push(...result.files);
          skippedCount += result.skippedCount;
        })
      );
    }
  }

  await Promise.all(promises);
  return { files, skippedCount };
}

/**
 * Recursively read all entries from a directory, preserving paths.
 */
async function readDirectoryEntries(
  dirEntry: FileSystemDirectoryEntry,
  basePath: string
): Promise<{ files: DroppedFile[]; skippedCount: number }> {
  const files: DroppedFile[] = [];
  let skippedCount = 0;
  const currentPath = basePath ? `${basePath}/${dirEntry.name}` : dirEntry.name;

  const entries = await getAllDirectoryEntries(dirEntry);

  const promises: Promise<void>[] = [];

  for (const entry of entries) {
    // Skip hidden files/folders
    if (entry.name.startsWith('.')) continue;

    if (entry.isFile) {
      promises.push(
        readFileEntry(entry as FileSystemFileEntry, currentPath).then(result => {
          if (result) {
            files.push(result);
          } else {
            skippedCount++;
          }
        })
      );
    } else if (entry.isDirectory) {
      promises.push(
        readDirectoryEntries(entry as FileSystemDirectoryEntry, currentPath).then(result => {
          files.push(...result.files);
          skippedCount += result.skippedCount;
        })
      );
    }
  }

  await Promise.all(promises);
  return { files, skippedCount };
}

/**
 * Read all entries from a directory reader (handles batched reads).
 * The readEntries() API may return results in batches, so we loop until empty.
 */
function getAllDirectoryEntries(dirEntry: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const reader = dirEntry.createReader();
    const allEntries: FileSystemEntry[] = [];

    const readBatch = () => {
      reader.readEntries(
        (entries) => {
          if (entries.length === 0) {
            resolve(allEntries);
          } else {
            allEntries.push(...entries);
            readBatch(); // Continue reading until empty
          }
        },
        (err) => reject(err)
      );
    };

    readBatch();
  });
}

/**
 * Read a single FileSystemFileEntry and return a DroppedFile, or null if binary.
 */
async function readFileEntry(
  fileEntry: FileSystemFileEntry,
  basePath: string
): Promise<DroppedFile | null> {
  const file = await getFile(fileEntry);

  if (!isTextFile(file.name)) {
    return null;
  }

  const content = await readFileAsText(file);
  const relativePath = basePath ? `${basePath}/${file.name}` : file.name;

  return {
    relativePath,
    content,
    fileName: file.name,
  };
}

/**
 * Wrap FileSystemFileEntry.file() in a promise.
 */
function getFile(fileEntry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => {
    fileEntry.file(resolve, reject);
  });
}

/**
 * Read a File as text.
 */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/**
 * Check if a file name corresponds to a text file based on extension.
 */
function isTextFile(fileName: string): boolean {
  // Files without an extension but with known names
  const knownFiles = new Set(['Makefile', 'Dockerfile', 'Cargo.lock', '.gitignore']);
  if (knownFiles.has(fileName)) return true;

  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return TEXT_EXTENSIONS.has(ext);
}
