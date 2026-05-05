import bs58 from 'bs58';
import type { ComplexType } from '../../types';

/**
 * Typed representation of a single instruction argument as the Invoke
 * form sees it.
 *
 * Each variant carries:
 *   - The user's raw input (so we can re-render the textbox without
 *     destroying their typing during validation)
 *   - The parsed value (or `null` when the input is invalid / empty)
 *   - An optional `error` string surfaced inline when parsing fails
 *
 * Slice 3's Borsh encoder will walk this union directly — no extra
 * string parsing required. New types added here ("array", "tuple",
 * etc.) only need a renderer in `ArgInput.tsx` and an encoder branch.
 */
export type ArgValue =
  | { kind: 'bool'; value: boolean }
  | {
      kind: 'integer';
      type: IntegerType;
      raw: string;
      value: bigint | null;
      error?: string;
    }
  | { kind: 'string'; value: string }
  | {
      kind: 'pubkey';
      raw: string;
      bytes: Uint8Array | null;
      error?: string;
    }
  | {
      kind: 'bytes';
      mode: BytesMode;
      raw: string;
      bytes: Uint8Array | null;
      error?: string;
    }
  | {
      kind: 'option';
      present: boolean;
      /** When `present` is false the inner value is irrelevant. */
      inner: ArgValue;
    }
  | {
      // Fallback for any type we haven't taught the form yet (structs,
      // enums, vec<defined>, …). The user types JSON which Slice 3's
      // encoder parses against the IDL's type definition.
      kind: 'json';
      raw: string;
      value: unknown;
      error?: string;
    };

export type IntegerType =
  | 'u8' | 'u16' | 'u32' | 'u64' | 'u128'
  | 'i8' | 'i16' | 'i32' | 'i64' | 'i128';

/** How the user has chosen to type a `Vec<u8>` value. */
export type BytesMode = 'utf8' | 'hex' | 'base58';

const INTEGER_TYPES: ReadonlySet<string> = new Set([
  'u8', 'u16', 'u32', 'u64', 'u128',
  'i8', 'i16', 'i32', 'i64', 'i128',
]);

/**
 * Build the appropriate empty `ArgValue` for an IDL type. The form
 * uses this on instruction switch and when an `Option<T>` is
 * checked-on for the first time.
 */
export const emptyArgValue = (type: string | ComplexType): ArgValue => {
  if (typeof type === 'string') {
    if (type === 'bool') return { kind: 'bool', value: false };
    if (INTEGER_TYPES.has(type)) {
      return { kind: 'integer', type: type as IntegerType, raw: '', value: null };
    }
    if (type === 'string' || type === 'String') return { kind: 'string', value: '' };
    if (type === 'pubkey' || type === 'publicKey' || type === 'Pubkey') {
      return { kind: 'pubkey', raw: '', bytes: null };
    }
    return { kind: 'json', raw: '', value: null };
  }
  // Complex type: Option<T>, Vec<u8>, Vec<T>, defined, …
  if (type.option) {
    return { kind: 'option', present: false, inner: emptyArgValue(type.option) };
  }
  if (type.vec !== undefined) {
    const inner = type.vec;
    if (inner === 'u8') {
      return { kind: 'bytes', mode: 'utf8', raw: '', bytes: null };
    }
    return { kind: 'json', raw: '', value: null };
  }
  return { kind: 'json', raw: '', value: null };
};

/** Whether a parsed `ArgValue` would Borsh-encode without errors. */
export const isArgValueValid = (v: ArgValue): boolean => {
  switch (v.kind) {
    case 'bool':
    case 'string':
      return true;
    case 'integer':
      return v.value !== null && !v.error;
    case 'pubkey':
    case 'bytes':
      return v.bytes !== null && !v.error;
    case 'option':
      return v.present ? isArgValueValid(v.inner) : true;
    case 'json':
      return v.error === undefined && v.value !== null;
  }
};

