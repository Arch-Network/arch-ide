import type {
  ArchIdl,
  ArchInstruction,
  ArchInstructionAccount,
  ArchAccountType,
  ArchTypeDefinition,
  ArchError,
  ComplexType,
  IdlSeed,
  IdlPda,
} from '../../types';

/**
 * Normalize the Anchor / arch-satellite-lang spec-0.1.0 IDL format into the
 * legacy shape our UI components consume (`ArchIdl`).
 *
 * The newer format (emitted by `arch-satellite-lang/idl-build` >= 0.30) differs
 * from the older one in several ways:
 *
 *   1. Program `name` and `version` moved from the top level into a
 *      `metadata: { name, version, spec }` object.
 *   2. Instruction accounts use `writable` / `signer` instead of
 *      `isMut` / `isSigner`.
 *   3. Top-level `accounts[]` entries are now just `{ name, discriminator }`;
 *      the actual struct definition lives under `types[]`. The legacy shape
 *      inlined the struct under `accounts[].type.fields`, so we fold the two
 *      lists back together here.
 *   4. Type expressions are tagged objects (`{"option": ...}`,
 *      `{"defined": {"name": "Foo"}}`) instead of Rust-source strings.
 *      We map them to our existing `ComplexType` discriminated record.
 *
 * The normalizer is intentionally non-destructive on already-old payloads:
 * if the input looks like legacy format (top-level `name`/`version`, no
 * `metadata` object), we pass it through untouched.
 */

const isObject = (v: unknown): v is Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v);

const looksLikeNewSpec = (raw: Record<string, unknown>): boolean => {
  // The presence of a `metadata` object with a `name` field is the
  // unambiguous signal. We don't rely on the `address` field because some
  // toolchains omit it for unpublished programs.
  return isObject(raw.metadata) && typeof (raw.metadata as { name?: unknown }).name === 'string';
};

/**
 * Convert a new-spec IdlType expression into our legacy `string | ComplexType`.
 *
 * Primitives serialize as lowercase strings (`"u64"`, `"pubkey"`) which our
 * renderer already understands, so they pass through unchanged.
 */
const convertType = (raw: unknown): string | ComplexType => {
  if (typeof raw === 'string') return raw;
  if (!isObject(raw)) return 'unknown';

  if ('option' in raw) {
    const inner = convertType(raw.option);
    // ComplexType.option is typed as ComplexType only; if the inner is a
    // string primitive we wrap it in a `{ defined }` shim purely so the type
    // checker is satisfied. The renderer treats both forms identically.
    return {
      option: typeof inner === 'string' ? ({ defined: inner } as ComplexType) : inner,
    };
  }
  if ('vec' in raw) {
    return { vec: convertType(raw.vec) };
  }
  if ('array' in raw) {
    const arr = raw.array as [unknown, unknown] | undefined;
    if (!arr || !Array.isArray(arr) || arr.length < 2) return 'unknown';
    const len =
      typeof arr[1] === 'number'
        ? arr[1]
        : isObject(arr[1]) && typeof (arr[1] as { value?: unknown }).value === 'number'
        ? ((arr[1] as { value: number }).value)
        : 0;
    // ComplexType doesn't formally declare `array` — the renderer reads it
    // via a runtime cast. We mirror that here for compatibility.
    return { array: [convertType(arr[0]), len] } as unknown as ComplexType;
  }
  if ('defined' in raw) {
    const d = raw.defined;
    if (typeof d === 'string') return { defined: d };
    if (isObject(d) && typeof d.name === 'string') {
      // We discard `generics: [...]` for now — round-trip type substitution
      // is a future enhancement; Anchor's reference UI also renders the
      // generic-erased name first.
      return { defined: d.name };
    }
    return 'unknown';
  }
  if ('generic' in raw && typeof raw.generic === 'string') {
    // Generic params surface in the renderer as bare type-parameter names.
    return raw.generic;
  }
  return 'unknown';
};

/**
 * Render an IdlType as a plain string. Used for shapes (like account fields)
 * where the legacy `ArchIdl` schema mandates `type: string` rather than
 * accepting a `ComplexType`. We mirror what `typeRender.renderType` would
 * produce so the displayed text stays consistent across the UI.
 */
const stringifyType = (raw: unknown): string => {
  const ct = convertType(raw);
  if (typeof ct === 'string') return ct;
  if (ct.option) {
    const inner = ct.option as ComplexType | string;
    return `Option<${typeof inner === 'string' ? inner : stringifyComplex(inner)}>`;
  }
  if (ct.vec !== undefined) {
    return `Vec<${typeof ct.vec === 'string' ? ct.vec : stringifyComplex(ct.vec)}>`;
  }
  if ((ct as { array?: unknown }).array) {
    const arr = (ct as unknown as { array: [string | ComplexType, number] }).array;
    return `[${typeof arr[0] === 'string' ? arr[0] : stringifyComplex(arr[0])}; ${arr[1]}]`;
  }
  if (ct.defined) return ct.defined;
  return 'unknown';
};

