import { Buffer } from 'buffer/';
import bs58 from 'bs58';
import type { ArchAccountType, ArchIdl, ArchTypeDefinition } from '../../types';
import { sizeOfPrimitive } from './typeRender';

/**
 * Decoded value tree
 * ------------------
 * Account decoding used to flatten everything to a single string and
 * stop at the first non-primitive. The recursive decoder needs to
 * surface real structure so the UI can render trees / collapsibles,
 * so we model the value as a discriminated union: every node
 * carries enough info to render itself without re-parsing the type.
 *
 * Nodes other than `scalar` / `string` / `bytes` carry children;
 * the UI walks the tree depth-first and indents accordingly.
 */
export type DecodedValue =
  | { kind: 'scalar'; type: string; value: string }
  | { kind: 'string'; value: string; bytes: number }
  | { kind: 'bytes'; preview: string; length: number }
  | { kind: 'option'; present: boolean; inner?: DecodedValue }
  | { kind: 'vec'; items: DecodedValue[]; length: number; itemType: string }
  | { kind: 'array'; items: DecodedValue[]; length: number; itemType: string }
  | {
      kind: 'tuple';
      items: DecodedValue[];
    }
  | {
      kind: 'struct';
      name: string;
      fields: { name: string; type: string; value: DecodedValue }[];
    }
  | {
      kind: 'enum';
      name: string;
      variant: string;
      tag: number;
      data?: DecodedValue;
    }
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
  /** True when we stopped early because we hit a non-decodable type. */
  truncated: boolean;
  /** Discriminator length we skipped (8 bytes for Anchor / satellite_lang). */
  discriminatorLength: number;
}

/**
 * Borsh-style recursive decoder for an account's data buffer.
 *
 * Supports primitives, `String`, `Pubkey`, `Option<T>`, `Vec<T>`,
 * fixed arrays `[T; N]`, tuples, and IDL-defined structs/enums
 * (including recursive nesting). Stops on the first truly unknown
 * type (unresolved `defined`, `unknown`) and reports the rest as
 * `remainder` so devs can still eyeball the raw bytes.
 *
 *   1. Skip the leading 8-byte discriminator (Anchor / satellite_lang).
 *   2. For each account field, parse the IDL type-string into a tree
 *      and decode it against the buffer, advancing `cursor`.
 *   3. If any field can't be decoded, mark `truncated` and bail.
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

  const types = new Map<string, ArchTypeDefinition>(
    idl.types.map((t) => [t.name, t]),
  );

  const fields: DecodedField[] = [];
  let cursor = 0;
  let truncated = false;

  for (const field of account.type.fields) {
    const parsed = parseTypeString(field.type);
    const startedAt = cursor;
    try {
      const { value, bytesRead } = decodeAt(parsed, stripped, cursor, types);
      fields.push({
        name: field.name,
        type: field.type,
        value,
        offset: startedAt,
        size: bytesRead,
      });
      cursor += bytesRead;
    } catch (e) {
      fields.push({
        name: field.name,
        type: field.type,
        value: {
          kind: 'unsupported',
          type: field.type,
          reason: e instanceof Error ? e.message : String(e),
        },
        offset: startedAt,
      });
      truncated = true;
      break;
    }
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

// ─── Type parsing ───────────────────────────────────────────────────────────

/**
 * Parsed shape of an IDL type string. Mirrors what `normalize.stringifyType`
 * emits, plus tuple support which the renderer uses but the normalizer
 * collapses (we re-parse those).
 */
type TypeNode =
  | { kind: 'primitive'; name: string }
  | { kind: 'option'; inner: TypeNode }
  | { kind: 'vec'; inner: TypeNode }
  | { kind: 'array'; inner: TypeNode; length: number }
  | { kind: 'tuple'; items: TypeNode[] }
  | { kind: 'defined'; name: string };

