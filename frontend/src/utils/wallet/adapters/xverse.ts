// Xverse Wallet Adapter
import { AddressPurpose } from '@sats-connect/core';
import { BitcoinWalletAdapter, BitcoinWalletAccount, SignMessageResponse, SendBitcoinResponse } from '../../../types/wallet';

export class XverseWalletAdapter implements BitcoinWalletAdapter {
  name = 'Xverse';
  icon = 'https://xverse.app/logo.svg';
  connected = false;
  connecting = false;
  accounts: BitcoinWalletAccount[] = [];
  network?: 'mainnet' | 'testnet' | 'regtest';

  isAvailable(): boolean {
    const provider = typeof window !== 'undefined' ? window.XverseProviders?.BitcoinProvider : undefined;
    // Require the core request method to avoid false positives.
    return !!provider && typeof (provider as any).request === 'function';
  }

  async connect(targetNetwork?: 'mainnet' | 'testnet' | 'regtest'): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error('Xverse wallet not installed. Please install from https://www.xverse.app');
    }

    try {
      this.connecting = true;

      // Note: Xverse supports multiple networks; for now we only tag our internal state.
      if (targetNetwork === 'testnet') this.network = 'testnet';
      else if (targetNetwork === 'mainnet') this.network = 'mainnet';

      console.log(`[Xverse] Requesting accounts (Taproot/Ordinals)...`);

      // Prefer calling the injected BitcoinProvider directly to avoid sats-connect UI/provider selection
      // and to be more resilient to StacksProvider injection conflicts.
      const provider = window.XverseProviders!.BitcoinProvider as any;
      const resp = await provider.request('getAccounts', {
        purposes: [AddressPurpose.Ordinals],
        message: 'Connect to Arch IDE',
      });

      // Provider implementations vary: some return { status, result }, some return result directly.
      const accountsRaw =
        resp?.status === 'success' ? resp.result :
        resp?.result ? resp.result :
        Array.isArray(resp) ? resp :
        null;

      if (!Array.isArray(accountsRaw) || accountsRaw.length === 0) {
        throw new Error('No accounts received from Xverse wallet');
      }

      const ordinals = accountsRaw.find((a: any) => a.purpose === AddressPurpose.Ordinals) || accountsRaw[0];
      if (!ordinals?.address || !ordinals?.publicKey) {
        throw new Error('Xverse returned an invalid account payload');
      }

      this.accounts = [{
        address: ordinals.address,
        publicKey: ordinals.publicKey,
        type: 'p2tr',
      }];

      console.log(`[Xverse] Successfully connected:`, {
        address: this.accounts[0].address,
        type: this.accounts[0].type,
        network: this.network
      });

      this.connected = true;
      this.connecting = false;
    } catch (error: any) {
      this.connecting = false;
      this.connected = false;
      console.error('[Xverse] Connection error:', error);

      // Provide user-friendly error messages
      if (error.message?.includes('User rejected')) {
        throw new Error('Connection rejected. Please approve the connection in your Xverse wallet.');
      }

      // Common Xverse failure when another Stacks wallet has set a non-configurable StacksProvider
      if (
        String(error?.message || error).includes('StacksProvider') ||
        String(error?.message || error).includes('Cannot redefine property') ||
        String(error?.message || error).includes('immutable')
      ) {
        throw new Error(
          'Xverse failed to initialize due to a Stacks provider conflict. ' +
          'Please disable other Stacks wallets/extensions (e.g. Leather/Hiro) and reload the page, then try again.'
        );
      }

      throw error;
    }
  }

  async switchNetwork(network: 'mainnet' | 'testnet'): Promise<void> {
    // Xverse doesn't have a direct switchNetwork method
    // User needs to disconnect and reconnect with the new network
    throw new Error('Please disconnect and reconnect to switch networks in Xverse');
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.accounts = [];
  }

  async getAccounts(): Promise<BitcoinWalletAccount[]> {
    if (!this.connected) {
      throw new Error('Xverse wallet not connected');
    }

    // Return already connected accounts
    return this.accounts;
  }

  async signMessage(message: string): Promise<SignMessageResponse> {
    if (!this.connected || !this.isAvailable()) {
      throw new Error('Wallet not connected');
    }

    try {
      const provider = window.XverseProviders!.BitcoinProvider as any;
      const response = await provider.request('signMessage', {
        address: this.accounts[0].address,
        message,
        protocol: 'BIP322',
      });

      if (response?.status === 'error') throw new Error(response.error?.message || 'Failed to sign message');
      const signature = response?.status === 'success' ? response.result?.signature : (response?.result?.signature || response?.signature);
      if (!signature) throw new Error('Xverse did not return a signature');
      return {
        signature,
        address: this.accounts[0].address
      };
    } catch (error: any) {
      throw new Error(`Failed to sign message: ${error.message}`);
    }
  }

  async sendBitcoin(toAddress: string, amount: number): Promise<SendBitcoinResponse> {
    if (!this.connected || !this.isAvailable()) {
      throw new Error('Wallet not connected');
    }

    try {
      const response = await request('sendTransfer', {
        recipients: [
          {
            address: toAddress,
            amount: amount
          }
        ]
      });

      if (response.status === 'error') {
        throw new Error(response.error?.message || 'Failed to send Bitcoin');
      }

      return { txid: response.result.txid };
    } catch (error: any) {
      throw new Error(`Failed to send Bitcoin: ${error.message}`);
    }
  }

  async signPsbt(psbtHex: string): Promise<string> {
    if (!this.connected || !this.isAvailable()) {
      throw new Error('Wallet not connected');
    }

    try {
      const response = await request('signPsbt', {
        psbt: psbtHex,
        signInputs: {},
        broadcast: false
      });

      if (response.status === 'error') {
        throw new Error(response.error?.message || 'Failed to sign PSBT');
      }

      return response.result.psbt;
    } catch (error: any) {
      throw new Error(`Failed to sign PSBT: ${error.message}`);
    }
  }
}
