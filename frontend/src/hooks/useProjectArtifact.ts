import { useCallback, useEffect, useRef, useState } from 'react';
import { artifactStore } from '../services/artifactStore';
import { storage } from '../utils/storage';

/**
 * The current project's program binary, persisted per project so it survives project switches and reloads.
 * A setter keeps the project it was created for: a build that finishes after a switch stores its binary
 * under the project that started it, without showing it in the new one.
 */
export function useProjectArtifact(projectId: string | undefined) {
  const [programBinary, setBinary] = useState<string | null>(null);
  const activeIdRef = useRef(projectId);
  // Bumped by every load and every write, so a slow load never overwrites a newer value.
  const versionRef = useRef(0);

  useEffect(() => {
    activeIdRef.current = projectId;
    const version = ++versionRef.current;
    setBinary(null);
    if (!projectId) return;
    loadArtifact(projectId)
      .then((stored) => {
        if (versionRef.current === version) setBinary(stored);
      })
      .catch((error) => console.error('Failed to load build artifact:', error));
  }, [projectId]);

  const setProgramBinary = useCallback((binary: string | null) => {
    if (activeIdRef.current === projectId) {
      versionRef.current++;
      setBinary(binary);
    }
    if (!projectId) return;
    (binary ? artifactStore.put(projectId, binary) : artifactStore.delete(projectId))
      .catch((error) => console.error('Failed to save build artifact:', error));
  }, [projectId]);

  return [programBinary, setProgramBinary] as const;
}

/** Moves the binary older versions kept globally in localStorage into the first project opened. */
async function loadArtifact(projectId: string): Promise<string | null> {
  const stored = await artifactStore.get(projectId);
  const legacy = storage.getProgramBinary();
  if (!legacy) return stored;
  if (!stored) await artifactStore.put(projectId, legacy);
  storage.saveProgramBinary(null);
  return stored ?? legacy;
}