const parseTypeString = (raw: string): TypeNode => {
  const s = raw.trim();
  if (!s) return { kind: 'primitive', name: 'unknown' };

  // Option<T>
  if (s.startsWith('Option<') && s.endsWith('>')) {
    return { kind: 'option', inner: parseTypeString(s.slice(7, -1)) };
  }

  // Vec<T>
  if (s.startsWith('Vec<') && s.endsWith('>')) {
    return { kind: 'vec', inner: parseTypeString(s.slice(4, -1)) };
  }

  // [T; N]
  if (s.startsWith('[') && s.endsWith(']')) {
    const inside = s.slice(1, -1);
    const semi = lastTopLevelChar(inside, ';');
    if (semi >= 0) {
      const lhs = inside.slice(0, semi).trim();
      const rhs = inside.slice(semi + 1).trim();
      const len = parseInt(rhs, 10);
      if (Number.isFinite(len)) {
        return { kind: 'array', inner: parseTypeString(lhs), length: len };
      }
    }
  }

  // (A, B, C) — tuples
  if (s.startsWith('(') && s.endsWith(')')) {
    const inside = s.slice(1, -1);
    const items = splitTopLevel(inside, ',').map((p) => parseTypeString(p.trim()));
    return { kind: 'tuple', items };
  }

  // Lowercase Rust primitives & well-known names go through the primitive
  // path. Capitalized names that aren't `Option`/`Vec` are user-defined.
  if (KNOWN_PRIMITIVES.has(s.toLowerCase())) {
    return { kind: 'primitive', name: s };
  }

  // Fallback: treat as a defined type. The decoder will look it up
  // in the IDL and emit `unsupported` if it's missing.
  return { kind: 'defined', name: s };
};

/**
 * Split a string on `sep`, ignoring instances inside angle/square/paren
 * brackets. Used by the type parser to walk tuple / generic argument
 * lists without a real lexer.
 */
const splitTopLevel = (s: string, sep: string): string[] => {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '<' || c === '[' || c === '(') depth++;
    else if (c === '>' || c === ']' || c === ')') depth--;
    else if (c === sep && depth === 0) {
      out.push(s.slice(start, i));
      start = i + 1;
    }
  }
  out.push(s.slice(start));
  return out;
};

const lastTopLevelChar = (s: string, ch: string): number => {
  let depth = 0;
  let last = -1;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === '<' || c === '[' || c === '(') depth++;
    else if (c === '>' || c === ']' || c === ')') depth--;
    else if (c === ch && depth === 0) last = i;
  }
  return last;
};

const KNOWN_PRIMITIVES = new Set([
  'bool',
  'u8',
  'u16',
  'u32',
  'u64',
  'u128',
  'i8',
  'i16',
  'i32',
  'i64',
  'i128',
  'f32',
  'f64',
  'string',
  'pubkey',
  'publickey',
  'bytes',
]);

// ─── Type decoding ──────────────────────────────────────────────────────────

interface DecodeOk {
  value: DecodedValue;
  bytesRead: number;
}

/**
 * Decode a single value at `cursor` into a `DecodedValue` and report
 * how many bytes were consumed. We dispatch on the parsed type tree;
 * primitive and defined branches farm out to specialized helpers so
 * the recursion remains shallow.
 *
 * Throws when the buffer is too short for the declared type — the
 * caller catches and surfaces this as an `unsupported` field.
 */
const decodeAt = (
  type: TypeNode,
  buf: Buffer,
  cursor: number,
  types: Map<string, ArchTypeDefinition>,
): DecodeOk => {
  switch (type.kind) {
    case 'primitive':
      return decodePrimitive(type.name, buf, cursor);
    case 'option':
      return decodeOption(type.inner, buf, cursor, types);
    case 'vec':
      return decodeVec(type.inner, buf, cursor, types);
    case 'array':
      return decodeArray(type.inner, type.length, buf, cursor, types);
    case 'tuple':
      return decodeTuple(type.items, buf, cursor, types);
    case 'defined':
      return decodeDefined(type.name, buf, cursor, types);
  }
};

