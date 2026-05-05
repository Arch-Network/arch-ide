import { Buffer } from 'buffer/';
import bs58 from 'bs58';
import {
  RpcConnection,
  MessageUtil,
  type Instruction,
  type Message,
  type RuntimeTransaction,
  type AccountMeta,
} from '@arch-network/arch-sdk';
import { signMessage } from '../bitcoin-signer';
import { getSmartRpcUrl } from '../smartRpcConnection';
import { hexToBase58 } from '../base58';
import { encodeInstructionData } from './encode';
import { derivePda, buildAccountValueMap, buildArgTypeMap } from './derivePda';
import { lookupWellKnown, SYSTEM_PROGRAM_BASE58 } from './wellKnown';
import type {
  ArchIdl,
  ArchInstruction,
  Project,
  ProjectAccount,
} from '../../types';
import type { ArgValue } from '../../components/ProgramInspector/argValue';

/**
 * Inputs the form provides to the submit pipeline. We deliberately
 * pass *parsed* `argValues` rather than raw strings so the encoder
 * doesn't have to re-validate; the form has already done that work.
 */
export interface SubmitContext {
  rpcUrl: string;
  network: 'mainnet' | 'testnet' | 'devnet';
  idl: ArchIdl;
  instruction: ArchInstruction;
  /** Per-account form values (manual entries; PDAs/addresses come from the IDL). */
  accountValues: Record<string, string>;
  argValues: Record<string, ArgValue>;
  project: Project;
}

/**
 * The result of an attempted submission. `txid` is set on success;
 * `errors` accumulates fatal problems so the caller can render every
 * issue without re-running the pipeline.
 */
export interface SubmitResult {
  ok: boolean;
  txid?: string;
  errors: string[];
  /** The encoded instruction buffer, surfaced for inspection / replay. */
  encodedDataHex?: string;
  /** Resolved account metas in declared order, surfaced for review. */
  accounts?: { name: string; pubkey: string; isSigner: boolean; isMut: boolean }[];
}

/**
 * Build, sign, and submit an instruction described by the IDL form.
 *
 * The pipeline is intentionally linear and synchronous-feeling so
 * callers can render each phase as a discrete UI step:
 *
 *   1. Resolve every account → 32-byte pubkey
 *   2. Encode args → instruction data buffer
 *   3. Build `Message` (signers list = unique signer pubkeys)
 *   4. Hash the message and sign it (BIP-322, raw 64-byte schnorr)
 *   5. Submit → return txid
 *
 * Multi-signer programs work as long as each signer pubkey resolves to
 * a keypair we control (project authority or saved keypair). Wallet
 * signing is intentionally deferred (wallets emit BIP-322 base64
 * envelopes that need extraction; punting that to the next slice keeps
 * this one shippable).
 */
