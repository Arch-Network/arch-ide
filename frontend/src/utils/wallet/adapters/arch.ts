// Arch Wallet Chrome extension (`window.arch` / `window.bitcoinArch`).
// Injected by arch-wallet-hub/apps/chrome-wallet/entrypoints/injected.ts.
import { BitcoinWalletAdapter, BitcoinWalletAccount, SignMessageResponse, SendBitcoinResponse } from '../../../types/wallet';

export const ARCH_WALLET_INSTALL_URL =
  'https://chromewebstore.google.com/detail/arch-wallet/gkkpjeinjoglmlngnjaehlkkepehjkei';

function getArchProvider() {
  if (typeof window === 'undefined') return undefined;
  const provider = window.arch;
  if (
    provider &&
    provider.isArchWallet === true &&
    typeof provider.connect === 'function'
  ) {
    return provider;
  }
  return undefined;
}

function hexToBytes(hex: string): Uint8Array {
  const cleaned = hex.replace(/^0x/i, '');
  if (cleaned.length % 2 !== 0) {
    throw new Error('Invalid hex string');
  }
  const out = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(cleaned.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

function hexToBase64(hex: string): string {
  return bytesToBase64(hexToBytes(hex));
}

/** True when `message` is a 32-byte hash encoded as 64 hex chars. */
function isMessageHashHex(message: string): boolean {
  return /^(0x)?[0-9a-fA-F]{64}$/.test(message.trim());
}

export class ArchWalletAdapter implements BitcoinWalletAdapter {
  name = 'Arch Wallet';
  icon = '';
  installUrl = ARCH_WALLET_INSTALL_URL;
  connected = false;
  connecting = false;
  accounts: BitcoinWalletAccount[] = [];
  network?: 'mainnet' | 'testnet' | 'regtest';

  isAvailable(): boolean {
    return !!getArchProvider();
  }

  async connect(targetNetwork?: 'mainnet' | 'testnet' | 'regtest'): Promise<void> {
    const provider = getArchProvider();
    if (!provider) {
      throw new Error(
        `Arch Wallet not installed. Please install from ${ARCH_WALLET_INSTALL_URL}`
      );
    }

    try {
      this.connecting = true;
      if (targetNetwork) this.network = targetNetwork;

      const result = await provider.connect();
      if (!result?.address) {
        throw new Error('No account returned from Arch Wallet');
      }

      this.accounts = [{
        address: result.address,
        publicKey: result.publicKey || '',
        type: 'p2tr',
      }];

      this.connected = true;
      this.connecting = false;
      console.log('[Arch Wallet] Connected:', result.address);
    } catch (error) {
      this.connecting = false;
      this.connected = false;
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    const provider = getArchProvider();
    try {
      await provider?.disconnect();
    } catch {
      // Ignore; local state is cleared either way.
    }
    this.connected = false;
    this.accounts = [];
  }

  async getAccounts(): Promise<BitcoinWalletAccount[]> {
    const provider = getArchProvider();
    if (!provider) {
      throw new Error('Arch Wallet not available');
    }

    const account = await provider.getAccount();
    if (!account?.address) return [];
    return [{
      address: account.address,
      publicKey: account.publicKey || '',
      type: 'p2tr',
    }];
  }

  async signMessage(message: string): Promise<SignMessageResponse> {
    const provider = getArchProvider();
    if (!this.connected || !provider) {
      throw new Error('Wallet not connected');
    }

    // Deploy / run / invoke pass a 32-byte Arch message hash as hex.
    // Prefer signArchMessageHash (64-byte r||s hex); consumers expect Unisat-style base64.
    let signatureHex: string;
    if (isMessageHashHex(message) && typeof provider.signArchMessageHash === 'function') {
      const hash = hexToBytes(message.trim());
      const result = await provider.signArchMessageHash(hash);
      signatureHex = result?.signature64Hex;
      if (!signatureHex) {
        throw new Error('Arch Wallet did not return a signature');
      }
    } else if (typeof provider.signMessage === 'function') {
      const msgBytes = new TextEncoder().encode(message);
      const result = await provider.signMessage(msgBytes);
      signatureHex = result?.signature;
      if (!signatureHex) {
        throw new Error('Arch Wallet did not return a signature');
      }
    } else {
      throw new Error(
        'This Arch Wallet build cannot sign Arch transactions. Please update the extension.'
      );
    }

    return {
      signature: hexToBase64(signatureHex),
      address: this.accounts[0]?.address || '',
    };
  }

  async sendBitcoin(_toAddress: string, _amount: number): Promise<SendBitcoinResponse> {
    throw new Error(
      'Arch Wallet does not expose Bitcoin L1 send from the dApp provider. Send BTC from the wallet UI.'
    );
  }

  async signPsbt(psbtHex: string): Promise<string> {
    if (!this.connected || !this.isAvailable()) {
      throw new Error('Wallet not connected');
    }
    const bitcoin = window.bitcoinArch;
    if (!bitcoin || typeof bitcoin.signPsbt !== 'function') {
      throw new Error('Arch Wallet PSBT signing is not available');
    }
    const result = await bitcoin.signPsbt({ psbt: psbtHex });
    if (typeof result === 'string') return result;
    if (result?.psbt) return result.psbt;
    throw new Error('Arch Wallet did not return a signed PSBT');
  }
}
