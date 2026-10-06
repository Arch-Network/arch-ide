import * as monaco from 'monaco-editor';
import { declareGlobalTypes } from "./global";
import type { Disposable } from "../../../../../types/types";

export const initDeclarations = async (editor: monaco.editor.IStandaloneCodeEditor): Promise<Disposable> => {
  const currentModel = editor.getModel();
  console.log('Current model:', currentModel);

  // Force TypeScript language for .ts files
  if (currentModel) {
    const uri = currentModel.uri.toString();
    if (uri.endsWith('.ts')) {
      monaco.editor.setModelLanguage(currentModel, 'typescript');
    }
  }

  // Register TypeScript language support
  monaco.languages.register({ id: 'typescript' });
  monaco.languages.register({ id: 'javascript' });

  // Set diagnostics options to be more permissive
  monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    onlyVisible: false,
    // TS1108 (return outside a function): Run wraps each client file in an async
    // function, so a top-level `return` is how a script stops early.
    diagnosticCodesToIgnore: [1108],
  });

  // Set compiler options before loading declarations
  monaco.languages.typescript.typescriptDefaults.setCompilerOptions({
    target: monaco.languages.typescript.ScriptTarget.ES2020,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    // The language service takes lib file names, not tsconfig's "ES2020"/"DOM" spellings.
    lib: ["lib.es2020.d.ts", "lib.dom.d.ts"],
    // ts.ModuleDetectionKind.Force (Monaco does not export the enum). Run executes each
    // client file on its own inside an async wrapper, so top-level await is valid and
    // top-level names must not collide across files.
    moduleDetection: 3,
    allowNonTsExtensions: true,
    typeRoots: ["node_modules/@types"],
    allowJs: true,
    strict: false,
    noImplicitAny: false,
    allowSyntheticDefaultImports: true,
    jsx: monaco.languages.typescript.JsxEmit.React
  });

  // Add the arch-sdk module declaration (includes global declarations)
  const moduleDisposable = monaco.languages.typescript.typescriptDefaults.addExtraLib(
    (await import('./raw/arch-sdk.raw.d.ts?raw')).default,
    "file:///node_modules/@types/arch-sdk/index.d.ts"
  );

  // Add playground-specific global utilities
  const playgroundGlobalsDisposable = monaco.languages.typescript.typescriptDefaults.addExtraLib(
    `declare global {
      function getSmartRpcUrl(network?: string): string;

      const ClientTransactionUtil: {
        setupAccount(conn: import("@arch-network/arch-sdk").RpcConnection): Promise<{
          accountPubkey: import("@arch-network/arch-sdk").Pubkey;
          accountAddress: string;
          useWallet: boolean;
          privkey?: string;
        }>;
        signAndSendTransaction(
          conn: import("@arch-network/arch-sdk").RpcConnection,
          message: import("@arch-network/arch-sdk").Message,
          useWallet: boolean
        ): Promise<string | undefined>;
      };

      const walletProxy: {
        isAvailable(): Promise<boolean>;
        getWalletType(): Promise<string | null>;
        getAccounts(): Promise<string[]>;
        getPublicKey(): Promise<string>;
        signMessage(message: string, protocol?: string): Promise<string>;
        sendBitcoin(toAddress: string, amount: number): Promise<string>;
      };
    }

    export {};`,
    "file:///playground-globals.d.ts"
  );

  return {
    dispose: () => {
      moduleDisposable.dispose();
      playgroundGlobalsDisposable.dispose();
    }
  };
};