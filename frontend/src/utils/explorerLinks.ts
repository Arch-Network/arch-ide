/**
 * Generate explorer URLs for Arch Network
 */

type Network = 'testnet' | 'mainnet' | 'devnet';

interface ExplorerUrls {
  base: string;
  tx: (txid: string) => string;
  account: (address: string) => string;
  program: (programId: string) => string;
}

/**
 * Get the explorer base URL for a given network
 */
export function getExplorerUrls(network: Network): ExplorerUrls | null {
  switch (network) {
    case 'testnet':
      return {
        base: 'https://explorer.arch.network/testnet',
        tx: (txid: string) => `https://explorer.arch.network/testnet/tx/${txid}`,
        account: (address: string) => `https://explorer.arch.network/testnet/accounts/${address}`,
        program: (programId: string) => `https://explorer.arch.network/testnet/programs/${programId}`,
      };
    case 'mainnet':
      return {
        base: 'https://explorer.arch.network',
        tx: (txid: string) => `https://explorer.arch.network/tx/${txid}`,
        account: (address: string) => `https://explorer.arch.network/accounts/${address}`,
        program: (programId: string) => `https://explorer.arch.network/programs/${programId}`,
      };
    case 'devnet':
      return null;
    default:
      return null;
  }
}

/**
 * Format a message with an explorer link
 * Returns the message and optional link
 */
export function formatWithExplorerLink(
  message: string,
  identifier: string,
  type: 'tx' | 'account' | 'program',
  network: Network
): { message: string; link?: string } {
  const explorerUrls = getExplorerUrls(network);

  if (!explorerUrls) {
    return { message };
  }

  const link = explorerUrls[type](identifier);

  return {
    message,
    link
  };
}