const decodePrimitive = (name: string, buf: Buffer, cursor: number): DecodeOk => {
  const lower = name.toLowerCase();

  if (lower === 'string') {
    requireBytes(buf, cursor, 4, name);
    const len = buf.readUInt32LE(cursor);
    requireBytes(buf, cursor + 4, len, name);
    const slice = buf.slice(cursor + 4, cursor + 4 + len);
    const text = Buffer.from(slice).toString('utf8');
    return {
      value: { kind: 'string', value: text, bytes: len },
      bytesRead: 4 + len,
    };
  }

  if (lower === 'bytes') {
    requireBytes(buf, cursor, 4, name);
    const len = buf.readUInt32LE(cursor);
    requireBytes(buf, cursor + 4, len, name);
    const slice = buf.slice(cursor + 4, cursor + 4 + len);
    return {
      value: {
        kind: 'bytes',
        preview: bytesPreview(slice),
        length: len,
      },
      bytesRead: 4 + len,
    };
  }

  if (lower === 'pubkey' || lower === 'publickey') {
    requireBytes(buf, cursor, 32, name);
    return {
      value: {
        kind: 'scalar',
        type: name,
        value: bs58.encode(buf.slice(cursor, cursor + 32)),
      },
      bytesRead: 32,
    };
  }

  const size = sizeOfPrimitive(name);
  if (size === undefined) {
    throw new Error(`Unsupported primitive: ${name}`);
  }
  requireBytes(buf, cursor, size, name);
  const slice = buf.slice(cursor, cursor + size);
  return { value: decodeFixedScalar(name, slice), bytesRead: size };
};

const decodeFixedScalar = (type: string, slice: Buffer): DecodedValue => {
  switch (type.toLowerCase()) {
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
    case 'f32':
      return { kind: 'scalar', type, value: String(slice.readFloatLE(0)) };
    case 'f64':
      return { kind: 'scalar', type, value: String(slice.readDoubleLE(0)) };
    default:
      return { kind: 'unsupported', type, reason: `No decoder for ${type}` };
  }
};

const decodeOption = (
  inner: TypeNode,
  buf: Buffer,
  cursor: number,
  types: Map<string, ArchTypeDefinition>,
): DecodeOk => {
  requireBytes(buf, cursor, 1, 'Option');
  const tag = buf.readUInt8(cursor);
  if (tag === 0) {
    return { value: { kind: 'option', present: false }, bytesRead: 1 };
  }
  const child = decodeAt(inner, buf, cursor + 1, types);
  return {
    value: { kind: 'option', present: true, inner: child.value },
    bytesRead: 1 + child.bytesRead,
  };
};

const decodeVec = (
  inner: TypeNode,
  buf: Buffer,
  cursor: number,
  types: Map<string, ArchTypeDefinition>,
): DecodeOk => {
  requireBytes(buf, cursor, 4, 'Vec');
  const len = buf.readUInt32LE(cursor);
  let read = 4;
  // Soft cap to avoid runaway allocations on a corrupted length prefix
  // — 1MB of items is far past any realistic on-chain account.
  if (len > 1_000_000) {
    throw new Error(`Vec length looks corrupted (${len})`);
  }
  const items: DecodedValue[] = [];
  for (let i = 0; i < len; i++) {
    const child = decodeAt(inner, buf, cursor + read, types);
    items.push(child.value);
    read += child.bytesRead;
  }
  return {
    value: { kind: 'vec', items, length: len, itemType: typeNodeLabel(inner) },
    bytesRead: read,
  };
};

const decodeArray = (
  inner: TypeNode,
  length: number,
  buf: Buffer,
  cursor: number,
  types: Map<string, ArchTypeDefinition>,
): DecodeOk => {
  let read = 0;
  const items: DecodedValue[] = [];
  for (let i = 0; i < length; i++) {
    const child = decodeAt(inner, buf, cursor + read, types);
    items.push(child.value);
    read += child.bytesRead;
  }
  return {
    value: { kind: 'array', items, length, itemType: typeNodeLabel(inner) },
    bytesRead: read,
  };
};

const decodeTuple = (
  members: TypeNode[],
  buf: Buffer,
  cursor: number,
  types: Map<string, ArchTypeDefinition>,
): DecodeOk => {
  let read = 0;
  const items: DecodedValue[] = [];
  for (const t of members) {
    const child = decodeAt(t, buf, cursor + read, types);
    items.push(child.value);
    read += child.bytesRead;
  }
  return { value: { kind: 'tuple', items }, bytesRead: read };
};

