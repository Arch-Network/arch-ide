// Inline satellite-framework versions of the Home-tab demo programs.
//
// The native versions of these examples are fetched live from
// https://github.com/Arch-Network/arch-examples — but that repo only ships
// pure `arch_program` source. Satellite-framework variants don't exist
// upstream, so we hand-author them here. Each example mirrors the *intent*
// of its native counterpart while leaning on satellite's macros
// (`#[program]`, `#[derive(Accounts)]`, `#[account]`) to make the program
// shape idiomatic for users picking the satellite track.
//
// Cargo.toml is intentionally omitted: the build server synthesizes the
// satellite Cargo.toml (with `arch-satellite-lang` etc.) when the project's
// `framework` is set to `'satellite'`.

import type { ProjectFramework } from '../types';
import { ADVANCED_SATELLITE_EXAMPLES } from './satelliteAdvancedExamples';

// ─── helloworld ───────────────────────────────────────────────────────────
const HELLOWORLD_LIB_RS = `use arch_satellite_lang::prelude::*;

declare_id!("1111111111111111111111111111111111111111111111111111111111111111");

/// A minimal Satellite program: greet a user by name and store the result
/// in a PDA-derived account they own.
#[program]
pub mod helloworld {
    use super::*;

    pub fn say_hello(ctx: Context<SayHello>, name: String) -> Result<()> {
        let greeting = &mut ctx.accounts.greeting;
        greeting.message = format!("Hello {}", name);
        greeting.author = ctx.accounts.user.key();
        msg!("Greeting set to: {}", greeting.message);
        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(name: String)]
pub struct SayHello<'info> {
    /// PDA per-user, init-if-needed so re-running just overwrites the message.
    /// space = discriminator(8) + author(32) + 4-byte string len + 256 bytes
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + 32 + 4 + 256,
        seeds = [b"greeting", user.key().as_ref()],
        bump
    )]
    pub greeting: Account<'info, Greeting>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct Greeting {
    pub author: Pubkey,
    pub message: String,
}
`;

const HELLOWORLD_CLIENT_TS = `// Satellite Hello World client.
// Calls the program's \`say_hello\` instruction, which derives a PDA per
// signer, initializes it on first call, and writes "Hello {name}".

console.log("=== Satellite Hello World ===\\n");

const PROGRAM_ID_HEX = "YOUR_PROGRAM_ID_HERE";
if (PROGRAM_ID_HEX === "YOUR_PROGRAM_ID_HERE") {
  console.log("⚠️  Build & deploy first, then paste the program ID above.");
  throw new Error("Please set PROGRAM_ID_HEX");
}

const conn = new RpcConnection("https://rpc.testnet.arch.network");
console.log("Connected. Block:", await conn.getBlockCount());

const { accountPubkey, useWallet } = await ClientTransactionUtil.setupAccount(conn);
await new Promise(r => setTimeout(r, 1500));

const programPubkey = PubkeyUtil.fromHex(PROGRAM_ID_HEX);
const [greetingPubkey] = PubkeyUtil.findProgramAddress(
  [new TextEncoder().encode("greeting"), accountPubkey],
  programPubkey
);

console.log("Greeting PDA:", toBase58(greetingPubkey));

// Satellite discriminator = first 8 bytes of sha256("global:say_hello")
async function disc(name) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("global:" + name));
  return new Uint8Array(buf).slice(0, 8);
}
const sayHello = await disc("say_hello");

// Borsh-encode the \`name: String\` arg (4-byte LE length prefix + bytes)
const nameStr = "Arch Developer";
const nameBytes = new TextEncoder().encode(nameStr);
const nameLen = new Uint8Array(4);
new DataView(nameLen.buffer).setUint32(0, nameBytes.length, true);

const data = new Uint8Array(sayHello.length + nameLen.length + nameBytes.length);
data.set(sayHello, 0);
data.set(nameLen, sayHello.length);
data.set(nameBytes, sayHello.length + nameLen.length);

const instruction = {
  program_id: programPubkey,
  accounts: [
    { pubkey: greetingPubkey, is_signer: false, is_writable: true },
    { pubkey: accountPubkey,  is_signer: true,  is_writable: true },
    { pubkey: PubkeyUtil.systemProgram(), is_signer: false, is_writable: false },
  ],
  data,
};

const txid = await ClientTransactionUtil.signAndSendTransaction(
  conn,
  { signers: [accountPubkey], instructions: [instruction] },
  useWallet
);
console.log("✅ Tx:", txid);

// Read back the greeting (skip 8-byte discriminator + 32-byte author + 4-byte len)
await new Promise(r => setTimeout(r, 2000));
const info = await conn.readAccountInfo(greetingPubkey);
if (info?.data && info.data.length >= 44) {
  const len = new DataView(info.data.buffer, info.data.byteOffset + 40, 4).getUint32(0, true);
  const msg = new TextDecoder().decode(info.data.slice(44, 44 + len));
  console.log("📝 Greeting:", msg);
}
`;

