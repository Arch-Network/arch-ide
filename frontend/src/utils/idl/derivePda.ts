import bs58 from 'bs58';
import { PubkeyUtil } from '@arch-network/arch-sdk';
import type { ArchInstruction, ComplexType, IdlPda, IdlSeed } from '../../types';

/**
 * Result of attempting to derive a PDA for a given account.
 *
 * `kind: 'derived'` is the happy path — pubkey + bump are ready to render.
 * `kind: 'pending'` means a seed depends on an account/arg that the user
 * hasn't filled in yet; the form should re-derive when that input changes.
 * `kind: 'error'` covers structural problems (bad seed type, derivation
 * failure) and should surface as a tooltip on the field.
 */
export type PdaDerivation =
  | { kind: 'derived'; base58: string; hex: string; bump: number }
  | { kind: 'pending'; missing: string[] }
  | { kind: 'error'; reason: string };

/**
 * Inputs available when deriving a PDA. `programIdHex` is the program the
 * IDL belongs to (i.e. the deployed program's pubkey). The form context
 * provides `accountValues` and `argValues` keyed by the leaf field name
 * (e.g. `user` or `name`).
 *
 * For `pda.program` (cross-program PDAs) we resolve the same way: it can
 * be a const, an account ref, or an arg ref.
 */
export interface DeriveContext {
  programIdHex: string;
  accountValues: Record<string, string | undefined>;
  argValues: Record<string, unknown>;
  /**
   * Optional: when an instruction defines a seed of `kind: 'arg'`, we may
   * need to know its IDL type to encode it correctly. The encoder for
   * arg-derived seeds is intentionally limited (see `encodeArgSeed`); we
   * pass the resolved type here so it can format integers, strings, and
   * pubkeys without guessing.
   */
  argTypes?: Record<string, string | ComplexType>;
}

const textEncoder = new TextEncoder();

const hexToBytes = (hex: string): Uint8Array => {
  const cleaned = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (cleaned.length % 2 !== 0) throw new Error('hex string must have even length');
  const out = new Uint8Array(cleaned.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(cleaned.substring(i * 2, i * 2 + 2), 16);
  }
  return out;
};

const bytesToHex = (bytes: Uint8Array): string =>
  Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

/**
 * Resolve an address string (base58 or hex) to raw bytes. We prefer base58
 * because that's what the IDL emits, but the existing `AccountsTab` lets
 * users paste either, so we accept both.
 */
const addressToBytes = (input: string): Uint8Array | null => {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;
  // Hex: 64 chars (with optional `0x`).
  const hexCandidate = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
  if (/^[0-9a-fA-F]{64}$/.test(hexCandidate)) {
    try {
      return hexToBytes(hexCandidate);
    } catch {
      /* fall through to base58 */
    }
  }
  try {
    const decoded = bs58.decode(trimmed);
    if (decoded.length === 32) return new Uint8Array(decoded);
  } catch {
    /* not base58 */
  }
  return null;
};

/**
 * Encode an `arg`-typed seed value to bytes. We intentionally restrict
 * support to the types most commonly used as seeds: strings, numeric
 * primitives (LE-encoded), bools, and 32-byte pubkeys. Anything else
 * raises an error so callers know to surface "manual override" UI rather
 * than silently hashing a wrong representation.
 */
const encodeArgSeed = (
  value: unknown,
  type: string | ComplexType | undefined,
): Uint8Array => {
  // Pubkey-shaped string (e.g. a base58 user input that was stored as the
  // arg). We treat any 32-byte address-decodable string as a pubkey.
  if (typeof value === 'string') {
    if (type === 'string' || type === 'String') {
      return textEncoder.encode(value);
    }
    if (type === 'pubkey' || type === 'Pubkey' || type === 'publicKey') {
      const bytes = addressToBytes(value);
      if (!bytes) throw new Error(`invalid pubkey arg seed: ${value}`);
      return bytes;
    }
    // Numeric strings: only legal when type implies integer.
    if (typeof type === 'string' && /^[ui](8|16|32|64|128)$/.test(type)) {
      return encodeIntegerSeed(BigInt(value), type);
    }
    // Default: treat as raw UTF-8 bytes.
    return textEncoder.encode(value);
  }
  if (typeof value === 'number' || typeof value === 'bigint') {
    if (typeof type !== 'string') {
      throw new Error('numeric arg seed requires a primitive integer type');
    }
    return encodeIntegerSeed(BigInt(value), type);
  }
  if (typeof value === 'boolean') {
    return new Uint8Array([value ? 1 : 0]);
  }
  throw new Error(`unsupported arg seed type: ${typeof value} for IDL type ${String(type)}`);
};