const stringifyComplex = (ct: ComplexType): string => stringifyType(ct);

/**
 * Convert a single spec-0.1.0 PDA seed entry. Unknown shapes return `null`
 * which the PDA derivation step treats as "unresolvable, render manual
 * input as the fallback."
 */
const convertSeed = (raw: unknown): IdlSeed | null => {
  if (!isObject(raw)) return null;
  const kind = raw.kind;
  if (kind === 'const') {
    const value = (raw as { value?: unknown }).value;
    if (!Array.isArray(value)) return null;
    return {
      kind: 'const',
      value: value.filter((v): v is number => typeof v === 'number'),
    };
  }
  if (kind === 'arg' || kind === 'account') {
    const path = (raw as { path?: unknown }).path;
    if (typeof path !== 'string') return null;
    if (kind === 'account') {
      const acc = (raw as { account?: unknown }).account;
      return {
        kind: 'account',
        path,
        ...(typeof acc === 'string' ? { account: acc } : {}),
      };
    }
    return { kind: 'arg', path };
  }
  return null;
};

const convertPda = (raw: unknown): IdlPda | undefined => {
  if (!isObject(raw)) return undefined;
  const seedsRaw = (raw as { seeds?: unknown }).seeds;
  if (!Array.isArray(seedsRaw)) return undefined;
  const seeds = seedsRaw
    .map(convertSeed)
    .filter((s): s is IdlSeed => s !== null);
  if (seeds.length === 0) return undefined;
  const programSeed = convertSeed((raw as { program?: unknown }).program);
  return {
    seeds,
    ...(programSeed ? { program: programSeed } : {}),
  };
};

/**
 * `IdlInstructionAccountItem` can be either a single account or a composite
 * group (e.g. `Box<MyContext>` or `Accounts` re-use). We flatten composites
 * into their leaf accounts so the UI doesn't need to recurse — composite
 * names are folded into the leaf's display name.
 *
 * For each leaf, we preserve every spec-0.1.0 field that the form needs to
 * skip user input: `address` (fixed pubkey), `pda` (derive on the fly),
 * `optional`, and `relations`.
 */
const flattenInstructionAccounts = (raw: unknown): ArchInstructionAccount[] => {
  if (!Array.isArray(raw)) return [];
  const out: ArchInstructionAccount[] = [];
  const walk = (entries: unknown[], prefix: string) => {
    for (const entry of entries) {
      if (!isObject(entry)) continue;
      if (Array.isArray(entry.accounts)) {
        const groupName = typeof entry.name === 'string' ? entry.name : '';
        const nextPrefix = prefix ? `${prefix}.${groupName}` : groupName;
        walk(entry.accounts as unknown[], nextPrefix);
        continue;
      }
      const name = typeof entry.name === 'string' ? entry.name : 'unnamed';
      const acc: ArchInstructionAccount = {
        name: prefix ? `${prefix}.${name}` : name,
        isMut: Boolean(entry.writable ?? entry.isMut ?? false),
        isSigner: Boolean(entry.signer ?? entry.isSigner ?? false),
      };
      if (typeof entry.address === 'string') acc.address = entry.address;
      const pda = convertPda(entry.pda);
      if (pda) acc.pda = pda;
      if (entry.optional === true) acc.optional = true;
      if (Array.isArray(entry.relations) && entry.relations.length > 0) {
        acc.relations = entry.relations.filter((r): r is string => typeof r === 'string');
      }
      out.push(acc);
    }
  };
  walk(raw as unknown[], '');
  return out;
};

const convertInstruction = (raw: unknown): ArchInstruction | null => {
  if (!isObject(raw) || typeof raw.name !== 'string') return null;
  const args = Array.isArray(raw.args)
    ? raw.args
        .filter(isObject)
        .map((a) => ({
          name: typeof a.name === 'string' ? a.name : 'arg',
          type: convertType((a as { type?: unknown }).type),
        }))
    : [];
  const ix: ArchInstruction = {
    name: raw.name,
    accounts: flattenInstructionAccounts(raw.accounts),
    args,
  };
  // Preserve the 8-byte discriminator so the encoder can use it directly
  // instead of recomputing the sighash. spec-0.1.0 emits this verbatim.
  if (Array.isArray(raw.discriminator)) {
    const disc = raw.discriminator.filter(
      (n): n is number => typeof n === 'number',
    );
    if (disc.length > 0) ix.discriminator = disc;
  }
  return ix;
};

