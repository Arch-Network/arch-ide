// Bitcoin wallet types and interfaces

export interface BitcoinWalletAccount {
  address: string;
  publicKey: string;
  /** Address type (e.g., 'p2wpkh', 'p2tr') */
  type?: string;
}

export interface SignMessageResponse {
  signature: string;
  address: string;
}

export interface SendBitcoinResponse {
  txid: string;
}

/** Base interface for Bitcoin wallet adapters */
export interface BitcoinWalletAdapter {
  /** Wallet name */
  name: string;
  /** Wallet icon URL */
  icon: string;
  /** Whether the wallet is currently connected */
  connected: boolean;
  /** Whether the wallet is currently connecting */
  connecting: boolean;
  /** Current connected accounts */
  accounts: BitcoinWalletAccount[];
  /** Network the wallet is connected to */
  network?: 'mainnet' | 'testnet' | 'regtest';

  /** Check if the wallet extension is installed */
  isAvailable(): boolean;
  /** Install page shown when the extension is missing */
  installUrl?: string;
  /** Connect to the wallet with optional network */
  connect(network?: 'mainnet' | 'testnet' | 'regtest'): Promise<void>;
  /** Disconnect from the wallet */
  disconnect(): Promise<void>;
  /** Get current accounts */
  getAccounts(): Promise<BitcoinWalletAccount[]>;
  /** Sign a message */
  signMessage(message: string): Promise<SignMessageResponse>;
  /** Send Bitcoin */
  sendBitcoin(toAddress: string, amount: number): Promise<SendBitcoinResponse>;
  /** Sign a PSBT (Partially Signed Bitcoin Transaction) */
  signPsbt?(psbtHex: string): Promise<string>;
  /** Switch network */
  switchNetwork?(network: 'mainnet' | 'testnet'): Promise<void>;
}

/** Wallet state */
export interface BitcoinWalletState {
  /** Connection state */
  state: 'disconnected' | 'connecting' | 'connected';
  /** Current wallet adapter */
  currentWallet: BitcoinWalletAdapter | null;
  /** Available wallet adapters */
  availableWallets: BitcoinWalletAdapter[];
  /** Current account */
  currentAccount: BitcoinWalletAccount | null;
  /** Whether to show the wallet UI */
  show: boolean;
}

/** Serialized wallet state for storage */
export type SerializedBitcoinWallet = Pick<
  BitcoinWalletState,
  'state'
> & {
  walletName: string | null;
  network?: 'mainnet' | 'testnet' | 'regtest';
};
