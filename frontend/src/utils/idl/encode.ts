import bs58 from 'bs58';
import { sha256 } from 'js-sha256';
import type {
  ArchIdl,
  ArchInstruction,
  ArchTypeDefinition,
  ComplexType,
} from '../../types';
import type { ArgValue } from '../../components/ProgramInspector/argValue';

/**
 * Encode an instruction's args into a single Borsh byte buffer.
 *
 * The buffer omits the instruction discriminator — that's the caller's
 * job (it lives outside the args region of the instruction data). The
 * returned bytes are concatenated in the IDL's declared order, which
 * is the only order the on-chain program will accept.
 *
 * Errors are accumulated rather than thrown so the form can surface
 * them all at once. Callers that just want a "yes/no" should check
 * `errors.length === 0`.
 */
export interface EncodeResult {
  bytes: Uint8Array;
  errors: string[];
}

export const encodeInstructionArgs = (
  ix: ArchInstruction,
  values: Record<string, ArgValue>,
  idl: ArchIdl,
): EncodeResult => {
  const writer = new Writer();
  const errors: string[] = [];
  for (const arg of ix.args) {
    const v = values[arg.name];
    if (!v) {
      errors.push(`Missing arg: ${arg.name}`);
      continue;
    }
    try {
      encodeValue(writer, v, arg.type, idl, arg.name);
    } catch (e) {
      errors.push(
        `${arg.name}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
  return { bytes: writer.finish(), errors };
};

/**
 * Encode the full instruction-data buffer, including the leading
 * discriminator. We prefer the IDL's `discriminator` field (spec-0.1.0
 * preserves it verbatim) and fall back to the Anchor sighash if
 * absent. Native programs without a sighash convention should ship
 * their own discriminator in the IDL — we don't fabricate bytes.
 */
export const encodeInstructionData = (
  ix: ArchInstruction,
  values: Record<string, ArgValue>,
  idl: ArchIdl,
): EncodeResult => {
  const args = encodeInstructionArgs(ix, values, idl);
  const disc = resolveDiscriminator(ix);
  if (!disc) {
    return {
      bytes: args.bytes,
      errors: [
        ...args.errors,
        'IDL did not provide a discriminator and we cannot derive one safely. Add a `discriminator` to the instruction or override the encoder.',
      ],
    };
  }
  const out = new Uint8Array(disc.length + args.bytes.length);
  out.set(disc, 0);
  out.set(args.bytes, disc.length);
  return { bytes: out, errors: args.errors };
};

const resolveDiscriminator = (ix: ArchInstruction): Uint8Array | null => {
  if (ix.discriminator && ix.discriminator.length > 0) {
    return new Uint8Array(ix.discriminator);
  }
  // Fallback: Anchor / arch-satellite-lang derive the discriminator
  // deterministically as `sha256("global:" + ix_name)[0..8]`. Older
  // IDLs (pre-spec-0.1.0) and some custom builders skip emitting it,
  // assuming the client will recompute. We do the same here so the
  // form doesn't dead-end on those IDLs.
  return computeAnchorSighash(ix.name);
};

/**
 * Compute Anchor's standard 8-byte instruction discriminator from an
 * instruction name. The on-chain dispatcher does the same calculation,
 * so this matches what the program will compare against. We ship raw
 * bytes (not hex/base58) because the encoder concatenates them
 * directly with the args buffer.
 */
const computeAnchorSighash = (ixName: string): Uint8Array => {
  const preimage = `global:${ixName}`;
  const hashHex = sha256(preimage);
  const out = new Uint8Array(8);
  for (let i = 0; i < 8; i++) {
    out[i] = parseInt(hashHex.substring(i * 2, i * 2 + 2), 16);
  }
  return out;
};

// ─── Writer ─────────────────────────────────────────────────────────────────

/**
 * Tiny growable Borsh writer. Borsh has no length prefix on the
 * top-level buffer; everything is positional, so we can simply
 * concatenate scalars and slice consumers handle their own framing.
 */
class Writer {
  private chunks: Uint8Array[] = [];
  private byteLength = 0;

  push(bytes: Uint8Array) {
    this.chunks.push(bytes);
    this.byteLength += bytes.length;
  }

  finish(): Uint8Array {
    const out = new Uint8Array(this.byteLength);
    let offset = 0;
    for (const c of this.chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out;
  }
}

// ─── Encoders ───────────────────────────────────────────────────────────────

const INT_BYTES: Record<string, number> = {
  u8: 1, i8: 1,
  u16: 2, i16: 2,
  u32: 4, i32: 4,
  u64: 8, i64: 8,
  u128: 16, i128: 16,
};

const encodeValue = (
  w: Writer,
  v: ArgValue,
  type: string | ComplexType,
  idl: ArchIdl,
  path: string,
): void => {
  switch (v.kind) {
    case 'bool':
      w.push(new Uint8Array([v.value ? 1 : 0]));
      return;
    case 'integer': {
      if (v.value === null) {
        throw new Error(v.error ?? 'Integer value is empty');
      }
      const len = INT_BYTES[v.type];
      if (!len) throw new Error(`Unknown integer type: ${v.type}`);
      w.push(encodeInteger(v.value, v.type, len));
      return;
    }
    case 'string': {
      const utf8 = new TextEncoder().encode(v.value);
      w.push(encodeInteger(BigInt(utf8.length), 'u32', 4));
      w.push(utf8);
      return;
    }
    case 'pubkey': {
      if (!v.bytes) throw new Error(v.error ?? 'Pubkey is empty or invalid');
      if (v.bytes.length !== 32) {
        throw new Error(`Pubkey must be 32 bytes; got ${v.bytes.length}`);
      }
      w.push(v.bytes);
      return;
    }
    case 'bytes': {
      if (!v.bytes) throw new Error(v.error ?? 'Bytes value is invalid');
      // For Vec<u8> we prepend a u32 length; for fixed [u8; N] the
      // caller handles it (the form doesn't render fixed arrays yet).
      if (typeof type === 'object' && (type as { vec?: unknown }).vec === 'u8') {
        w.push(encodeInteger(BigInt(v.bytes.length), 'u32', 4));
      }
      w.push(v.bytes);
      return;
    }
    case 'option': {
      // Borsh option: 1 byte tag (0 = None, 1 = Some) + inner
      if (!v.present) {
        w.push(new Uint8Array([0]));
        return;
      }
      w.push(new Uint8Array([1]));
      const innerType =
        typeof type === 'object' && type.option ? type.option : 'unknown';
      encodeValue(w, v.inner, innerType as string | ComplexType, idl, `${path}.Some`);
      return;
    }
    case 'json': {
      // Best-effort encoder for "defined" types via the IDL's type map.
      // We support the most common pattern (struct of named fields) and
      // surface a clear error for everything else.
      if (v.value === null || v.value === undefined) {
        throw new Error(v.error ?? 'JSON value is empty');
      }
      const definedName =
        typeof type === 'object' && type.defined ? type.defined : null;
      if (!definedName) {
        throw new Error(
          `Don't know how to Borsh-encode type ${describeType(type)} from JSON`,
        );
      }
      const def = idl.types.find((t) => t.name === definedName);
      if (!def) {
        throw new Error(`IDL type "${definedName}" not found`);
      }
      encodeDefined(w, v.value, def, idl, path);
      return;
    }
  }
};

