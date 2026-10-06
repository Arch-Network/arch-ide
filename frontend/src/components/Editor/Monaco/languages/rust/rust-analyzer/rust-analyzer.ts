import * as monaco from "monaco-editor";
import { FileNode } from "../../../../../../types";

const LANGUAGE_ID = "rust";

interface ErrorLocation {
  line: number;
  column: number;
  end_line: number;
  end_column: number;
}

interface AnalysisResult {
  syntax_valid: boolean;
  error_message?: string;
  error_location?: ErrorLocation;
  functions: string[];
  structs: string[];
  traits: string[];
  macros: string[];
}

export class RustAnalyzer {
  private worker: Worker;
  private pendingRequests = new Map<number, { resolve: (value: any) => void; reject: (reason: any) => void }>();
  private nextId = 1;
  private initialized = false;

  constructor() {
    console.log("Initializing RustAnalyzer");
    this.worker = new Worker(
      new URL('./worker.ts', import.meta.url),
      { type: 'module' }
    );

    this.worker.onmessage = (e) => {
      const { id, result, error } = e.data;
      console.log("Worker message received:", { id, result, error });
      const pending = this.pendingRequests.get(id);
      if (pending) {
        if (error) {
          console.error("Worker error:", error);
          pending.reject(error);
        } else {
          console.log("Worker success:", result);
          pending.resolve(result);
        }
        this.pendingRequests.delete(id);
      }
    };

    // Initialize standard library
    this.initializeStdLib();
  }

  private async initializeStdLib() {
    console.log("Starting standard library initialization");
    try {
      console.log("Fetching standard library files...");
      const [coreResponse, allocResponse, stdResponse] = await Promise.all([
        fetch('/crates/core.rs'),
        fetch('/crates/alloc.rs'),
        fetch('/crates/std.rs')
      ]);

      if (!coreResponse.ok || !allocResponse.ok || !stdResponse.ok) {
        throw new Error('Failed to fetch one or more standard library files');
      }

      const [core, alloc, std] = await Promise.all([
        coreResponse.text(),
        allocResponse.text(),
        stdResponse.text()
      ]);

      console.log("Standard library files fetched successfully:", {
        coreLength: core.length,
        allocLength: alloc.length,
        stdLength: std.length
      });

      const result = await this.sendRequest('initializeStdLib', [{ core, alloc, std }]);
      console.log("Standard library initialized:", result);
      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize standard library:', error);
      // Retry initialization after a delay
      setTimeout(() => {
        if (!this.initialized) {
          console.log("Retrying standard library initialization...");
          this.initializeStdLib();
        }
      }, 2000);
    }
  }

  async analyze(code: string): Promise<AnalysisResult> {
    console.log("Starting code analysis");
    try {
      // Wait for initialization if needed
      if (!this.initialized) {
        console.log("Waiting for initialization...");
        await this.initializeStdLib();
      }

      const result = await this.sendRequest('analyze', [code]);
      console.log("Analysis complete:", result);
      return result as AnalysisResult;
    } catch (error) {
      console.error("Analysis failed:", error);
      throw error;
    }
  }

  private sendRequest(method: string, args: any[]): Promise<any> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      console.log(`Sending request: ${method}`, { id, args });
      this.pendingRequests.set(id, { resolve, reject });
      this.worker.postMessage({ method, args, id });
    });
  }

}

export function initRustAnalyzer(monacoInstance: typeof monaco, editorInstance: monaco.editor.IStandaloneCodeEditor) {
  console.log("Initializing Rust language support");
  monacoInstance.languages.register({ id: 'rust' });

  const analyzer = new RustAnalyzer();
  console.log('Rust analyzer initialized');

  // Add document change listener to the editor instance
  const disposable = editorInstance.onDidChangeModelContent(async (event) => {
    const model = editorInstance.getModel();
    if (model && model.getLanguageId() === LANGUAGE_ID) {
      console.log("Document changed, running analysis");
      const version = model.getVersionId();
      const result = await analyzer.analyze(model.getValue());
      // A newer edit (or a closed file) makes this result's positions meaningless.
      if (model.isDisposed() || model.getVersionId() !== version) return;
      console.log('Analysis result:', {
        syntax_valid: result.syntax_valid,
        error_message: result.error_message,
        error_location: result.error_location,
        full_result: result
      });

      // Only show an error the parser could describe and place; otherwise show nothing.
      const location = result.error_location;
      if (!result.syntax_valid && result.error_message && location) {
        console.log('Setting markers for error:', result.error_message);
        monacoInstance.editor.setModelMarkers(model, LANGUAGE_ID, [{
          severity: monacoInstance.MarkerSeverity.Error,
          message: result.error_message,
          startLineNumber: location.line,
          startColumn: location.column,
          endLineNumber: location.end_line,
          endColumn: location.end_column
        }]);
      } else {
        monacoInstance.editor.setModelMarkers(model, LANGUAGE_ID, []);
      }
    }
  });

  return {
    dispose: () => {
      console.log("Disposing Rust analyzer");
      disposable?.dispose();
    }
  };
}

// Add a function to determine language from filename
const getLanguageFromFilename = (filename: string): string => {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'rs':
      return 'rust';
    case 'ts':
    case 'tsx':
      return 'typescript';
    case 'js':
    case 'jsx':
      return 'javascript';
    // Add more cases as needed
    default:
      return 'plaintext';
  }
};

const getNodePath = (node: FileNode, ancestors: FileNode[]): string => {
  const path = [...ancestors.map(n => n.name), node.name];
  return path.join('/');
};
