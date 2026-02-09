// src/utils/smartRpcConnection.ts
import { RpcConnection } from '@saturnbtcio/arch-sdk';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8080';

// Get URLs from environment or config
export function getSmartRpcUrl(rpcUrl: string): string {
  if (!rpcUrl) {
    console.error('No RPC URL provided');
    return '';
  }

  // Check if this is a localhost URL (from config)
  const isLocalhostUrl = rpcUrl.includes('localhost') || rpcUrl.includes('127.0.0.1');

  // Check if we're running in localhost dev environment
  const isRunningOnLocalhost = typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  console.log('Smart RPC URL detection:', {
    rpcUrl,
    isLocalhostUrl,
    isRunningOnLocalhost,
    hostname: typeof window !== 'undefined' ? window.location.hostname : 'unknown'
  });

  // If the RPC URL is localhost, use it directly (user's local devnet)
  if (isLocalhostUrl) {
    // Warn about mixed content if on production HTTPS
    if (!isRunningOnLocalhost && typeof window !== 'undefined' && window.location.protocol === 'https:') {
      console.warn(
        '⚠️ Connecting to localhost RPC from HTTPS site.\n' +
        'This may be blocked by your browser (mixed content policy).\n' +
        'If connection fails, either:\n' +
        '1. Run your local devnet with HTTPS, OR\n' +
        '2. Use a public RPC URL (e.g., https://rpc.testnet.arch.network), OR\n' +
        '3. Run the IDE locally (http://localhost:5173)'
      );
    }
    console.log('Using local devnet RPC directly:', rpcUrl);
    return rpcUrl;
  }

  // For external RPC endpoints (https://rpc.testnet.arch.network, etc):
  // - On localhost dev: Use Vite's /rpc proxy (it handles CORS and forwards to RPC server)
  // - On production: Use RPC directly (CORS is configured on the RPC server)
  if (isRunningOnLocalhost) {
    console.log('Using Vite dev proxy: /rpc');
    return '/rpc';
  } else {
    console.log(`Using RPC directly in production: ${rpcUrl}`);
    return rpcUrl;  // Hit RPC directly, no proxy needed!
  }
}

export function createSmartRpcConnection(baseUrl: string): RpcConnection {
  const smartUrl = getSmartRpcUrl(baseUrl);
  return new RpcConnection(smartUrl);
}