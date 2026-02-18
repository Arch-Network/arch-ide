import type { RpcConnection, PubkeyUtil, MessageUtil } from "@arch-network/arch-sdk";

declare global {
  const RpcConnection: typeof import("@arch-network/arch-sdk").RpcConnection;
  const PubkeyUtil: typeof import("@arch-network/arch-sdk").PubkeyUtil;
  const MessageUtil: typeof import("@arch-network/arch-sdk").MessageUtil;

  interface Window {
    archSdk: {
      RpcConnection: typeof RpcConnection;
      PubkeyUtil: typeof PubkeyUtil;
      MessageUtil: typeof MessageUtil;
    };
  }
}

export {};

const declareArchSdkTypes = () => {
  return monaco.languages.typescript.typescriptDefaults.addExtraLib(`
    declare module "@arch-network/arch-sdk" {
      export class RpcConnection {
        constructor(endpoint: string);
        sendTransaction(transaction: RuntimeTransaction): Promise<string>;
        readAccountInfo(pubkey: Pubkey): Promise<AccountInfoResult>;
        getAccountAddress(pubkey: Pubkey): Promise<string>;
        getBestBlockHash(): Promise<string>;
        getBlockCount(): Promise<number>;
      }

      export class PubkeyUtil {
        static fromHex(hex: string): Uint8Array;
        static toHex(pubkey: Uint8Array): string;
      }

      export class MessageUtil {
        static hash(message: Message): Uint8Array;
        static serialize(message: Message): Uint8Array;
      }
    }

    declare global {
      const RpcConnection: typeof import("@arch-network/arch-sdk").RpcConnection;
      const PubkeyUtil: typeof import("@arch-network/arch-sdk").PubkeyUtil;
      const MessageUtil: typeof import("@arch-network/arch-sdk").MessageUtil;
    }
  `, "file:///node_modules/@types/arch-sdk/index.d.ts");
};