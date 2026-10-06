export interface Config {
    network: 'mainnet' | 'devnet' | 'testnet';
    rpcUrl: string;
    regtestConfig: {
        url: string;
        username: string;
        password: string;
    };
}

// Default config that can be imported and used
export const DEFAULT_CONFIG: Config = {
    network: 'testnet',
    rpcUrl: 'https://rpc.testnet.arch.network',
    regtestConfig: {
        url: 'http://bitcoin-node.dev.aws.archnetwork.xyz:18443',
        username: 'bitcoin',
        password: '428bae8f3c94f8c39c50757fc89c39bc7e6ebc70ebf8f618'
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