const convertTypeDefinition = (raw: unknown): ArchTypeDefinition | null => {
  if (!isObject(raw) || typeof raw.name !== 'string' || !isObject(raw.type)) return null;
  const t = raw.type as Record<string, unknown>;
  const kind = t.kind;

  if (kind === 'struct') {
    return {
      name: raw.name,
      type: {
        kind: 'struct',
        fields: extractNamedFields(t.fields),
      },
    };
  }
  if (kind === 'enum') {
    const variants = Array.isArray(t.variants)
      ? t.variants.filter(isObject).map((v) => ({
          name: typeof v.name === 'string' ? v.name : 'variant',
          fields: v.fields
            ? extractNamedFields(v.fields).map((f) => ({ name: f.name, type: f.type as string }))
            : undefined,
        }))
      : [];
    return {
      name: raw.name,
      type: { kind: 'enum', variants },
    };
  }
  // `kind: "type"` (alias) and unknown kinds: surface as a struct with a
  // single synthetic field so it's at least visible in the Overview tab.
  return null;
};

/**
 * Extract `[{ name, type }]` pairs from new-spec `IdlDefinedFields`, which is
 * either `Named(Vec<IdlField>)` (an array of `{ name, type }`) or
 * `Tuple(Vec<IdlType>)` (a bare array of types). We synthesize positional
 * names (`field0`, `field1`, …) for the tuple case so the legacy schema
 * stays satisfied.
 */
const extractNamedFields = (
  fields: unknown,
): { name: string; type: string }[] => {
  if (!Array.isArray(fields)) return [];
  if (fields.length === 0) return [];
  const looksNamed = isObject(fields[0]) && 'name' in (fields[0] as object);
  if (looksNamed) {
    return fields.filter(isObject).map((f) => ({
      name: typeof f.name === 'string' ? f.name : 'field',
      type: stringifyType((f as { type?: unknown }).type),
    }));
  }
  return fields.map((t, i) => ({ name: `field${i}`, type: stringifyType(t) }));
};

/**
 * Stitch top-level `accounts[]` (which in the new spec only carry
 * `{ name, discriminator }`) with their corresponding entry in `types[]`
 * (which carries the actual struct fields). The legacy `ArchAccountType`
 * shape inlines the struct, which is what every downstream consumer expects.
 */
const joinAccountsWithTypes = (
  accounts: unknown,
  typeDefs: ArchTypeDefinition[],
): ArchAccountType[] => {
  if (!Array.isArray(accounts)) return [];
  const byName = new Map(typeDefs.map((t) => [t.name, t] as const));
  const out: ArchAccountType[] = [];
  for (const entry of accounts) {
    if (!isObject(entry) || typeof entry.name !== 'string') continue;
    const def = byName.get(entry.name);
    const fields =
      def && def.type.kind === 'struct' && def.type.fields
        ? def.type.fields.map((f) => ({
            name: f.name,
            // ArchAccountType pins `type: string`. ComplexType field types
            // get stringified for display; the struct decoder will skip
            // anything it can't size, which is acceptable degradation.
            type: typeof f.type === 'string' ? f.type : stringifyComplex(f.type),
          }))
        : [];
    out.push({
      name: entry.name,
      type: { kind: 'struct', fields },
    });
  }
  return out;
};

const convertErrors = (raw: unknown): ArchError[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isObject)
    .filter((e) => typeof e.code === 'number' && typeof e.name === 'string')
    .map((e) => ({
      code: e.code as number,
      name: e.name as string,
      // New spec emits `msg: Option<String>`; legacy expects always-present.
      msg: typeof e.msg === 'string' ? e.msg : '',
    }));
};

/**
 * Convert a parsed JSON value (any spec) to our legacy `ArchIdl` shape.
 * Returns `null` if the input is so malformed we can't extract a name and
 * version — the caller (validateIdl) will surface a friendly error.
 */
export const normalizeToLegacyIdl = (raw: unknown): ArchIdl | null => {
  if (!isObject(raw)) return null;

  // Legacy format: pass through with array coercion. We still defensively
  // map missing fields to `[]` so consumers don't have to null-check.
  if (!looksLikeNewSpec(raw)) {
    if (typeof raw.name !== 'string' || typeof raw.version !== 'string') return null;
    return {
      name: raw.name,
      version: raw.version,
      instructions: (raw.instructions as ArchInstruction[]) ?? [],
      accounts: (raw.accounts as ArchAccountType[]) ?? [],
      types: (raw.types as ArchTypeDefinition[]) ?? [],
      errors: (raw.errors as ArchError[]) ?? [],
    };
  }

  // New spec path.
  const meta = raw.metadata as { name: string; version?: unknown };
  const version = typeof meta.version === 'string' ? meta.version : '0.0.0';

  const types = Array.isArray(raw.types)
    ? raw.types
        .map(convertTypeDefinition)
        .filter((t): t is ArchTypeDefinition => t !== null)
    : [];

  const accounts = joinAccountsWithTypes(raw.accounts, types);

  const instructions = Array.isArray(raw.instructions)
    ? raw.instructions
        .map(convertInstruction)
        .filter((i): i is ArchInstruction => i !== null)
    : [];

  return {
    name: meta.name,
    version,
    instructions,
    accounts,
    types,
    errors: convertErrors(raw.errors),
  };
};
