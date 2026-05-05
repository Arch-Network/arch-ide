import { Buffer } from 'buffer/';
import bs58 from 'bs58';
import {
  RpcConnection,
  MessageUtil,
  SignatureUtil,
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
 * Signing capability provided by an externally-controlled wallet
 * (Unisat / Xverse, etc.).
 *
 * The wallet only owns *one* keypair, so we identify it by the
 * 32-byte x-only pubkey and ignore any signer requests that don't
 * match. The IDE does not have access to the private key — instead
 * the wallet returns a BIP-322-simple base64 envelope for a given
 * message hash, which we decode into a 64-byte schnorr signature.
 */
export interface WalletSigner {
  /** 32-byte x-only pubkey, hex-encoded (matches Arch on-chain pubkey). */
  pubkeyHex: string;
  /** Display label e.g. "Unisat", "Xverse" — surfaced in error messages. */
  label: string;
  /**
   * Sign the given message hash via the wallet. Implementations should
   * pass the hex-encoded hash to the wallet's `signMessage(... ,
   * 'bip322-simple')` and return the wallet's base64 response
   * unchanged. We handle decoding/normalization here.
   */
  signHashHex: (hashHex: string) => Promise<string>;
}

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
  /**
   * Optional connected Bitcoin wallet that can sign for one
   * additional pubkey. We keep this strictly optional so the form
   * still works with just the project authority + saved keypairs.
   */
  walletSigner?: WalletSigner;
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

  // 3) Resolve signers — every signer-flagged account must map to
  //    either a keypair we hold *or* the connected wallet's pubkey.
  //    We deduplicate by pubkey because the runtime only includes
  //    each signer once in the message.
  const signersResolved = resolveSigners(
    resolved.metas,
    ctx.project,
    ctx.walletSigner,
    errors,
  );
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
    signatures = await signAllMessages(signersResolved, messageHash);
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

/**
 * A signer slot the pipeline knows how to fulfill.
 *
 * The discriminated `kind` lets the signing loop dispatch on source
 * without leaking wallet- vs keypair-specific details into the
 * resolution code; resolution only decides *who* signs, not *how*.
 */
type ResolvedSigner =
  | {
      kind: 'keypair';
      pubkey: Uint8Array;
      privkey: Uint8Array;
      source: 'authority' | 'saved-keypair';
    }
  | {
      kind: 'wallet';
      pubkey: Uint8Array;
      walletSigner: WalletSigner;
    };

const resolveSigners = (
  metas: AccountMeta[],
  project: Project,
  walletSigner: WalletSigner | undefined,
  errors: string[],
): ResolvedSigner[] => {
  const signerMetas = metas.filter((m) => m.is_signer);
  if (signerMetas.length === 0) return [];

  // Build a lookup of pubkey-base58 → keypair for everything we hold.
  const keypairsByPubkey = new Map<
    string,
    { account: ProjectAccount; source: 'authority' | 'saved-keypair' }
  >();
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

  const walletPubkeyBase58 = walletSigner
    ? hexToBase58(walletSigner.pubkeyHex)
    : null;

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

    const keypairMatch = keypairsByPubkey.get(b58);
    if (keypairMatch) {
      signers.push({
        kind: 'keypair',
        pubkey: meta.pubkey,
        privkey: hexToBytes(keypairMatch.account.privkey),
        source: keypairMatch.source,
      });
      continue;
    }

    if (walletSigner && walletPubkeyBase58 === b58) {
      signers.push({
        kind: 'wallet',
        pubkey: meta.pubkey,
        walletSigner,
      });
      continue;
    }

    errors.push(
      `Cannot sign for "${b58}" — no matching keypair (authority, saved, or connected wallet).`,
    );
  }
  return signers;
};

// ─── Signing ────────────────────────────────────────────────────────────────

/**
 * Sign one message hash for every resolved signer.
 *
 * Keypair signers run in parallel (they're CPU-bound BIP-322 ops);
 * wallet signers run sequentially because most extension wallets
 * only allow one in-flight prompt at a time and parallel calls just
 * surface confusing UX. This serial-for-wallet / parallel-for-rest
 * mix is intentional.
 */
const signAllMessages = async (
  signers: ResolvedSigner[],
  messageHash: Uint8Array,
): Promise<Uint8Array[]> => {
  const out: Uint8Array[] = new Array(signers.length);

  // Kick off all keypair signs concurrently.
  const keypairWork = signers.map(async (s, i) => {
    if (s.kind !== 'keypair') return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sig = await (signMessage as any)(
      Buffer.from(s.privkey),
      Buffer.from(messageHash),
    );
    out[i] = new Uint8Array(sig);
  });
  await Promise.all(keypairWork);

  // Then walk wallet slots one at a time. Most prompts can only show
  // one window at a time and back-to-back popups feel jarring; users
  // see a clear sequence ("approve in Unisat" → "approve next…").
  const hashHex = bytesToHex(messageHash);
  for (let i = 0; i < signers.length; i++) {
    const s = signers[i];
    if (s.kind !== 'wallet') continue;
    out[i] = await signWithWallet(s.walletSigner, hashHex);
  }

  return out;
};

/**
 * Translate a wallet's BIP-322-simple base64 envelope into a 64-byte
 * schnorr signature suitable for an Arch transaction.
 *
 * BIP-322 wallets typically return a base64 string whose decoded
 * form is either:
 *   - 64 bytes — the raw schnorr signature, or
 *   - 65 bytes — schnorr + a trailing sighash/recovery byte we drop.
 *
 * We then call `SignatureUtil.adjustSignature` to apply Arch's
 * canonicalization. Errors include the wallet label so the user
 * sees "Unisat refused…" rather than a generic failure.
 */
const signWithWallet = async (
  wallet: WalletSigner,
  hashHex: string,
): Promise<Uint8Array> => {
  let raw: string;
  try {
    raw = await wallet.signHashHex(hashHex);
  } catch (e) {
    throw new Error(
      `${wallet.label} signing rejected: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }
  let sig = base64ToBytes(raw);
  if (sig.length === 65) sig = sig.slice(0, 64);
  if (sig.length !== 64) {
    throw new Error(
      `${wallet.label} returned an unexpected ${sig.length}-byte signature; expected 64.`,
    );
  }
  try {
    sig = SignatureUtil.adjustSignature(sig);
  } catch {
    // adjustSignature is a best-effort canonicalization; if it
    // fails we ship the raw signature and let the runtime decide.
  }
  return sig;
};

const base64ToBytes = (b64: string): Uint8Array => {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
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
