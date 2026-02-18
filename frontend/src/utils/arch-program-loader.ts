import { Buffer } from 'buffer/';

// Polyfill Buffer for the browser environment
if (typeof window !== 'undefined') {
  window.Buffer = window.Buffer || Buffer;
}

import { RpcConnection, Message, Instruction, RuntimeTransaction } from '@arch-network/arch-sdk';
import { MessageUtil } from '@arch-network/arch-sdk';
import { signMessage } from './bitcoin-signer';
import { bitcoinRpcRequest } from '../api/bitcoin/rpc';
import { getSmartRpcUrl } from '../utils/smartRpcConnection';

const signMessageBIP322 = async (privateKey: Buffer, messageHash: Buffer): Promise<Buffer> => {
  const signature = await signMessage(privateKey as any, messageHash as any);
  return Buffer.from(signature as Uint8Array);
};

declare global {
  interface Window {
    unisat?: {
      requestAccounts: () => Promise<string[]>;
      getAccounts: () => Promise<string[]>;
      getPublicKey: () => Promise<string>;
      signMessage: (message: string, type: string) => Promise<string>;
      sendBitcoin: (address: string, amount: number) => Promise<string>;
    };
    xverse?: {
      bitcoin: {
        connect: () => Promise<string[]>;
        signMessage: (message: string) => Promise<{ pubkey: string; signature: string }>;
        sendBtc: (params: { addressTo: string; amount: number }) => Promise<string>;
      };
      getAddress: () => Promise<{
        addresses: Array<{
          address: string;
          publicKey: string;
          purpose: string;
        }>;
      }>;
      signMessage: (params: {
        message: string;
        address: string;
        protocol?: string;
      }) => Promise<{ signature: string }>;
    };
    leather?: {
      enable: () => Promise<void>;
      request: (params: {
        method: string;
        params: any;
      }) => Promise<any>;
    };
  }
}



/** Canonical System Program in arch-network: 00...00 (base58 "111...111"). Use for all System Program invocations. */
const ZERO_PUBKEY_HEX = '0000000000000000000000000000000000000000000000000000000000000000';

/** BPF Loader program ID (32 bytes, ASCII "BpfLoader11111111111111111111111") for Write/Deploy/Truncate. */
const BPF_LOADER_ID = Buffer.from('BpfLoader11111111111111111111111', 'ascii');

const RUNTIME_TX_SIZE_LIMIT = 10240; // Example limit from your network code

function calculateMaxChunkSize(): number {
  // Simulate the transaction size
  const message = {
    signers: [Buffer.from(ZERO_PUBKEY_HEX, 'hex')],
    instructions: [{
      program_id: Buffer.from(ZERO_PUBKEY_HEX, 'hex'),
      accounts: [],
      data: Buffer.alloc(8) // Simulate 8-byte data
    }]
  };

  const simulatedTransaction = {
    version: 0,
    signatures: [Buffer.alloc(64)], // Simulate a 64-byte signature
    message
  };

  // Calculate the serialized length
  const serializedLength = JSON.stringify(simulatedTransaction).length;

  // Calculate the maximum chunk size
  return RUNTIME_TX_SIZE_LIMIT - serializedLength;
}

const CHUNK_SIZE = calculateMaxChunkSize();

interface ArchDeployOptions {
  rpcUrl: string;
  network: string;
  programBinary: Buffer;
  keypair: {
    privkey: string;
    pubkey: string;
    address: string;
  };
  regtestConfig?: {
    url: string;
    username: string;
    password: string;
  };
  utxoInfo?: {
    txid: string;
    vout: number;
  };
}

// Using the new wallet manager - old wallet classes removed
import { walletManager } from './wallet/walletManager';

export class ArchProgramLoader {
  static async load(options: ArchDeployOptions, onMessage?: (type: 'info' | 'success' | 'error', message: string) => void) {
    console.log('options', options);

    // Use the smart RPC connection utility
    const smartRpcUrl = getSmartRpcUrl(options.rpcUrl);

    let createAccountTxid = '';
    const programAccount = await this.getProgramAccount(options.keypair.pubkey, smartRpcUrl);

    console.log('programAccount', programAccount);

    if (programAccount) {
      onMessage?.('info', `Program ${options.keypair.pubkey} already exists, proceeding with re-deploy`);
    }

    if (!programAccount) {
      // Create program account only if it doesn't exist
      const createAccountInstruction = await this.createProgramAccountInstruction(
        options.keypair.pubkey,
        options.network,
        smartRpcUrl,
        options.regtestConfig,
        options.utxoInfo
      );

      console.log('createAccountInstruction', createAccountInstruction);
      createAccountTxid = await this.sendInstruction(
        smartRpcUrl,
        createAccountInstruction,
        options.keypair,
        options.network
      );
    }

    // Split binary into chunks and upload
    const chunks = this.splitBinaryIntoChunks(options.programBinary);
    const uploadTxids: string[] = [];

    const uploadInstructions = chunks.map((chunk, i) =>
      this.createUploadInstruction(options.keypair.pubkey, chunk, i * CHUNK_SIZE)
    );

    console.log('uploadInstructions', uploadInstructions);

    const txids = await this.sendBatchInstructions(
      smartRpcUrl,
      uploadInstructions,
      options.keypair,
      options.network
    );

    uploadTxids.push(...txids);

    // Make program executable
    const executableInstruction = this.createExecutableInstruction(
      options.keypair.pubkey
    );

    const executableTxid = await this.sendInstruction(
      smartRpcUrl,
      executableInstruction,
      options.keypair,
      options.network
    );

    const allTxids = createAccountTxid ? [createAccountTxid, ...uploadTxids, executableTxid] : [...uploadTxids, executableTxid];

    return {
      programId: options.keypair.pubkey,
      txids: allTxids
    };
  }