/**
 * Encode an IDL-defined struct or single-fielded enum from a JSON
 * payload. We deliberately keep this minimal:
 *   - Structs with named fields → Borsh-encode each field in declared order.
 *   - Enums → require `{ "VariantName": value }` form so users can express it.
 *
 * Anything beyond that surfaces an error so the form prompts them to
 * use a typed input once we add it (Slice 4+).
 */
const encodeDefined = (
  w: Writer,
  payload: unknown,
  def: ArchTypeDefinition,
  idl: ArchIdl,
  path: string,
): void => {
  if (def.type.kind === 'struct') {
    if (typeof payload !== 'object' || payload === null) {
      throw new Error(`Expected an object for struct ${def.name} at ${path}`);
    }
    const obj = payload as Record<string, unknown>;
    for (const field of def.type.fields ?? []) {
      const fieldVal = obj[field.name];
      if (fieldVal === undefined) {
        throw new Error(`Missing field "${field.name}" in ${def.name}`);
      }
      encodeJsonAsType(w, fieldVal, field.type, idl, `${path}.${field.name}`);
    }
    return;
  }
  if (def.type.kind === 'enum') {
    if (typeof payload !== 'object' || payload === null) {
      throw new Error(
        `Expected { variant: ... } for enum ${def.name} at ${path}`,
      );
    }
    const entries = Object.entries(payload as Record<string, unknown>);
    if (entries.length !== 1) {
      throw new Error(
        `Enum ${def.name} payload must have exactly one variant key`,
      );
    }
    const [variantName, variantPayload] = entries[0];
    const variants = def.type.variants ?? [];
    const idx = variants.findIndex((v) => v.name === variantName);
    if (idx < 0) {
      throw new Error(`Unknown variant "${variantName}" of ${def.name}`);
    }
    w.push(new Uint8Array([idx]));
    const variant = variants[idx];
    if (variant.fields && variant.fields.length > 0) {
      // Tuple-style: payload should be an array, struct-style: object.
      const fields = variant.fields;
      if (Array.isArray(variantPayload) && fields.length === variantPayload.length) {
        for (let i = 0; i < fields.length; i++) {
          encodeJsonAsType(
            w,
            variantPayload[i],
            fields[i].type,
            idl,
            `${path}.${variantName}[${i}]`,
          );
        }
      } else if (
        typeof variantPayload === 'object' &&
        variantPayload !== null &&
        !Array.isArray(variantPayload)
      ) {
        const inner = variantPayload as Record<string, unknown>;
        for (const f of fields) {
          if (inner[f.name] === undefined) {
            throw new Error(
              `Missing field "${f.name}" in enum variant ${def.name}::${variantName}`,
            );
          }
          encodeJsonAsType(
            w,
            inner[f.name],
            f.type,
            idl,
            `${path}.${variantName}.${f.name}`,
          );
        }
      } else {
        throw new Error(
          `Variant ${def.name}::${variantName} payload must be an object or array`,
        );
      }
    }
    return;
  }
  throw new Error(`Unknown IDL type kind for ${def.name}`);
};

