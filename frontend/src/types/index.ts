import { Config } from './config';
export type { Config };

// Bring `ArchIdl` into local scope so the `Project` interface below can
// reference it. The full set of IDL types is re-exported at the bottom
// of this file so consumers continue to import everything from `'@/types'`.
import type { ArchIdl } from './idl';

export interface FileNode {
  name: string;
  path?: string;
  type: 'file' | 'directory';
  content?: string;
  children?: FileNode[];
}

export interface ProjectAccount {
  privkey: string;
  pubkey: string;
  address: string;
}

export interface HistoricalAuthorityAccount {
  account: ProjectAccount;
  savedAt: Date;
  reason: 'regenerated' | 'project_deleted' | 'manual';
  note?: string; // Optional user note
}

/**
 * Per-project address book entry. Used by the Invoke form's account
 * picker so users can re-use named pubkeys without typing them again.
 *
 * We deliberately scope this to a project (rather than globally) because
 * address bindings are usually program-specific — `escrow_authority` for
 * Project A means something different in Project B.
 */
export interface AddressBookEntry {
  id: string;
  label: string;
  /** Canonical base58 form. The picker accepts hex too, but stores base58. */
  address: string;
  addedAt: Date;
}

/**
 * Per-project disposable keypair generated for testing flows. These are
 * stored in plaintext and explicitly labelled as such in the UI — they
 * exist so devs can sign one-off transactions from the IDE without
 * configuring a wallet. Production keys belong in an actual wallet.
 */
export interface SavedKeypair {
  id: string;
  label: string;
  account: ProjectAccount;
  createdAt: Date;
}

/**
 * Snapshot of a single instruction submission attempt.
 *
 * We store the *form payload* (account values, raw arg-value tree)
 * rather than just the resolved tx because the snapshot's primary job
 * is to power "Re-run" — clicking it should rehydrate the Invoke form
 * exactly as it was when the user first submitted, even if the IDL has
 * since been re-ingested with different defaults.
 *
 * The encoded data and resolved accounts are kept for debug viewing
 * but aren't required to replay.
 */
export interface InvokeHistoryEntry {
  id: string;
  /** Instruction name (matches `ArchInstruction.name`). */
  instruction: string;
  /** Submission timestamp (epoch ms). */
  submittedAt: number;
  /** The user's account inputs, keyed by IDL account name. */
  accountValues: Record<string, string>;
  /**
   * Raw `ArgValue` tree from the form. Stored as `unknown` here to
   * avoid pulling the InvokeTab-specific union into the persistence
   * layer; the Invoke form casts on rehydration.
   */
  argValues: Record<string, unknown>;
  /** Network the tx was submitted to (mainnet/testnet/devnet). */
  network: 'mainnet' | 'testnet' | 'devnet';
  /** Tx outcome — only `txid` for success, `error` for failure. */
  outcome:
    | { kind: 'success'; txid: string }
    | { kind: 'error'; message: string };
  /** Hex-encoded instruction data, when the encoder produced it. */
  encodedDataHex?: string;
  /** Resolved account metas at submission time. */
  accounts?: { name: string; pubkey: string; isSigner: boolean; isMut: boolean }[];
}

export type ProjectFramework = 'native' | 'satellite';

export interface Project {
  id: string;
  name: string;
  description?: string;
  framework?: ProjectFramework; // Framework type (native or satellite)
  files: FileNode[];
  created: Date;
  lastModified: Date;
  lastAccessed?: Date;
  account?: ProjectAccount; // Program keypair (the deployed program's identity)
  authorityAccount?: ProjectAccount; // Authority keypair (used to deploy and manage programs)
  historicalAuthorityAccounts?: HistoricalAuthorityAccount[]; // Historical authority keypairs
  /**
   * Optional Arch program IDL. Either ingested manually (paste/upload) or
   * (future) emitted by the build pipeline. Used by the Program Inspector
   * to power the IDL viewer, account decoder, and transaction builder.
   */
  idl?: ArchIdl | null;
  /**
   * Address book and saved keypairs are scoped to the project so the
   * Invoke form's account picker can offer "use my saved counter PDA"
   * without leaking labels across unrelated programs.
   */
  addressBook?: AddressBookEntry[];
  savedKeypairs?: SavedKeypair[];
  /**
   * Recent Invoke submissions (most-recent first). Capped at 50 entries
   * by the persistence layer to keep IndexedDB writes bounded.
   */
  invokeHistory?: InvokeHistoryEntry[];
}

// IDL type definitions live in `./idl.ts`. This barrel re-exports them so
// existing imports from `'@/types'` keep working — and so we can't
// accidentally maintain two copies of the same shape (which silently
// happened pre-Slice 1 and broke spec-0.1.0 PDA support).
export type {
  IdlSeed,
  IdlPda,
  ArchInstructionAccount,
  ArchInstruction,
  ArchAccountType,
  ArchTypeDefinition,
  ArchError,
  ArchIdl,
  ComplexType,
} from './idl';

export interface Disposable {
  dispose(): void;
}