  private static async createProgramAccountInstruction(
    programId: string,
    network: string,
    rpcUrl: string,
    regtestConfig?: { url: string; username: string; password: string },
    utxoInfo?: { txid: string; vout: number }
  ): Promise<Instruction> {
    const address = await this.getAccountAddress(programId, rpcUrl);

    // Use provided UTXO info if available, otherwise create a new one
    const { txid, vout } = utxoInfo || await this.sendUtxo(address, network, regtestConfig);

    // Create instruction with UTXO info
    const data = Buffer.alloc(37); // 1 byte for variant + 32 bytes txid + 4 bytes vout
    data[0] = 0; // CreateAccount variant

    // Convert txid hex string to bytes and copy to buffer
    Buffer.from(txid, 'hex').copy(data, 1);

    // Write vout as little-endian uint32
    data.writeUInt32LE(vout, 33);

    return {
      program_id: Buffer.from(ZERO_PUBKEY_HEX, 'hex'),
      accounts: [
        {
          pubkey: Buffer.from(programId, 'hex'),
          is_signer: true,
          is_writable: true
        }
      ],
      data: Buffer.from(data)
    };
  }

  private static async getAccountAddress(pubkey: string, rpcUrl: string): Promise<string> {
    console.log('Getting account address for:', {
      pubkey,
      rpcUrl
    });

    try {
      // Log RPC connection attempt
      console.log('Creating RPC connection to:', rpcUrl);
      const connection = new RpcConnection(rpcUrl);

      // Log pubkey buffer creation
      console.log('Creating pubkey buffer from hex:', pubkey);
      const pubkeyBuffer = Buffer.from(pubkey, 'hex');
      console.log('Pubkey buffer created:', {
        originalPubkey: pubkey,
        bufferLength: pubkeyBuffer.length,
        bufferHex: pubkeyBuffer.toString('hex')
      });

      // Log address request
      console.log('Requesting account address from RPC...');
      const address = await connection.getAccountAddress(pubkeyBuffer);
      console.log('Received account address:', address);

      return address;
    } catch (error) {
      // Enhanced error logging
      console.error('Error in getAccountAddress:', {
        error,
        pubkey,
        rpcUrl,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  private static async sendUtxo(
    address: string,
    network: string,
    regtestConfig?: { url: string; username: string; password: string }
  ): Promise<{txid: string, vout: number}> {
    if (!address) {
      throw new Error('Bitcoin address is required');
    }

    switch (network) {
      case 'testnet':
      case 'mainnet': {
        // Use the new wallet manager
        if (walletManager.availableWallets.length === 0) {
          throw new Error(
            'No compatible Bitcoin wallet detected. Please install one of the following:\n' +
            '- Unisat Wallet (https://unisat.io)\n' +
            '- Xverse Wallet (https://www.xverse.app)'
          );
        }

        try {
          // Connect wallet if not already connected
          if (!walletManager.isConnected) {
            const firstWallet = walletManager.availableWallets[0];
            await walletManager.connect(firstWallet.name, network === 'mainnet' ? 'mainnet' : 'testnet');
          }

          // Send Bitcoin using the wallet manager
          const result = await walletManager.sendBitcoin(address, 5000);

          return await this.waitForUtxo(address, network);
        } catch (error: any) {
          throw new Error(`Failed to send payment: ${error.message}`);
        }
      }

      case 'devnet': {
        if (!regtestConfig) {
          throw new Error('Regtest configuration required for devnet');
        }

        const isLocalhost = typeof window !== 'undefined' && window.location.hostname === 'localhost';
        regtestConfig.url = isLocalhost ? 'http://localhost:8010/proxy' : regtestConfig.url;

        // Use the bitcoinRpcRequest helper for all RPC calls
        const sendResponse = await bitcoinRpcRequest(
          regtestConfig,
          'sendtoaddress',
          [address, 0.00005],
          'testwallet'
        );
        const txid = sendResponse.result;

        const txResponse = await bitcoinRpcRequest(
          regtestConfig,
          'getrawtransaction',
          [txid, true]
        );

        const tx = txResponse.result;
        const vout = tx.vout.findIndex((output: any) => output.scriptPubKey.address === address);

        return { txid, vout };
      }

      default:
        throw new Error(`Unsupported network: ${network}`);
    }
  }

  private static async waitForUtxo(address: string, network: string): Promise<{txid: string, vout: number}> {
    const POLLING_INTERVAL = 5000; // 5 seconds
    const TIMEOUT = 300000; // 5 minutes
    const startTime = Date.now();

    while (Date.now() - startTime < TIMEOUT) {
      const endpoint = network === 'testnet'
        ? `https://mempool.space/testnet4/api/address/${address}/utxo`
        : `https://mempool.space/api/address/${address}/utxo`;

      const response = await fetch(endpoint);
      const utxos = await response.json();

      if (utxos.length > 0) {
        return {
          txid: utxos[0].txid,
          vout: utxos[0].vout
        };
      }

      await new Promise(resolve => setTimeout(resolve, POLLING_INTERVAL));
    }

    throw new Error('Timeout waiting for UTXO');
  }

  private static createUploadInstruction(
    programId: string,
    chunk: Buffer,
    offset: number
  ): Instruction {
    // 1 byte for variant + 4 bytes for offset + 4 bytes for length + chunk data
    const data = Buffer.alloc(1 + 8 + chunk.length);

    data[0] = 1; // ExtendBytes variant
    data.writeUInt32LE(offset, 1); // Write offset after variant byte
    data.writeUInt32LE(chunk.length, 5); // Write length after offset
    chunk.copy(data, 9); // Copy chunk data after length

    return {
      program_id: BPF_LOADER_ID,
      accounts: [
        {
          pubkey: Buffer.from(programId, 'hex'),
          is_signer: true,
          is_writable: true
        }
      ],
      data
    };
  }

  private static createExecutableInstruction(programId: string): Instruction {
    const data = Buffer.alloc(1);
    data[0] = 2; // MakeExecutable variant

    return {
      program_id: BPF_LOADER_ID,
      accounts: [
        {
          pubkey: Buffer.from(programId, 'hex'),
          is_signer: true,
          is_writable: true
        }
      ],
      data
    };
  }

  private static splitBinaryIntoChunks(binary: Buffer): Buffer[] {
    const chunks: Buffer[] = [];
    for (let i = 0; i < binary.length; i += CHUNK_SIZE) {
      chunks.push(binary.slice(i, Math.min(i + CHUNK_SIZE, binary.length)));
    }
    return chunks;
  }

  private static async sendInstruction(
    rpcUrl: string,
    instruction: Instruction,
    keypair: { privkey: string; pubkey: string },
    network: string
  ): Promise<string> {
    const message: Message = {
      signers: [Buffer.from(keypair.pubkey, 'hex')],
      instructions: [instruction]
    };

    const messageHash = MessageUtil.hash(message);
    const privateKeyBuffer = Buffer.from(keypair.privkey, 'hex');

    // Convert network string to BIP322 network type
    const bitcoinNetwork = network === 'mainnet' ? 'mainnet' :
                          network === 'devnet' ? 'regtest' : 'testnet';

    const signature = await signMessageBIP322(privateKeyBuffer, Buffer.from(messageHash));

    const transaction: RuntimeTransaction = {
      version: 0,
      signatures: [signature],
      message
    };

    const connection = new RpcConnection(rpcUrl);
    return await connection.sendTransaction(transaction);
  }

  private static async sendBatchInstructions(
    rpcUrl: string,
    instructions: Instruction[],
    keypair: { privkey: string; pubkey: string },
    network: string
  ): Promise<string[]> {
    const messages = instructions.map(instruction => ({
      signers: [Buffer.from(keypair.pubkey, 'hex')],
      instructions: [instruction]
    }));

    const messageHashes = messages.map(MessageUtil.hash);
    const privateKeyBuffer = Buffer.from(keypair.privkey, 'hex');

    const signatures = await Promise.all(
      messageHashes.map(hash => signMessageBIP322(privateKeyBuffer, Buffer.from(hash)))
    );

    const transactions = messages.map((message, index) => ({
      version: 0,
      signatures: [signatures[index]],
      message
    }));

    // Check if localhost and if the network is testnet, use the proxy
    if (window.location.hostname === 'localhost' && network === 'testnet') {
      rpcUrl = 'http://localhost:3000/rpc';
    }

    const connection = new RpcConnection(rpcUrl);
    return await connection.sendTransactions(transactions);
  }

  private static async getProgramAccount(pubkey: string, rpcUrl: string): Promise<any> {
    console.log('Checking if program account exists for:', {
      pubkey,
      rpcUrl
    });

    try {
      const connection = new RpcConnection(rpcUrl);
      const pubkeyBuffer = Buffer.from(pubkey, 'hex');
      const accountInfo = await connection.readAccountInfo(pubkeyBuffer);

      console.log('Account info:', accountInfo);
      return accountInfo;
    } catch (error) {
      console.error('Error in getProgramAccount:', {
        error,
        pubkey,
        rpcUrl,
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
        errorStack: error instanceof Error ? error.stack : undefined
      });
      return null;
    }
  }
}