const INT_BYTES: Record<string, number> = {
  u8: 1, i8: 1,
  u16: 2, i16: 2,
  u32: 4, i32: 4,
  u64: 8, i64: 8,
  u128: 16, i128: 16,
};

const encodeIntegerSeed = (value: bigint, type: string): Uint8Array => {
  const len = INT_BYTES[type];
  if (!len) throw new Error(`unknown integer seed type: ${type}`);
  const out = new Uint8Array(len);
  let v = value;
  // Two's complement for signed types.
  if (type.startsWith('i') && v < 0n) {
    v = (1n << BigInt(len * 8)) + v;
  }
  for (let i = 0; i < len; i++) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
};

const resolveSeed = (
  seed: IdlSeed,
  ctx: DeriveContext,
  missing: string[],
): Uint8Array | null => {
  if (seed.kind === 'const') {
    return new Uint8Array(seed.value);
  }
  if (seed.kind === 'account') {
    const value = ctx.accountValues[seed.path];
    if (!value || value.trim().length === 0) {
      missing.push(`account "${seed.path}"`);
      return null;
    }
    const bytes = addressToBytes(value);
    if (!bytes) {
      throw new Error(`account seed "${seed.path}" is not a valid pubkey`);
    }
    return bytes;
  }
  // kind === 'arg'
  // Seeds may reference nested fields via a dotted path. We only support
  // top-level args today — nested struct seeds are uncommon in practice
  // and the encoder can be extended once we have a real struct UI.
  const path = seed.path;
  if (path.includes('.')) {
    throw new Error(`nested arg seed paths are not supported yet: "${path}"`);
  }
  const raw = ctx.argValues[path];
  if (raw === undefined || raw === null || raw === '') {
    missing.push(`arg "${path}"`);
    return null;
  }
  return encodeArgSeed(raw, ctx.argTypes?.[path]);
};

/**
 * Derive the program address declared by an IDL `pda` block.
 *
 * Returns one of three states (see `PdaDerivation`). The caller renders
 * the result inline — derived PDAs are read-only with the bump shown
 * underneath; pending PDAs surface a "fill these dependencies first" note.
 */
export const derivePda = (pda: IdlPda, ctx: DeriveContext): PdaDerivation => {
  const missing: string[] = [];
  let seedBytes: Uint8Array[];
  try {
    seedBytes = pda.seeds
      .map((s) => resolveSeed(s, ctx, missing))
      .filter((b): b is Uint8Array => b !== null);
  } catch (err) {
    return { kind: 'error', reason: err instanceof Error ? err.message : String(err) };
  }
  if (missing.length > 0) {
    return { kind: 'pending', missing };
  }

  let programBytes: Uint8Array;
  try {
    if (pda.program) {
      const resolved = resolveSeed(pda.program, ctx, missing);
      if (missing.length > 0 || !resolved) {
        return { kind: 'pending', missing };
      }
      programBytes = resolved;
    } else {
      programBytes = hexToBytes(ctx.programIdHex);
    }
  } catch (err) {
    return { kind: 'error', reason: err instanceof Error ? err.message : String(err) };
  }

  try {
    const [pubkey, bump] = PubkeyUtil.findProgramAddress(seedBytes, programBytes);
    const hex = bytesToHex(pubkey);
    const base58 = bs58.encode(pubkey);
    return { kind: 'derived', base58, hex, bump };
  } catch (err) {
    return {
      kind: 'error',
      reason: err instanceof Error ? err.message : 'PDA derivation failed',
    };
  }
};

/**
 * Build a flat map of `accountName -> address` from an instruction's
 * current form state. Used as the input for `derivePda` so seeds of
 * `kind: 'account'` resolve correctly without the form needing to know
 * about cross-account references itself.
 *
 * We also synthesize an entry for the well-known "system_program" name
 * so older IDLs that omit the explicit `address` constraint still
 * resolve. Newer arch-satellite-lang always emits the address.
 */
export const buildAccountValueMap = (
  instruction: ArchInstruction,
  formAccounts: Record<string, string>,
): Record<string, string> => {
  const out: Record<string, string> = { ...formAccounts };
  for (const acc of instruction.accounts) {
    if (acc.address && !out[acc.name]) {
      out[acc.name] = acc.address;
    }
  }
  return out;
};

/**
 * Build the `argTypes` map needed by `derivePda`. We only include the
 * top-level type expression — nested-struct arg seeds remain unsupported
 * (see `resolveSeed`).
 */
export const buildArgTypeMap = (
  instruction: ArchInstruction,
): Record<string, string | ComplexType> => {
  const out: Record<string, string | ComplexType> = {};
  for (const a of instruction.args) out[a.name] = a.type;
  return out;
};
