declare module "@arch-network/arch-sdk" {
    export type Pubkey = Uint8Array;
    export const PubkeySchema: Schema;

    export type UtxoMeta = Uint8Array;
    export interface UtxoMetaData {
        txid: string;
        vout: number;
    }
    export const UtxoMetaSchema: Schema;

    export interface AccountInfo {
        key: Pubkey;
        utxo: UtxoMeta;
        data: Uint8Array;
        owner: Pubkey;
        is_signer: boolean;
        is_writable: boolean;
        tag: string;
    }

    export interface AccountMeta {
        pubkey: Pubkey;
        is_signer: boolean;
        is_writable: boolean;
    }

    export interface AccountInfoResult {
        lamports: number;
        owner: Pubkey;
        data: Uint8Array;
        utxo: string;
        is_executable: boolean;
    }

    export interface CreatedAccount {
        privkey: string;
        pubkey: string;
        address: string;
    }

    export interface Block {
        transactions: Array<string>;
        previous_block_hash: string;
        timestamp: number;
        block_height: number;
        bitcoin_block_height: string;
        transactions_count: number;
        merkle_root: string;
    }

    export interface Instruction {
        program_id: Pubkey;
        accounts: Array<AccountMeta>;
        data: Uint8Array;
    }
    export const InstructionSchema: Schema;

    export interface Message {
        signers: Array<Pubkey>;
        instructions: Array<Instruction>;
    }
    export const MessageSchema: Schema;

    export type Signature = Uint8Array;
    export interface RuntimeTransaction {
        version: number;
        signatures: Array<Signature>;
        message: Message;
    }

    export type ProcessedTransactionStatus =
        | { type: 'processing' }
        | { type: 'processed' }
        | { type: 'failed'; message: string };

    export type RollbackStatus =
        | { type: 'notRolledback' }
        | { type: 'rolledback'; message: string };

    export interface ProcessedTransaction {
        runtime_transaction: RuntimeTransaction;
        status: ProcessedTransactionStatus;
        bitcoin_txid: Uint8Array | null;
        logs: Array<string>;
        rollback_status: RollbackStatus;
    }

    export interface AccountFilter {
        memcmp?: {
            offset: number;
            bytes: string;
        };
        dataSize?: number;
    }

    export interface ProgramAccount {
        pubkey: Pubkey;
        account: AccountInfoResult;
    }

    export enum BlockTransactionFilter {
        FULL = "full",
        SIGNATURES = "signatures"
    }

    export interface BlockTransactionsParams {
        block_hash: string;
        limit?: number;
        offset?: number;
        account?: Pubkey;
    }

    export interface TransactionsByIdsParams {
        txids: string[];
    }

    export interface TransactionListParams {
        limit?: number;
        offset?: number;
        account?: Pubkey;
    }

    export interface Provider {
        sendTransaction(transaction: RuntimeTransaction): Promise<string>;
        sendTransactions(transactions: RuntimeTransaction[]): Promise<string[]>;
        readAccountInfo(pubkey: Pubkey): Promise<AccountInfoResult>;
        getAccountAddress(pubkey: Pubkey): Promise<string>;
        getBestBlockHash(): Promise<string>;
        getBlock(blockHash: string): Promise<Block | undefined>;
        getBlockCount(): Promise<number>;
        getBlockHash(blockHeight: number): Promise<string>;
        getProgramAccounts(programId: Pubkey, filters?: AccountFilter[]): Promise<ProgramAccount[]>;
        getProcessedTransaction(txid: string): Promise<ProcessedTransaction | undefined>;
        requestAirdrop(pubkey: Pubkey): Promise<void>;
        createAccountWithFaucet(pubkey: Pubkey): Promise<RuntimeTransaction>;
        getBlockByHeight(blockHeight: number, filter?: BlockTransactionFilter): Promise<Block | undefined>;
        getTransactionsByBlock(params: BlockTransactionsParams): Promise<ProcessedTransaction[]>;
        getTransactionsByIds(params: TransactionsByIdsParams): Promise<(ProcessedTransaction | null)[]>;
        recentTransactions(params: TransactionListParams): Promise<ProcessedTransaction[]>;
        getMultipleAccounts(pubkeys: Pubkey[]): Promise<(AccountInfoResult | null)[]>;
    }