export const submitInstruction = async (
  ctx: SubmitContext,
): Promise<SubmitResult> => {
  const errors: string[] = [];

  if (!ctx.project.account?.pubkey) {
    return {
      ok: false,
      errors: ['Deploy the program first — its on-chain pubkey is required to invoke instructions.'],
    };
  }
  const programIdHex = ctx.project.account.pubkey;
  const programIdBytes = hexToBytes(programIdHex);

  // 1) Resolve every account in declared order.
  const resolved = resolveAccountMetas(ctx, errors);
  if (errors.length > 0) return { ok: false, errors };

  // 2) Encode args into the instruction data buffer.
  const enc = encodeInstructionData(ctx.instruction, ctx.argValues, ctx.idl);
  if (enc.errors.length > 0) {
    return { ok: false, errors: enc.errors };
  }

  const instruction: Instruction = {
    program_id: programIdBytes,
    accounts: resolved.metas,
    data: enc.bytes,
  };

  // 3) Resolve signers — every signer-flagged account must map to a
  //    keypair we hold. We deduplicate by pubkey because the runtime
  //    only includes each signer once in the message.
  const signersResolved = resolveSigners(resolved.metas, ctx.project, errors);
  if (errors.length > 0) {
    return {
      ok: false,
      errors,
      encodedDataHex: bytesToHex(enc.bytes),
      accounts: resolved.summary,
    };
  }

  // 4) Build & sign the message.
  const message: Message = {
    signers: signersResolved.map((s) => Buffer.from(s.pubkey)) as unknown as Uint8Array[],
    instructions: [instruction],
  };
  const messageHash = MessageUtil.hash(message);
  let signatures: Uint8Array[];
  try {
    signatures = await Promise.all(
      signersResolved.map(async (s) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sig = await (signMessage as any)(
          Buffer.from(s.privkey),
          Buffer.from(messageHash),
        );
        return new Uint8Array(sig);
      }),
    );
  } catch (e) {
    return {
      ok: false,
      errors: [`Signing failed: ${e instanceof Error ? e.message : String(e)}`],
      encodedDataHex: bytesToHex(enc.bytes),
      accounts: resolved.summary,
    };
  }

  // 5) Submit to the RPC. We wrap the SDK call in our smart-URL helper
  //    so devnet/testnet/regtest all resolve correctly.
  const rpcUrl = getSmartRpcUrl(ctx.rpcUrl);
  const tx: RuntimeTransaction = {
    version: 0,
    signatures: signatures as unknown as RuntimeTransaction['signatures'],
    // The SDK's `RuntimeTransaction` types `message` as `SanitizedMessage`,
    // but the runtime accepts the un-sanitized `Message` shape (the
    // existing `arch-program-loader` does the same thing). We stay
    // honest about the cast so future readers don't try to "fix" it.
    message: message as unknown as RuntimeTransaction['message'],
  };

  try {
    const connection = new RpcConnection(rpcUrl);
    const txid = await connection.sendTransaction(tx);
    return {
      ok: true,
      txid,
      errors: [],
      encodedDataHex: bytesToHex(enc.bytes),
      accounts: resolved.summary,
    };
  } catch (e) {
    return {
      ok: false,
      errors: [`Submit failed: ${e instanceof Error ? e.message : String(e)}`],
      encodedDataHex: bytesToHex(enc.bytes),
      accounts: resolved.summary,
    };
  }
};

// ─── Account resolution ─────────────────────────────────────────────────────

interface ResolvedAccounts {
  metas: AccountMeta[];
  summary: SubmitResult['accounts'];
}

const resolveAccountMetas = (
  ctx: SubmitContext,
  errors: string[],
): ResolvedAccounts => {
  const metas: AccountMeta[] = [];
  const summary: SubmitResult['accounts'] = [];
  const programIdHex = ctx.project.account!.pubkey;

  // Pre-build the cross-account map so PDAs that reference each other
  // resolve in one pass. We also include `address`-constrained accounts
  // here because `derivePda` may read them as seeds.
  const accountValuesForPda = buildAccountValueMap(
    ctx.instruction,
    {
      ...ctx.accountValues,
      // Augment with addresses the IDL pinned for us so seeds of
      // `kind: 'account'` resolve even when the user never typed them.
      ...Object.fromEntries(
        ctx.instruction.accounts
          .filter((a) => a.address)
          .map((a) => [a.name, a.address!]),
      ),
    },
  );
  const flattenedArgs = flattenArgValues(ctx.argValues);
  const argTypes = buildArgTypeMap(ctx.instruction);

  for (const acc of ctx.instruction.accounts) {
    let pubkey: Uint8Array | null = null;

    if (acc.address) {
      pubkey = pubkeyStringToBytes(acc.address);
      if (!pubkey) {
        errors.push(`IDL address for "${acc.name}" is malformed: ${acc.address}`);
        continue;
      }
    } else if (acc.pda) {
      const result = derivePda(acc.pda, {
        programIdHex,
        accountValues: accountValuesForPda,
        argValues: flattenedArgs,
        argTypes,
      });
      if (result.kind !== 'derived') {
        errors.push(
          result.kind === 'pending'
            ? `PDA "${acc.name}" needs ${result.missing.join(', ')}`
            : `PDA "${acc.name}" derivation failed: ${result.reason}`,
        );
        continue;
      }
      pubkey = hexToBytes(result.hex);
    } else {
      const value = ctx.accountValues[acc.name]?.trim();
      if (!value) {
        if (acc.optional) {
          // Optional and unfilled → skip entirely. Anchor / satellite
          // recognize the omission via account count, not sentinel
          // pubkeys, so we just don't push a meta.
          continue;
        }
        errors.push(`Account "${acc.name}" is required.`);
        continue;
      }
      pubkey = pubkeyStringToBytes(value);
      if (!pubkey) {
        errors.push(`Account "${acc.name}" is not a valid pubkey: ${value}`);
        continue;
      }
    }

    metas.push({
      pubkey,
      is_signer: acc.isSigner,
      is_writable: acc.isMut,
    });
    summary.push({
      name: acc.name,
      pubkey: bs58.encode(pubkey),
      isSigner: acc.isSigner,
      isMut: acc.isMut,
    });
  }

  return { metas, summary };
};

