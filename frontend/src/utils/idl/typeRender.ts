import type { ComplexType } from '../../types';

/**
 * Pretty-print an IDL type (string or `ComplexType`) into the Rust-ish
 * notation developers expect: `Option<u64>`, `Vec<Pubkey>`, `(u8, u8)`, etc.
 *
 * We deliberately use Rust-style angle brackets even though the on-disk
 * IDL uses Anchor's verbose `{ option: { ... } }` form — devs read these
 * fields against their Rust source, so matching that idiom reduces friction.
 */
export const renderType = (type: string | ComplexType): string => {
  if (typeof type === 'string') return type;
  if (!type || typeof type !== 'object') return 'unknown';

  if (type.option !== undefined) return `Option<${renderType(type.option)}>`;
  if (type.vec !== undefined) {
    const inner = typeof type.vec === 'string' ? type.vec : renderType(type.vec);
    return `Vec<${inner}>`;
  }
  if (type.tuple !== undefined) {
    return `(${type.tuple.map(renderType).join(', ')})`;
  }
  if (type.defined !== undefined) return type.defined;
  if ((type as { array?: unknown }).array !== undefined) {
    const arr = (type as unknown as { array: [string | ComplexType, number] }).array;
    return `[${renderType(arr[0])}; ${arr[1]}]`;
  }
  return 'unknown';
};

/**
 * Returns the byte size of a primitive type, or `undefined` for variable /
 * non-trivial types (Vec, Option, defined types). Used by the account
 * decoder to know how far to advance through raw bytes.
 */
export const sizeOfPrimitive = (type: string): number | undefined => {
  switch (type) {
    case 'u8':
    case 'i8':
    case 'bool':
      return 1;
    case 'u16':
    case 'i16':
      return 2;
    case 'u32':
    case 'i32':
    case 'f32':
      return 4;
    case 'u64':
    case 'i64':
    case 'f64':
      return 8;
    case 'u128':
    case 'i128':
      return 16;
    case 'publicKey':
    case 'pubkey':
    case 'Pubkey':
      return 32;
    default:
      return undefined;
  }
};