// ─── counter ──────────────────────────────────────────────────────────────
const COUNTER_LIB_RS = `use arch_satellite_lang::prelude::*;

declare_id!("1111111111111111111111111111111111111111111111111111111111111111");

/// Per-user counter PDA with init / increment / decrement / reset.
#[program]
pub mod counter {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let counter = &mut ctx.accounts.counter;
        counter.count = 0;
        counter.authority = ctx.accounts.user.key();
        msg!("Counter initialized for {}", counter.authority);
        Ok(())
    }

    pub fn increment(ctx: Context<Update>) -> Result<()> {
        let counter = &mut ctx.accounts.counter;
        counter.count = counter.count.saturating_add(1);
        msg!("Counter = {}", counter.count);
        Ok(())
    }

    pub fn decrement(ctx: Context<Update>) -> Result<()> {
        let counter = &mut ctx.accounts.counter;
        counter.count = counter.count.saturating_sub(1);
        msg!("Counter = {}", counter.count);
        Ok(())
    }

    pub fn reset(ctx: Context<Update>) -> Result<()> {
        let counter = &mut ctx.accounts.counter;
        require_keys_eq!(counter.authority, ctx.accounts.user.key());
        counter.count = 0;
        msg!("Counter reset");
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = user,
        space = 8 + 8 + 32,
        seeds = [b"counter", user.key().as_ref()],
        bump
    )]
    pub counter: Account<'info, Counter>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Update<'info> {
    #[account(
        mut,
        seeds = [b"counter", user.key().as_ref()],
        bump
    )]
    pub counter: Account<'info, Counter>,
    pub user: Signer<'info>,
}

#[account]
pub struct Counter {
    pub count: u64,
    pub authority: Pubkey,
}
`;

const COUNTER_CLIENT_TS = `// Satellite Counter client. Initializes a per-user counter PDA on first run,
// then increments it on subsequent runs. Reads back the value after each call.

console.log("=== Satellite Counter ===\\n");

const PROGRAM_ID_HEX = "YOUR_PROGRAM_ID_HERE";
if (PROGRAM_ID_HEX === "YOUR_PROGRAM_ID_HERE") {
  console.log("⚠️  Build & deploy first, then paste the program ID above.");
  throw new Error("Please set PROGRAM_ID_HEX");
}

const conn = new RpcConnection("https://rpc.testnet.arch.network");
console.log("Block:", await conn.getBlockCount());

const { accountPubkey, useWallet } = await ClientTransactionUtil.setupAccount(conn);
await new Promise(r => setTimeout(r, 1500));

const programPubkey = PubkeyUtil.fromHex(PROGRAM_ID_HEX);
const [counterPubkey] = PubkeyUtil.findProgramAddress(
  [new TextEncoder().encode("counter"), accountPubkey],
  programPubkey
);

async function disc(name) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("global:" + name));
  return new Uint8Array(buf).slice(0, 8);
}
const initDisc = await disc("initialize");
const incDisc  = await disc("increment");

// Probe whether the counter is already initialized
let initialized = false;
try {
  const info = await conn.readAccountInfo(counterPubkey);
  initialized = !!(info && info.data && info.data.length >= 48);
} catch {}

const instruction = initialized
  ? {
      program_id: programPubkey,
      accounts: [
        { pubkey: counterPubkey, is_signer: false, is_writable: true },
        { pubkey: accountPubkey, is_signer: true,  is_writable: false },
      ],
      data: incDisc,
    }
  : {
      program_id: programPubkey,
      accounts: [
        { pubkey: counterPubkey, is_signer: false, is_writable: true },
        { pubkey: accountPubkey, is_signer: true,  is_writable: true },
        { pubkey: PubkeyUtil.systemProgram(), is_signer: false, is_writable: false },
      ],
      data: initDisc,
    };

console.log(initialized ? "→ Calling increment" : "→ Calling initialize");
const txid = await ClientTransactionUtil.signAndSendTransaction(
  conn,
  { signers: [accountPubkey], instructions: [instruction] },
  useWallet
);
console.log("✅ Tx:", txid);

await new Promise(r => setTimeout(r, 2000));
const info = await conn.readAccountInfo(counterPubkey);
if (info?.data && info.data.length >= 16) {
  // Skip 8-byte satellite discriminator, then read u64 LE
  let count = 0;
  for (let i = 0; i < 8; i++) count += info.data[8 + i] * Math.pow(256, i);
  console.log("📊 Counter:", count);
}
`;

