export interface Config {
    network: 'mainnet' | 'devnet' | 'testnet';
    rpcUrl: string;
    regtestConfig: {
        url: string;
        username: string;
        password: string;
    };
}

// Default config that can be imported and used.
// NOTE: Regtest endpoint and credentials are no longer hardcoded in source.
// They are injected at build time via Vite env variables
// (VITE_REGTEST_RPC_URL / VITE_REGTEST_RPC_USERNAME / VITE_REGTEST_RPC_PASSWORD)
// so no secret is committed to the repository or shipped in the public bundle.
export const DEFAULT_CONFIG: Config = {
    network: 'testnet',
    rpcUrl: 'https://rpc.testnet.arch.network',
    regtestConfig: {
        url: import.meta.env.VITE_REGTEST_RPC_URL ?? '',
        username: import.meta.env.VITE_REGTEST_RPC_USERNAME ?? '',
        password: import.meta.env.VITE_REGTEST_RPC_PASSWORD ?? ''
    }
};

export const NETWORK_RPC_URLS: Record<Config['network'], string> = {
    mainnet: 'https://rpc.mainnet.arch.network',
    testnet: 'https://rpc.testnet.arch.network',
    devnet: 'http://localhost:9002',
};

/** The network a known RPC endpoint serves, or null for a custom endpoint. */
export const networkForRpcUrl = (rpcUrl: string): Config['network'] | null => {
    const normalized = rpcUrl.trim().replace(/\/+$/, '').toLowerCase();
    const networks = Object.keys(NETWORK_RPC_URLS) as Config['network'][];
    return networks.find((network) => NETWORK_RPC_URLS[network] === normalized) ?? null;
};

/** Every call goes to the endpoint, so for a known endpoint its network is the one shown. */
export const withRpcNetwork = (config: Config): Config => ({
    ...config,
    network: networkForRpcUrl(config.rpcUrl) ?? config.network,
});
