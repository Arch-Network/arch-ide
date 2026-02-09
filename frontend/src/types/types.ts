export interface ArchIdl {
    version: string;
    name: string;
    instructions: any[];
    accounts: any[];
    types: any[];
  }

  export interface Config {
    network: string;
    rpcUrl: string;
  }

  export interface FileNode {
    name: string;
    type: 'file' | 'directory';
    content?: string;
    children?: FileNode[];
  }

  export type ComplexType = {
    name: string;
    fields: Array<{
      name: string;
      type: string;
    }>;
  };

  export interface FileChange {
    path: string;
    content: string;
    timestamp: number;
  }

  export interface ProjectAccount {
    privkey: string;
    pubkey: string;
    address: string;
  }

  export interface Message {
    signers: string[];
    instructions: Instruction[];
    hash?: string;
  }

  export interface Instruction {
    programId: string;
    accounts: AccountMeta[];
    data: Buffer;
  }

  export interface AccountMeta {
    pubkey: string;
    isSigner: boolean;
    isWritable: boolean;
  }

  export interface Disposable {
    dispose(): void;
  }