// ─── clock ────────────────────────────────────────────────────────────────
const CLOCK_LIB_RS = `use arch_satellite_lang::prelude::*;
use arch_satellite_lang::arch_program::program::get_bitcoin_block_height;

declare_id!("1111111111111111111111111111111111111111111111111111111111111111");

/// Snapshot the current Bitcoin block height into a per-user PDA.
#[program]
pub mod clock {
    use super::*;

    pub fn snapshot(ctx: Context<Snapshot>) -> Result<()> {
        let snap = &mut ctx.accounts.snapshot;
        let height = get_bitcoin_block_height();
        snap.last_height = height;
        snap.snapshots = snap.snapshots.saturating_add(1);
        snap.author = ctx.accounts.user.key();
        msg!("Snapshot #{} at block {}", snap.snapshots, height);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Snapshot<'info> {
    /// space = disc(8) + last_height(8) + snapshots(8) + author(32)
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + 8 + 8 + 32,
        seeds = [b"clock", user.key().as_ref()],
        bump
    )]
    pub snapshot: Account<'info, BlockSnapshot>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct BlockSnapshot {
    pub last_height: u64,
    pub snapshots: u64,
    pub author: Pubkey,
}
`;

const CLOCK_CLIENT_TS = `// Satellite Clock client. Calls \`snapshot\` to record the current Bitcoin
// block height into a per-user PDA, then reads back the stored value.

console.log("=== Satellite Clock ===\\n");

const PROGRAM_ID_HEX = "YOUR_PROGRAM_ID_HERE";
if (PROGRAM_ID_HEX === "YOUR_PROGRAM_ID_HERE") {
  console.log("⚠️  Build & deploy first, then paste the program ID above.");
  throw new Error("Please set PROGRAM_ID_HEX");
}

const conn = new RpcConnection("https://rpc.testnet.arch.network");
console.log("Block:", await conn.getBlockCount());

const { accountPubkey, useWallet } = await ClientTransactionUtil.setupAccount(conn);
await new Promise(r => setTimeout(r, 1500));

const programPubkey = PubkeyUtil.fromHex(PROGRAM_ID_HEX);
const [snapshotPubkey] = PubkeyUtil.findProgramAddress(
  [new TextEncoder().encode("clock"), accountPubkey],
  programPubkey
);

async function disc(name) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("global:" + name));
  return new Uint8Array(buf).slice(0, 8);
}

const instruction = {
  program_id: programPubkey,
  accounts: [
    { pubkey: snapshotPubkey, is_signer: false, is_writable: true },
    { pubkey: accountPubkey,  is_signer: true,  is_writable: true },
    { pubkey: PubkeyUtil.systemProgram(), is_signer: false, is_writable: false },
  ],
  data: await disc("snapshot"),
};

const txid = await ClientTransactionUtil.signAndSendTransaction(
  conn,
  { signers: [accountPubkey], instructions: [instruction] },
  useWallet
);
console.log("✅ Tx:", txid);

await new Promise(r => setTimeout(r, 2000));
const info = await conn.readAccountInfo(snapshotPubkey);
if (info?.data && info.data.length >= 24) {
  // Skip 8-byte discriminator
  const view = new DataView(info.data.buffer, info.data.byteOffset);
  const lastHeight = Number(view.getBigUint64(8, true));
  const count      = Number(view.getBigUint64(16, true));
  console.log("⏰ Last height:", lastHeight, "| Snapshots:", count);
}
`;

// ─── public registry ──────────────────────────────────────────────────────

interface SatelliteExampleSource {
  /** Map of file name → contents under the project's `src/` directory. */
  src: Record<string, string>;
  /** Map of file name → contents under the project's `client/` directory. */
  client: Record<string, string>;
}

/**
 * The set of demo programs for which we ship a hand-authored satellite
 * implementation. Anything not in this map can only be loaded as native.
 */
export const SATELLITE_EXAMPLES: Record<string, SatelliteExampleSource> = {
  helloworld: {
    src: { 'lib.rs': HELLOWORLD_LIB_RS },
    client: { 'client.ts': HELLOWORLD_CLIENT_TS },
  },
  counter: {
    src: { 'lib.rs': COUNTER_LIB_RS },
    client: { 'client.ts': COUNTER_CLIENT_TS },
  },
  clock: {
    src: { 'lib.rs': CLOCK_LIB_RS },
    client: { 'client.ts': CLOCK_CLIENT_TS },
  },
  ...ADVANCED_SATELLITE_EXAMPLES,
};

export const isSatelliteAvailable = (exampleName: string): boolean =>
  exampleName in SATELLITE_EXAMPLES;

/**
 * Frameworks an example can be loaded as. `'native'` is always supported
 * (we fetch from arch-examples on GitHub); `'satellite'` is supported only
 * when an inline satellite source exists.
 */
export const frameworksFor = (exampleName: string): ProjectFramework[] =>
  isSatelliteAvailable(exampleName) ? ['native', 'satellite'] : ['native'];