    export class RpcConnection implements Provider {
        constructor(endpoint: string);
        sendTransaction(transaction: RuntimeTransaction): Promise<string>;
        sendTransactions(transactions: RuntimeTransaction[]): Promise<string[]>;
        readAccountInfo(pubkey: Pubkey): Promise<AccountInfoResult>;
        getAccountAddress(pubkey: Pubkey): Promise<string>;
        getBestBlockHash(): Promise<string>;
        getBlock(blockHash: string): Promise<Block | undefined>;
        getBlockCount(): Promise<number>;
        getBlockHash(blockHeight: number): Promise<string>;
        getProcessedTransaction(txid: string): Promise<ProcessedTransaction | undefined>;
        getProgramAccounts(programId: Pubkey, filters?: AccountFilter[]): Promise<ProgramAccount[]>;
        requestAirdrop(pubkey: Pubkey): Promise<void>;
        createAccountWithFaucet(pubkey: Pubkey): Promise<RuntimeTransaction>;
        getBlockByHeight(blockHeight: number, filter?: BlockTransactionFilter): Promise<Block | undefined>;
        getTransactionsByBlock(params: BlockTransactionsParams): Promise<ProcessedTransaction[]>;
        getTransactionsByIds(params: TransactionsByIdsParams): Promise<(ProcessedTransaction | null)[]>;
        recentTransactions(params: TransactionListParams): Promise<ProcessedTransaction[]>;
        getMultipleAccounts(pubkeys: Pubkey[]): Promise<(AccountInfoResult | null)[]>;
    }

    export class PubkeyUtil {
        static fromHex(hex: string): Uint8Array;
        static toHex(pubkey: Uint8Array): string;
        static systemProgram(): Pubkey;
        static isSystemProgram(pubkey: Pubkey): boolean;
    }

    export class MessageUtil {
        static hash(message: Message): Uint8Array;
        static serialize(message: Message): Uint8Array;
        static toHex(message: Message): {
            signers: string[];
            instructions: {
                program_id: string;
                accounts: {
                    pubkey: string;
                    is_signer: boolean;
                    is_writable: boolean;
                }[];
                data: string;
            }[];
        };
        static toNumberArray(message: Message): {
            signers: number[][];
            instructions: {
                program_id: number[];
                accounts: {
                    pubkey: number[];
                    is_signer: boolean;
                    is_writable: boolean;
                }[];
                data: number[];
            }[];
        };
    }

    export class UtxoMetaUtil {
        static fromBytes(txid: Uint8Array, vout: number): UtxoMeta;
        static fromHex(txid: string, vout: number): UtxoMeta;
        static toString(utxo: UtxoMeta): UtxoMetaData;
    }

    export class SignatureUtil {
        static adjustSignature(signature: Uint8Array): Uint8Array;
    }

    export interface Arch extends Provider {
        createNewAccount(): Promise<CreatedAccount>;
    }

    export const ArchConnection: <T extends Provider>(provider: T) => Arch & T;
}

declare global {
    const RpcConnection: typeof import("@arch-network/arch-sdk").RpcConnection;
    const ArchConnection: typeof import("@arch-network/arch-sdk").ArchConnection;
    const PubkeyUtil: typeof import("@arch-network/arch-sdk").PubkeyUtil;
    const MessageUtil: typeof import("@arch-network/arch-sdk").MessageUtil;
    const UtxoMetaUtil: typeof import("@arch-network/arch-sdk").UtxoMetaUtil;
    const SignatureUtil: typeof import("@arch-network/arch-sdk").SignatureUtil;

    /**
     * Decode a base58 string to a Uint8Array (Pubkey)
     * @param str - Base58 encoded string
     * @returns Uint8Array representing the decoded bytes
     */
    function fromBase58(str: string): Uint8Array;

    /**
     * Encode a Uint8Array (Pubkey) to a base58 string
     * @param bytes - Uint8Array to encode
     * @returns Base58 encoded string
     */
    function toBase58(bytes: Uint8Array): string;
}

export {};