const decodeDefined = (
  name: string,
  buf: Buffer,
  cursor: number,
  types: Map<string, ArchTypeDefinition>,
): DecodeOk => {
  const def = types.get(name);
  if (!def) {
    throw new Error(`Unknown defined type: ${name}`);
  }

  if (def.type.kind === 'struct') {
    const struct = def.type;
    let read = 0;
    const fields: { name: string; type: string; value: DecodedValue }[] = [];
    for (const f of struct.fields ?? []) {
      const fieldType = parseTypeString(typeofToString(f.type));
      const child = decodeAt(fieldType, buf, cursor + read, types);
      fields.push({ name: f.name, type: typeofToString(f.type), value: child.value });
      read += child.bytesRead;
    }
    return {
      value: { kind: 'struct', name, fields },
      bytesRead: read,
    };
  }

  // Enum: Borsh encodes a u8 discriminator + the variant payload.
  // Variants without explicit fields encode as just the tag.
  requireBytes(buf, cursor, 1, `enum ${name}`);
  const tag = buf.readUInt8(cursor);
  const variant = (def.type.variants ?? [])[tag];
  if (!variant) {
    throw new Error(`Unknown variant tag ${tag} for enum ${name}`);
  }
  let read = 1;
  let data: DecodedValue | undefined;
  if (variant.fields && variant.fields.length > 0) {
    // Tuple-style variants encode their fields back-to-back.
    const inner = variant.fields.map((f) => parseTypeString(typeofToString(f.type)));
    if (inner.length === 1) {
      const child = decodeAt(inner[0], buf, cursor + read, types);
      data = child.value;
      read += child.bytesRead;
    } else {
      const child = decodeTuple(inner, buf, cursor + read, types);
      data = child.value;
      read += child.bytesRead;
    }
  }
  return {
    value: { kind: 'enum', name, variant: variant.name, tag, data },
    bytesRead: read,
  };
};

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Stringify a defined-type field-type value. The IDL stores these as
 * `string | ComplexType`, but the recursive decoder works against
 * type-strings — so we collapse complex shapes to strings using the
 * same conventions as `normalize.stringifyType`. This avoids a
 * second representation drift point.
 */
const typeofToString = (raw: unknown): string => {
  if (typeof raw === 'string') return raw;
  if (!raw || typeof raw !== 'object') return 'unknown';
  const r = raw as Record<string, unknown>;
  if (typeof r.option !== 'undefined') return `Option<${typeofToString(r.option)}>`;
  if (typeof r.vec !== 'undefined') return `Vec<${typeofToString(r.vec)}>`;
  const arrCandidate = r.array as [unknown, unknown] | undefined;
  if (arrCandidate && Array.isArray(arrCandidate)) {
    return `[${typeofToString(arrCandidate[0])}; ${arrCandidate[1]}]`;
  }
  if (typeof r.defined === 'string') return r.defined;
  if (typeof r.name === 'string') return r.name;
  return 'unknown';
};

const typeNodeLabel = (n: TypeNode): string => {
  switch (n.kind) {
    case 'primitive': return n.name;
    case 'option': return `Option<${typeNodeLabel(n.inner)}>`;
    case 'vec': return `Vec<${typeNodeLabel(n.inner)}>`;
    case 'array': return `[${typeNodeLabel(n.inner)}; ${n.length}]`;
    case 'tuple': return `(${n.items.map(typeNodeLabel).join(', ')})`;
    case 'defined': return n.name;
  }
};

const requireBytes = (buf: Buffer, cursor: number, n: number, ctx: string) => {
  if (cursor + n > buf.length) {
    throw new Error(`Buffer too short for ${ctx} (${n}B at ${cursor}, have ${buf.length})`);
  }
};

const bytesPreview = (buf: Buffer): string => {
  const arr = Array.from(buf);
  const head = arr.slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
  return arr.length > 16 ? `${head}…` : head;
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
