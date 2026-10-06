export const MAX_NAME_LENGTH = 64;

/**
 * Returns why `name` cannot be used for a new or renamed project, file, or folder, or null if it can.
 * Expects an already trimmed name; duplicates are matched case-insensitively.
 */
export function validateName(name: string, kind: 'project' | 'file' | 'folder', existingNames: readonly string[]): string | null {
  if (!name) return 'Name is required';
  if (name.length > MAX_NAME_LENGTH) return `Name must be ${MAX_NAME_LENGTH} characters or fewer`;
  if (/^\.+$/.test(name)) return 'Name cannot be only dots';
  if (kind !== 'project' && !/^[a-zA-Z0-9_.-]+$/.test(name)) {
    return 'Invalid name. Use only letters, numbers, underscore, dot, or dash';
  }
  const lower = name.toLowerCase();
  if (existingNames.some((existing) => existing.toLowerCase() === lower)) {
    return kind === 'project'
      ? `A project named "${name}" already exists`
      : `A file or folder named "${name}" already exists here`;
  }
  return null;
}
