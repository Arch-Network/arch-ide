// Bitcoin Wallet Manager - Similar to Solana Playground's PgWallet
import { BitcoinWalletAdapter, BitcoinWalletAccount, BitcoinWalletState, SerializedBitcoinWallet } from '../../types/wallet';
import { UnisatWalletAdapter } from './adapters/unisat';
import { XverseWalletAdapter } from './adapters/xverse';

type WalletChangeListener = () => void;

const STORAGE_KEY = 'arch-bitcoin-wallet';

const defaultState: BitcoinWalletState = {
  state: 'disconnected',
  currentWallet: null,
  availableWallets: [],
  currentAccount: null,
  show: false,
};

class BitcoinWalletManager {
  private state: BitcoinWalletState = defaultState;
  private listeners: Set<WalletChangeListener> = new Set();

  constructor() {
    this.initialize();
  }

  private initialize() {
    // Initialize available wallet adapters
    const adapters = [
      new UnisatWalletAdapter(),
      new XverseWalletAdapter(),
    ];

    this.state.availableWallets = adapters.filter(adapter => adapter.isAvailable());

    // Try to restore previous connection
    this.restoreConnection();
  }

  /** Get current state */
  getState(): BitcoinWalletState {
    return this.state;
  }

  /** Get current wallet adapter */
  get current(): BitcoinWalletAdapter | null {
    return this.state.currentWallet;
  }

  /** Get current account */
  get account(): BitcoinWalletAccount | null {
    return this.state.currentAccount;
  }

  /** Get available wallets */
  get availableWallets(): BitcoinWalletAdapter[] {
    return this.state.availableWallets;
  }

  /** Check if connected */
  get isConnected(): boolean {
    return this.state.state === 'connected' && !!this.state.currentWallet?.connected;
  }

  /** Subscribe to state changes */
  subscribe(listener: WalletChangeListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Notify all listeners of state change */
  private notify() {
    this.listeners.forEach(listener => listener());
  }

  /** Update state */
  private updateState(partial: Partial<BitcoinWalletState>) {
    this.state = { ...this.state, ...partial };
    this.notify();
    this.saveToStorage();
  }

  /** Save wallet state to localStorage */
  private saveToStorage() {
    try {
      // Never persist a transient "connecting" state; it can get stuck across reloads.
      // Persist only stable states (connected/disconnected).
      const stableState: BitcoinWalletState['state'] =
        this.state.state === 'connecting' ? 'disconnected' : this.state.state;
      const serialized: SerializedBitcoinWallet = {
        state: stableState,
        walletName: this.state.currentWallet?.name || null,
        network: this.state.currentWallet?.network,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
    } catch (error) {
      console.error('Failed to save wallet state:', error);
    }
  }

  /** Restore wallet connection from localStorage */
  private async restoreConnection() {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return;

      const serialized: SerializedBitcoinWallet = JSON.parse(stored);

      // If we ever persisted a stale/non-stable state, clear it.
      if (serialized.state !== 'connected') {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }

      if (serialized.state === 'connected' && serialized.walletName) {
        const wallet = this.state.availableWallets.find(
          w => w.name === serialized.walletName
        );

        if (wallet) {
          // Try to reconnect silently
          try {
            await this.connect(wallet.name, serialized.network ?? 'testnet');
          } catch (error) {
            console.log('Failed to restore wallet connection:', error);
            // Clear stored state if reconnection fails
            localStorage.removeItem(STORAGE_KEY);
          }
        } else {
          // Previously selected wallet isn't available anymore (extension removed/disabled)
          localStorage.removeItem(STORAGE_KEY);
        }
      }
    } catch (error) {
      console.error('Failed to restore wallet state:', error);
    }
  }

  /** Connect to a wallet by name with optional network */
  async connect(walletName: string, network?: 'mainnet' | 'testnet' | 'regtest'): Promise<void> {
    const wallet = this.state.availableWallets.find(w => w.name === walletName);

    if (!wallet) {
      throw new Error(`Wallet "${walletName}" not available`);
    }

    try {
      this.updateState({ state: 'connecting', currentWallet: wallet });

      // Pass network to wallet connect method
      // User-driven wallet connects often require user approval and can take a while.
      const connectTimeoutMs = 60_000;
      await Promise.race([
        wallet.connect(network ?? 'testnet'),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Wallet connect timed out after ${connectTimeoutMs}ms`)), connectTimeoutMs)
        ),
      ]);

      // Use accounts from wallet adapter directly (already set in connect())
      // Only call getAccounts if no accounts are set
      let currentAccount = wallet.accounts[0] || null;

      if (!currentAccount) {
        const accounts = await wallet.getAccounts();
        currentAccount = accounts[0] || null;
      }

      this.updateState({
        state: 'connected',
        currentWallet: wallet,
        currentAccount,
      });

      console.log(`Connected to ${walletName} on ${wallet.network || network}:`, currentAccount?.address);
    } catch (error) {
      this.updateState({
        state: 'disconnected',
        currentWallet: null,
        currentAccount: null,
      });
      // Ensure we don't leave any stale persisted state behind
      try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
      throw error;
    }
  }

  /** Disconnect current wallet */
  async disconnect(): Promise<void> {
    if (this.state.currentWallet) {
      await this.state.currentWallet.disconnect();
    }

    this.updateState({
      state: 'disconnected',
      currentWallet: null,
      currentAccount: null,
    });

    localStorage.removeItem(STORAGE_KEY);
    console.log('Disconnected wallet');
  }

  /** Sign a message with the current wallet */
  async signMessage(message: string) {
    if (!this.state.currentWallet || !this.isConnected) {
      throw new Error('No wallet connected');
    }

    return await this.state.currentWallet.signMessage(message);
  }

  /** Send Bitcoin with the current wallet */
  async sendBitcoin(toAddress: string, amount: number) {
    if (!this.state.currentWallet || !this.isConnected) {
      throw new Error('No wallet connected');
    }

    return await this.state.currentWallet.sendBitcoin(toAddress, amount);
  }

  /** Sign a PSBT with the current wallet */
  async signPsbt(psbtHex: string) {
    if (!this.state.currentWallet || !this.isConnected) {
      throw new Error('No wallet connected');
    }

    if (!this.state.currentWallet.signPsbt) {
      throw new Error('Current wallet does not support PSBT signing');
    }

    return await this.state.currentWallet.signPsbt(psbtHex);
  }

  /** Show wallet UI */
  show() {
    this.updateState({ show: true });
  }

  /** Hide wallet UI */
  hide() {
    this.updateState({ show: false });
  }

  /** Toggle wallet UI */
  toggle() {
    this.updateState({ show: !this.state.show });
  }
}

// Export singleton instance
export const walletManager = new BitcoinWalletManager();

// Export class for testing
export { BitcoinWalletManager };
