// Unisat Wallet Adapter
import { BitcoinWalletAdapter, BitcoinWalletAccount, SignMessageResponse, SendBitcoinResponse } from '../../../types/wallet';

export class UnisatWalletAdapter implements BitcoinWalletAdapter {
  name = 'Unisat';
  icon = 'https://unisat.io/img/logo.svg';
  connected = false;
  connecting = false;
  accounts: BitcoinWalletAccount[] = [];
  network?: 'mainnet' | 'testnet' | 'regtest';

  private accountChangeHandler?: (accounts: string[]) => void;

  isAvailable(): boolean {
    // Some environments/extensions may leave a stub `window.unisat` object behind.
    // Require the core methods we rely on to avoid false "available" positives.
    return (
      typeof window !== 'undefined' &&
      !!window.unisat &&
      typeof window.unisat.requestAccounts === 'function' &&
      typeof window.unisat.getAccounts === 'function' &&
      typeof window.unisat.signMessage === 'function'
    );
  }

  async connect(targetNetwork?: 'mainnet' | 'testnet' | 'regtest'): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error('Unisat wallet not installed. Please install from https://unisat.io');
    }

    try {
      this.connecting = true;

      // Get current network
      const currentNetwork = await window.unisat!.getNetwork();
      const currentNetworkNormalized = currentNetwork === 'livenet' ? 'mainnet' : 'testnet';

      // Switch network if needed
      if (targetNetwork && targetNetwork !== 'regtest') {
        const unisatNetwork = targetNetwork === 'mainnet' ? 'livenet' : 'testnet';
        if (currentNetworkNormalized !== targetNetwork) {
          console.log(`[Unisat] Switching network from ${currentNetwork} to ${unisatNetwork}`);
          await window.unisat!.switchNetwork(unisatNetwork);
        }
      }

      // Request accounts - this will trigger Unisat popup
      const addresses = await window.unisat!.requestAccounts();

      if (!addresses || addresses.length === 0) {
        throw new Error('No accounts available in Unisat wallet');
      }

      // Get public key for the first account
      const publicKey = await window.unisat!.getPublicKey();

      // Verify final network
      const finalNetwork = await window.unisat!.getNetwork();
      this.network = finalNetwork === 'livenet' ? 'mainnet' : 'testnet';

      // Unisat uses Taproot (P2TR) addresses by default
      this.accounts = [{
        address: addresses[0],
        publicKey,
        type: 'p2tr' // Taproot
      }];

      console.log(`[Unisat] Connected to ${this.network} with Taproot address:`, addresses[0]);

      this.connected = true;
      this.connecting = false;

      // Set up account change listener
      this.accountChangeHandler = (accounts: string[]) => {
        if (accounts.length === 0) {
          this.disconnect();
        } else {
          this.accounts = [{
            address: accounts[0],
            publicKey: this.accounts[0]?.publicKey || '',
            type: 'p2tr'
          }];
        }
      };

      window.unisat!.on('accountsChanged', this.accountChangeHandler);
    } catch (error) {
      this.connecting = false;
      this.connected = false;
      throw error;
    }
  }

  async switchNetwork(network: 'mainnet' | 'testnet'): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error('Unisat wallet not available');
    }

    const unisatNetwork = network === 'mainnet' ? 'livenet' : 'testnet';
    await window.unisat!.switchNetwork(unisatNetwork);
    this.network = network;
    console.log(`[Unisat] Switched to ${network}`);
  }

  async disconnect(): Promise<void> {
    if (this.accountChangeHandler) {
      window.unisat?.removeListener('accountsChanged', this.accountChangeHandler);
    }
    this.connected = false;
    this.accounts = [];
  }

  async getAccounts(): Promise<BitcoinWalletAccount[]> {
    if (!this.isAvailable()) {
      throw new Error('Unisat wallet not available');
    }

    const addresses = await window.unisat!.getAccounts();
    const publicKey = await window.unisat!.getPublicKey();

    return addresses.map(address => ({
      address,
      publicKey,
      type: 'native_segwit'
    }));
  }

  async signMessage(message: string): Promise<SignMessageResponse> {
    if (!this.connected || !this.isAvailable()) {
      throw new Error('Wallet not connected');
    }

    // Use BIP-322 for Taproot addresses to get Schnorr signatures
    // Unisat supports 'bip322-simple' for Taproot (P2TR) addresses
    const signature = await window.unisat!.signMessage(message, 'bip322-simple');

    return {
      signature,
      address: this.accounts[0].address
    };
  }

  async sendBitcoin(toAddress: string, amount: number): Promise<SendBitcoinResponse> {
    if (!this.connected || !this.isAvailable()) {
      throw new Error('Wallet not connected');
    }

    const txid = await window.unisat!.sendBitcoin(toAddress, amount);

    return { txid };
  }

  async signPsbt(psbtHex: string): Promise<string> {
    if (!this.connected || !this.isAvailable()) {
      throw new Error('Wallet not connected');
    }

    return await window.unisat!.signPsbt(psbtHex);
  }
}
