// Window type declarations for Bitcoin wallets

export interface UnisatAPI {
  requestAccounts(): Promise<string[]>;
  getAccounts(): Promise<string[]>;
  getPublicKey(): Promise<string>;
  getNetwork(): Promise<'livenet' | 'testnet'>;
  switchNetwork(network: 'livenet' | 'testnet'): Promise<void>;
  signMessage(message: string, type?: 'ecdsa' | 'bip322-simple'): Promise<string>;
  sendBitcoin(toAddress: string, satoshis: number): Promise<string>;
  signPsbt(psbtHex: string, options?: { autoFinalized?: boolean }): Promise<string>;
  pushPsbt(psbtHex: string): Promise<string>;
  on(event: string, handler: (accounts: any) => void): void;
  removeListener(event: string, handler: (accounts: any) => void): void;
}

export interface XverseAddress {
  address: string;
  publicKey: string;
  purpose: 'payment' | 'ordinals';
}

export interface XverseGetAddressResponse {
  addresses: XverseAddress[];
}

export interface XverseRequest {
  request(method: 'getAddresses' | 'getAccounts', params?: any): Promise<XverseGetAddressResponse>;
  request(method: 'sendTransfer', params: {
    recipients: Array<{ address: string; amount: number }>
  }): Promise<{ txid: string }>;
  request(method: 'signMessage', params: {
    message: string;
    address: string
  }): Promise<string>;
  request(method: string, params?: any): Promise<any>;
}

export interface XverseProviders {
  BitcoinProvider?: XverseRequest;
}

/** Injected by the Arch Wallet Chrome extension (`window.arch`). */
export interface ArchWalletAPI {
  isArchWallet: true;
  connect(): Promise<{
    address: string;
    publicKey: string;
    archAddress: string;
    kind?: string;
  }>;
  disconnect(): Promise<void>;
  getAccount(): Promise<{
    address: string;
    publicKey: string;
    archAddress: string;
    kind?: string;
  } | null>;
  signMessage(message: Uint8Array): Promise<{ signature: string }>;
  signArchMessageHash?(messageHash: Uint8Array): Promise<{ signature64Hex: string }>;
  sendTransfer?(params: { to: string; lamports: string }): Promise<{ txid: string }>;
  on(event: string, cb: (...args: unknown[]) => void): void;
  removeListener(event: string, cb: (...args: unknown[]) => void): void;
}

/** Injected by the Arch Wallet Chrome extension (`window.bitcoinArch`). */
export interface ArchBitcoinAPI {
  isArchWallet: true;
  name?: string;
  connect(): Promise<{ address: string; publicKey: string }>;
  getAccounts(): Promise<string[]>;
  signPsbt(params: { psbt: string; signInputs?: Record<string, number[]> }): Promise<{ psbt: string } | string>;
}

declare global {
  interface Window {
    unisat?: UnisatAPI;
    xverse?: any; // Legacy
    XverseProviders?: XverseProviders;
    arch?: ArchWalletAPI;
    bitcoinArch?: ArchBitcoinAPI;
  }
}

export {};
