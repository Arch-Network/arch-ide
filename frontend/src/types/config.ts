export interface Config {
    network: 'mainnet' | 'devnet' | 'testnet';
    rpcUrl: string;
    showTransactionDetails: boolean;
    improveErrors: boolean;
    automaticAirdrop: boolean;
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
    showTransactionDetails: false,
    improveErrors: true,
    automaticAirdrop: true,
    regtestConfig: {
        url: 'http://bitcoin-node.dev.aws.archnetwork.xyz:18443',
        username: 'bitcoin',
        password: '428bae8f3c94f8c39c50757fc89c39bc7e6ebc70ebf8f618'
    }
};