import * as monaco from "monaco-editor";

export const initTypeScriptDeclarations = (): monaco.IDisposable[] => {
  const disposables = [
    // Declare the module
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      `declare module "@arch-network/arch-sdk" {
        export type Pubkey = Uint8Array;
        // ... rest of your module declarations
      }`,
      "file:///node_modules/@types/arch-sdk/index.d.ts"
    ),

    // Declare globals
    monaco.languages.typescript.typescriptDefaults.addExtraLib(
      `declare global {
        const RpcConnection: typeof import("@arch-network/arch-sdk").RpcConnection;
        const PubkeyUtil: typeof import("@arch-network/arch-sdk").PubkeyUtil;
        const MessageUtil: typeof import("@arch-network/arch-sdk").MessageUtil;
        const UtxoMetaUtil: typeof import("@arch-network/arch-sdk").UtxoMetaUtil;
        const SignatureUtil: typeof import("@arch-network/arch-sdk").SignatureUtil;
      }`,
      "file:///globals.d.ts"
    )
  ];

  return disposables;
};