// ─── Signer resolution ──────────────────────────────────────────────────────

interface ResolvedSigner {
  pubkey: Uint8Array;
  privkey: Uint8Array;
  source: 'authority' | 'saved-keypair';
}

const resolveSigners = (
  metas: AccountMeta[],
  project: Project,
  errors: string[],
): ResolvedSigner[] => {
  const signerMetas = metas.filter((m) => m.is_signer);
  if (signerMetas.length === 0) return [];

  // Build a lookup of pubkey-base58 → keypair for everything we hold.
  const keypairsByPubkey = new Map<string, { account: ProjectAccount; source: ResolvedSigner['source'] }>();
  if (project.authorityAccount?.pubkey) {
    const b58 = hexToBase58(project.authorityAccount.pubkey);
    keypairsByPubkey.set(b58, {
      account: project.authorityAccount,
      source: 'authority',
    });
  }
  for (const kp of project.savedKeypairs ?? []) {
    keypairsByPubkey.set(hexToBase58(kp.account.pubkey), {
      account: kp.account,
      source: 'saved-keypair',
    });
  }

  const seen = new Set<string>();
  const signers: ResolvedSigner[] = [];
  for (const meta of signerMetas) {
    const b58 = bs58.encode(meta.pubkey);
    if (seen.has(b58)) continue;
    seen.add(b58);

    // Skip well-known programs that happen to be flagged as signers
    // (this is rare but possible with init-style accounts).
    if (lookupWellKnown(b58)?.hideInForm) continue;
    if (b58 === SYSTEM_PROGRAM_BASE58) continue;

    const match = keypairsByPubkey.get(b58);
    if (!match) {
      errors.push(
        `Cannot sign for "${b58}" — no matching keypair (authority or saved). Wallet signing lands in the next slice.`,
      );
      continue;
    }
    signers.push({
      pubkey: meta.pubkey,
      privkey: hexToBytes(match.account.privkey),
      source: match.source,
    });
  }
  return signers;
};

// ─── Helpers ────────────────────────────────────────────────────────────────

const flattenArgValues = (values: Record<string, ArgValue>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const [name, v] of Object.entries(values)) {
    switch (v.kind) {
      case 'bool': out[name] = v.value; break;
      case 'integer': out[name] = v.value; break;
      case 'string': out[name] = v.value; break;
      case 'pubkey': out[name] = v.raw; break;
      case 'bytes': out[name] = v.bytes; break;
      case 'option': out[name] = v.present ? v.inner : undefined; break;
      case 'json': out[name] = v.value; break;
    }
  }
  return out;
};

const hexToBytes = (hex: string): Uint8Array => {
  const cleaned = hex.startsWith('0x') ? hex.slice(2) : hex;
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

const pubkeyStringToBytes = (input: string): Uint8Array | null => {
  const trimmed = input.trim();
  const hexCandidate = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
  if (/^[0-9a-fA-F]{64}$/.test(hexCandidate)) {
    return hexToBytes(hexCandidate);
  }
  try {
    const decoded = bs58.decode(trimmed);
    if (decoded.length === 32) return new Uint8Array(decoded);
  } catch {
    /* fall through */
  }
  return null;
};

// Re-export for convenience so the InvokeTab can build a deep link
// without re-importing the well-known constant directly.
export { SYSTEM_PROGRAM_BASE58 };