/**
 * Encode a JSON value using only the IDL type expression (no `ArgValue`).
 * Used recursively from `encodeDefined`. We keep this in the same file
 * so the encoder is self-contained.
 */
const encodeJsonAsType = (
  w: Writer,
  value: unknown,
  type: string | ComplexType,
  idl: ArchIdl,
  path: string,
): void => {
  if (typeof type === 'string') {
    if (type === 'bool') {
      if (typeof value !== 'boolean') {
        throw new Error(`Expected boolean at ${path}`);
      }
      w.push(new Uint8Array([value ? 1 : 0]));
      return;
    }
    if (INT_BYTES[type]) {
      if (typeof value !== 'number' && typeof value !== 'string' && typeof value !== 'bigint') {
        throw new Error(`Expected integer at ${path}`);
      }
      w.push(encodeInteger(BigInt(value as number | string), type, INT_BYTES[type]));
      return;
    }
    if (type === 'string' || type === 'String') {
      if (typeof value !== 'string') throw new Error(`Expected string at ${path}`);
      const utf8 = new TextEncoder().encode(value);
      w.push(encodeInteger(BigInt(utf8.length), 'u32', 4));
      w.push(utf8);
      return;
    }
    if (type === 'pubkey' || type === 'Pubkey' || type === 'publicKey') {
      if (typeof value !== 'string') {
        throw new Error(`Expected base58/hex pubkey string at ${path}`);
      }
      const bytes = pubkeyStringToBytes(value);
      if (!bytes) throw new Error(`Invalid pubkey at ${path}: "${value}"`);
      w.push(bytes);
      return;
    }
    // Try to resolve as a defined type by name — this handles the
    // shorthand where the IDL uses `"defined"` directly without a
    // wrapper object.
    const def = idl.types.find((t) => t.name === type);
    if (def) {
      encodeDefined(w, value, def, idl, path);
      return;
    }
    throw new Error(`Unknown primitive type at ${path}: ${type}`);
  }
  if (type.option !== undefined) {
    if (value === null || value === undefined) {
      w.push(new Uint8Array([0]));
      return;
    }
    w.push(new Uint8Array([1]));
    encodeJsonAsType(w, value, type.option, idl, `${path}.Some`);
    return;
  }
  if (type.vec !== undefined) {
    if (!Array.isArray(value)) {
      throw new Error(`Expected array at ${path}`);
    }
    w.push(encodeInteger(BigInt(value.length), 'u32', 4));
    const inner = type.vec;
    for (let i = 0; i < value.length; i++) {
      encodeJsonAsType(w, value[i], inner as string | ComplexType, idl, `${path}[${i}]`);
    }
    return;
  }
  if (type.defined) {
    const def = idl.types.find((t) => t.name === type.defined);
    if (!def) throw new Error(`IDL type "${type.defined}" not found at ${path}`);
    encodeDefined(w, value, def, idl, path);
    return;
  }
  throw new Error(`Unsupported complex type at ${path}: ${describeType(type)}`);
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const encodeInteger = (value: bigint, type: string, len: number): Uint8Array => {
  let v = value;
  if (type.startsWith('i') && v < 0n) {
    v = (1n << BigInt(len * 8)) + v;
  }
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
};

const pubkeyStringToBytes = (input: string): Uint8Array | null => {
  const trimmed = input.trim();
  const hexCandidate = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
  if (/^[0-9a-fA-F]{64}$/.test(hexCandidate)) {
    const out = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      out[i] = parseInt(hexCandidate.substring(i * 2, i * 2 + 2), 16);
    }
    return out;
  }
  try {
    const decoded = bs58.decode(trimmed);
    if (decoded.length === 32) return new Uint8Array(decoded);
  } catch {
    /* fall through */
  }
  return null;
};

const describeType = (t: string | ComplexType): string => {
  if (typeof t === 'string') return t;
  if (t.option) return `Option<${describeType(t.option)}>`;
  if (t.vec !== undefined)
    return `Vec<${describeType(t.vec as string | ComplexType)}>`;
  if (t.defined) return t.defined;
  return JSON.stringify(t);
};