const INT_RANGES: Record<IntegerType, { min: bigint; max: bigint }> = {
  u8:   { min: 0n, max: (1n << 8n)  - 1n },
  u16:  { min: 0n, max: (1n << 16n) - 1n },
  u32:  { min: 0n, max: (1n << 32n) - 1n },
  u64:  { min: 0n, max: (1n << 64n) - 1n },
  u128: { min: 0n, max: (1n << 128n) - 1n },
  i8:   { min: -(1n << 7n),   max: (1n << 7n)   - 1n },
  i16:  { min: -(1n << 15n),  max: (1n << 15n)  - 1n },
  i32:  { min: -(1n << 31n),  max: (1n << 31n)  - 1n },
  i64:  { min: -(1n << 63n),  max: (1n << 63n)  - 1n },
  i128: { min: -(1n << 127n), max: (1n << 127n) - 1n },
};

/**
 * Parse an integer string against a Borsh primitive type. Returns
 * `null` for empty input (treated as "user hasn't filled this in")
 * and throws via `error` for out-of-range / malformed input.
 *
 * We intentionally accept underscores so users can type
 * `1_000_000_000` without errors — same convention as Rust source.
 */
export const parseInteger = (
  raw: string,
  type: IntegerType,
): { value: bigint | null; error?: string } => {
  const trimmed = raw.trim().replace(/_/g, '');
  if (trimmed === '' || trimmed === '-') return { value: null };
  if (!/^-?\d+$/.test(trimmed)) {
    return { value: null, error: 'Expected a whole number.' };
  }
  let value: bigint;
  try {
    value = BigInt(trimmed);
  } catch {
    return { value: null, error: 'Invalid number.' };
  }
  const { min, max } = INT_RANGES[type];
  if (value < min || value > max) {
    return {
      value: null,
      error: `Out of range for ${type}: must be between ${min} and ${max}.`,
    };
  }
  return { value };
};

/**
 * Parse a pubkey string (base58 or hex). Returns `null` bytes for
 * empty input, populated bytes for valid pubkeys, and an `error` on
 * malformed input. Accepts the same formats as `derivePda.addressToBytes`.
 */
export const parsePubkey = (
  raw: string,
): { bytes: Uint8Array | null; error?: string } => {
  const trimmed = raw.trim();
  if (trimmed === '') return { bytes: null };
  // 64-char hex (with optional 0x).
  const hexCandidate = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
  if (/^[0-9a-fA-F]{64}$/.test(hexCandidate)) {
    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      out[i] = parseInt(hexCandidate.substring(i * 2, i * 2 + 2), 16);
    }
    return { bytes: out };
  }
  try {
    const decoded = bs58.decode(trimmed);
    if (decoded.length !== 32) {
      return {
        bytes: null,
        error: `Pubkey must be 32 bytes; got ${decoded.length}.`,
      };
    }
    return { bytes: new Uint8Array(decoded) };
  } catch {
    return { bytes: null, error: 'Not a valid base58 or hex pubkey.' };
  }
};

/**
 * Parse a `Vec<u8>` payload using the user-selected encoding mode.
 * UTF-8 always succeeds; hex and base58 surface format errors inline.
 */
export const parseBytes = (
  raw: string,
  mode: BytesMode,
): { bytes: Uint8Array | null; error?: string } => {
  if (raw === '') return { bytes: new Uint8Array(0) };
  if (mode === 'utf8') {
    return { bytes: new TextEncoder().encode(raw) };
  }
  if (mode === 'hex') {
    const cleaned = raw.replace(/^0x/, '').replace(/\s+/g, '');
    if (cleaned.length % 2 !== 0) {
      return { bytes: null, error: 'Hex string must have an even length.' };
    }
    if (!/^[0-9a-fA-F]*$/.test(cleaned)) {
      return { bytes: null, error: 'Invalid hex characters.' };
    }
    const out = new Uint8Array(cleaned.length / 2);
    for (let i = 0; i < out.length; i++) {
      out[i] = parseInt(cleaned.substring(i * 2, i * 2 + 2), 16);
    }
    return { bytes: out };
  }
  try {
    return { bytes: new Uint8Array(bs58.decode(raw)) };
  } catch {
    return { bytes: null, error: 'Not a valid base58 string.' };
  }
};

/**
 * Parse a free-form JSON arg value. Used for struct/enum/Vec<defined>
 * inputs the form doesn't (yet) render with structured controls.
 */
export const parseJson = (
  raw: string,
): { value: unknown; error?: string } => {
  if (raw.trim() === '') return { value: null };
  try {
    return { value: JSON.parse(raw) };
  } catch (e) {
    return { value: null, error: e instanceof Error ? e.message : 'Invalid JSON.' };
  }
};
