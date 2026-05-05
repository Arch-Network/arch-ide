/**
 * Anchor / spec-0.1.0 PDA seed shapes. The IDL emits a tagged union; we
 * preserve it verbatim so PDA derivation can resolve `account` / `arg`
 * references against the live form state.
 */
export type IdlSeed =
  | { kind: 'const'; value: number[] }
  | { kind: 'arg'; path: string }
  | { kind: 'account'; path: string; account?: string };

export interface IdlPda {
  seeds: IdlSeed[];
  /**
   * Optional override for the program ID used during derivation. When
   * absent, the derivation uses the IDL's own program. Spec-0.1.0 allows a
   * cross-program PDA via this field.
   */
  program?: IdlSeed;
}

export interface ArchInstructionAccount {
  name: string;
  isMut: boolean;
  isSigner: boolean;
  /**
   * When set, the account has a fixed pubkey (e.g. `system_program`,
   * `clock` sysvar). The form auto-fills it and never prompts the user.
   * Format: base58 (matches Anchor's emission).
   */
  address?: string;
  /**
   * When set, the account is a Program-Derived Address. We derive on
   * the fly from the seeds; constant-only seeds derive on instruction
   * select, arg/account-dependent seeds derive reactively as the user
   * fills their dependencies.
   */
  pda?: IdlPda;
  /** Optional accounts can be omitted from the built transaction. */
  optional?: boolean;
  /**
   * Cross-account `has_one`-style constraints. Surfaced in tooltips so
   * users understand why a downstream field is required.
   */
  relations?: string[];
}

export interface ArchInstruction {
  name: string;
  accounts: ArchInstructionAccount[];
  args: {
    name: string;
    type: string | ComplexType;
  }[];
  /**
   * spec-0.1.0 instruction discriminator (8 bytes for Anchor / satellite).
   * Preserved here so the encoder doesn't have to recompute the sighash;
   * this also lets us support programs that override the discriminator.
   */
  discriminator?: number[];
}

export interface ArchAccountType {
  name: string;
  type: {
    kind: "struct";
    fields: {
      name: string;
      type: string;
    }[];
  };
}

export interface ArchTypeDefinition {
  name: string;
  type: {
    kind: "enum" | "struct";
    variants?: {
      name: string;
      fields?: {
        name: string;
        type: string | ComplexType;
      }[];
    }[];
    fields?: {
      name: string;
      type: string | ComplexType;
    }[];
  };
}

export interface ArchError {
  code: number;
  name: string;
  msg: string;
}

export interface ArchIdl {
  version: string;
  name: string;
  instructions: ArchInstruction[];
  accounts: ArchAccountType[];
  types: ArchTypeDefinition[];
  errors: ArchError[];
}

export interface ComplexType {
  name?: string;
  option?: ComplexType;
  tuple?: (string | ComplexType)[];  // Changed from ComplexType[] to allow string literals
  vec?: ComplexType | string;        // Changed to allow string type for simple vectors
  defined?: string;
}