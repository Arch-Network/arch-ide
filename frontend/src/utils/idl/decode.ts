import { Buffer } from 'buffer/';
import bs58 from 'bs58';
import type { ArchAccountType, ArchIdl } from '../../types';
import { sizeOfPrimitive } from './typeRender';

export type DecodedValue =
  | { kind: 'scalar'; type: string; value: string }
  | { kind: 'unsupported'; type: string; reason: string };

export interface DecodedField {
  name: string;
  type: string;
  value: DecodedValue;
  /** Byte offset in the original buffer where this field started. */
  offset: number;
  /** Number of bytes consumed by this field, when known. */
  size?: number;
}

export interface DecodedAccount {
  /** The IDL account type that was matched, or `null` if no match. */
  account: ArchAccountType | null;
  /** All decoded fields up to the first unsupported / variable-length type. */
  fields: DecodedField[];
  /** Bytes that come after the decoded portion (always provided so devs can inspect raw). */
  remainder: Buffer;
  /** True when we stopped early because we hit a non-scalar type. */
  truncated: boolean;
  /** Discriminator length we skipped (8 bytes for Anchor / satellite_lang). */
  discriminatorLength: number;
}

/**
 * Best-effort scalar Borsh decoder for an account's data buffer.
 *
 * Strategy:
 *   1. Skip the leading 8-byte discriminator (Anchor / satellite_lang).
 *   2. Walk the IDL account's fields, pulling fixed-width primitives off
 *      the buffer in little-endian order.
 *   3. Stop on the first variable-length / defined / nested type and report
 *      the rest as `remainder`. We surface this honestly instead of pretending
 *      we can decode it — that's a job for a future Borsh runtime.
 *
 * We resolve which IDL account to use by name first, falling back to the
 * single account in the IDL when there's no ambiguity. This matches the
 * common Arch program with one main state account.
 */
export const decodeAccountData = (
  data: Buffer,
  idl: ArchIdl,
  hint?: { accountName?: string },
): DecodedAccount => {
  const discriminatorLength = 8;
  const stripped = data.length >= discriminatorLength
    ? data.slice(discriminatorLength)
    : data;

  const account = pickAccount(idl, hint?.accountName) ?? null;
  if (!account) {
    return {
      account: null,
      fields: [],
      remainder: stripped,
      truncated: false,
      discriminatorLength: data.length >= discriminatorLength ? discriminatorLength : 0,
    };
  }

  const fields: DecodedField[] = [];
  let cursor = 0;
  let truncated = false;

  for (const field of account.type.fields) {
    if (typeof field.type !== 'string') {
      fields.push({
        name: field.name,
        type: 'complex',
        value: { kind: 'unsupported', type: 'complex', reason: 'Nested type not yet decoded' },
        offset: cursor,
      });
      truncated = true;
      break;
    }

    const size = sizeOfPrimitive(field.type);
    if (size === undefined) {
      fields.push({
        name: field.name,
        type: field.type,
        value: { kind: 'unsupported', type: field.type, reason: 'Variable-length / defined type' },
        offset: cursor,
      });
      truncated = true;
      break;
    }
    if (cursor + size > stripped.length) {
      fields.push({
        name: field.name,
        type: field.type,
        value: { kind: 'unsupported', type: field.type, reason: 'Buffer ended before field' },
        offset: cursor,
      });
      truncated = true;
      break;
    }
    const slice = stripped.slice(cursor, cursor + size);
    fields.push({
      name: field.name,
      type: field.type,
      value: decodeScalar(field.type, slice),
      offset: cursor,
      size,
    });
    cursor += size;
  }

  return {
    account,
    fields,
    remainder: stripped.slice(cursor),
    truncated,
    discriminatorLength: data.length >= discriminatorLength ? discriminatorLength : 0,
  };
};

const pickAccount = (idl: ArchIdl, name?: string): ArchAccountType | undefined => {
  if (idl.accounts.length === 0) return undefined;
  if (name) {
    return idl.accounts.find((a) => a.name === name);
  }
  if (idl.accounts.length === 1) return idl.accounts[0];
  return undefined;
};

const decodeScalar = (type: string, slice: Buffer): DecodedValue => {
  switch (type) {
    case 'bool':
      return { kind: 'scalar', type, value: slice[0] !== 0 ? 'true' : 'false' };
    case 'u8':
      return { kind: 'scalar', type, value: String(slice.readUInt8(0)) };
    case 'i8':
      return { kind: 'scalar', type, value: String(slice.readInt8(0)) };
    case 'u16':
      return { kind: 'scalar', type, value: String(slice.readUInt16LE(0)) };
    case 'i16':
      return { kind: 'scalar', type, value: String(slice.readInt16LE(0)) };
    case 'u32':
      return { kind: 'scalar', type, value: String(slice.readUInt32LE(0)) };
    case 'i32':
      return { kind: 'scalar', type, value: String(slice.readInt32LE(0)) };
    case 'u64':
      return { kind: 'scalar', type, value: readBigUInt64LE(slice).toString() };
    case 'i64':
      return { kind: 'scalar', type, value: readBigInt64LE(slice).toString() };
    case 'u128':
      return { kind: 'scalar', type, value: readBigUInt128LE(slice).toString() };
    case 'i128':
      return { kind: 'scalar', type, value: readBigInt128LE(slice).toString() };
    case 'pubkey':
    case 'publicKey':
    case 'Pubkey':
      return { kind: 'scalar', type, value: bs58.encode(slice) };
    default:
      return { kind: 'unsupported', type, reason: `No decoder for ${type}` };
  }
};

// Buffer's polyfill build sometimes ships without readBigUInt64LE/readBigInt64LE,
// so we provide branch-free fallbacks.

const readBigUInt64LE = (buf: Buffer): bigint => {
  const lo = BigInt(buf.readUInt32LE(0));
  const hi = BigInt(buf.readUInt32LE(4));
  return lo + (hi << 32n);
};

const readBigInt64LE = (buf: Buffer): bigint => {
  const unsigned = readBigUInt64LE(buf);
  // Reinterpret as signed by checking the top bit.
  return unsigned & (1n << 63n) ? unsigned - (1n << 64n) : unsigned;
};

const readBigUInt128LE = (buf: Buffer): bigint => {
  const lo = readBigUInt64LE(buf.slice(0, 8));
  const hi = readBigUInt64LE(buf.slice(8, 16));
  return lo + (hi << 64n);
};

const readBigInt128LE = (buf: Buffer): bigint => {
  const unsigned = readBigUInt128LE(buf);
  return unsigned & (1n << 127n) ? unsigned - (1n << 128n) : unsigned;
};
