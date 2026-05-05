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