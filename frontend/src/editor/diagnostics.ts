import { useSyncExternalStore } from 'react';
import type * as Monaco from 'monaco-editor';

export interface EditorDiagnostic {
  path: string;
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning';
  source: string;
}

let diagnostics: EditorDiagnostic[] = [];
const listeners = new Set<() => void>();

const setDiagnostics = (next: EditorDiagnostic[]) => {
  diagnostics = next;
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const useEditorDiagnostics = () => useSyncExternalStore(subscribe, () => diagnostics);

/** Mirrors the model's error and warning markers into the store until disposed. */
export function trackModelDiagnostics(
  monaco: typeof Monaco,
  model: Monaco.editor.ITextModel,
  path: string,
): Monaco.IDisposable {
  const publish = () =>
    setDiagnostics(
      monaco.editor
        .getModelMarkers({ resource: model.uri })
        .filter((m) => m.severity >= monaco.MarkerSeverity.Warning)
        .map((m) => ({
          path,
          line: m.startLineNumber,
          column: m.startColumn,
          message: m.message,
          severity: m.severity === monaco.MarkerSeverity.Error ? 'error' : 'warning',
          source: m.owner,
        })),
    );

  publish();
  const listener = monaco.editor.onDidChangeMarkers((uris) => {
    if (uris.some((uri) => uri.toString() === model.uri.toString())) publish();
  });
  return {
    dispose: () => {
      listener.dispose();
      setDiagnostics([]);
    },
  };
}
