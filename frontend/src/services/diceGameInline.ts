// Inline source code for the Bitcoin Dice Game example project.
// Separated from exampleProjectsService.ts for maintainability.

export const DICE_GAME_LIB_RS = `use arch_program::{
    account::AccountInfo,
    bitcoin::{
        absolute::LockTime, transaction::Version, Address, Amount, Transaction,
        TxIn, TxOut, OutPoint, ScriptBuf, Sequence, Witness,
    },
    entrypoint,
    helper::add_state_transition,
    input_to_sign::InputToSign,
    msg,
    program::{
        get_account_script_pubkey, get_bitcoin_tx_output_value,
        next_account_info, set_transaction_to_sign,
    },
    program_error::ProgramError,
    pubkey::Pubkey,
    utxo::UtxoMeta,
};
use borsh::{BorshDeserialize, BorshSerialize};
use std::str::FromStr;

// ============================================================================
// Bitcoin Dice Game
// ============================================================================
//
// Instructions:
//   0. InitializeGame  - Create game account with UTXO anchor, set config
//   1. CreditDeposit   - Credit a player's balance after BTC deposit
//   2. RollDice        - Bet sats, roll 1-6, win on 4-6
//   3. Withdraw        - Send BTC to player from the game pot UTXO
//
// Account layout for all instructions:
//   [0] payer/signer (writable, signer) - pays Arch fees
//   [1] game_account  (writable)        - holds game state + pot UTXO
//   [2] system_program (optional, needed for InitializeGame)
// ============================================================================

entrypoint!(process_instruction);

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> Result<(), ProgramError> {
    let instruction: DiceInstruction = borsh::from_slice(instruction_data)
        .map_err(|_| ProgramError::InvalidInstructionData)?;

    match instruction {
        DiceInstruction::InitializeGame { min_bet, max_bet, house_edge_bps, utxo, tx_hex } => {
            process_init(program_id, accounts, min_bet, max_bet, house_edge_bps, utxo, &tx_hex)
        }
        DiceInstruction::CreditDeposit { player, amount } => {
            process_credit(accounts, player, amount)
        }
        DiceInstruction::RollDice { player, bet_amount, seed } => {
            process_roll(accounts, player, bet_amount, seed)
        }
        DiceInstruction::Withdraw { player, amount, ref destination } => {
            process_withdraw(accounts, player, amount, destination)
        }
    }
}

// ── InitializeGame ─────────────────────────────────────────
// Accounts: [payer (signer), game_account (writable), system_program]
// Prerequisites: game_account must ALREADY be:
//   1. Allocated (via system::allocate)
//   2. Assigned to this program (via system::assign)
//   3. Anchored to a valid UTXO (via system::anchor)
// These are done in a SEPARATE transaction before calling this instruction,
// because the runtime checks ownership at instruction start.

fn process_init(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    min_bet: u64,
    max_bet: u64,
    house_edge_bps: u16,
    _utxo: UtxoMeta,
    _tx_hex: &[u8],
) -> Result<(), ProgramError> {
    let account_iter = &mut accounts.iter();
    let payer = next_account_info(account_iter)?;
    let game_account = next_account_info(account_iter)?;

    if !payer.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Verify the account is owned by this program
    if game_account.owner != program_id {
        msg!("Game account not owned by this program");
        return Err(ProgramError::IncorrectProgramId);
    }

    // Write initial game state
    let state = GameState {
        min_bet,
        max_bet,
        house_edge_bps,
        total_games: 0,
        players: vec![],
    };

    let data = borsh::to_vec(&state)
        .map_err(|e| ProgramError::BorshIoError(e.to_string()))?;

    game_account.data.borrow_mut().copy_from_slice(&data);

    // No Bitcoin state transition needed for initialization —
    // we're just writing config data, not moving BTC.

    msg!("Game initialized: min={}, max={}, edge={}bps", min_bet, max_bet, house_edge_bps);
    Ok(())
}

// ── CreditDeposit ──────────────────────────────────────────
// Accounts: [payer (signer), game_account]
// Called after a player sends BTC to the game account's address.

fn process_credit(
    accounts: &[AccountInfo],
    player: Pubkey,
    amount: u64,
) -> Result<(), ProgramError> {
    let account_iter = &mut accounts.iter();
    let _payer = next_account_info(account_iter)?;
    let game_account = next_account_info(account_iter)?;

    let game_data = game_account.data.borrow();
    let mut state: GameState = borsh::from_slice(&game_data)
        .map_err(|_| ProgramError::InvalidAccountData)?;
    drop(game_data);

    // Find or create player entry
    if let Some(p) = state.players.iter_mut().find(|p| p.pubkey == player) {
        p.balance += amount;
    } else {
        state.players.push(PlayerEntry {
            pubkey: player,
            balance: amount,
            total_wagered: 0,
            total_won: 0,
            games_played: 0,
        });
    }

    let data = borsh::to_vec(&state)
        .map_err(|e| ProgramError::BorshIoError(e.to_string()))?;
    game_account.realloc(data.len(), true)?;
    game_account.data.borrow_mut().copy_from_slice(&data);

    msg!("Credited {} sats to player {}", amount, player);
    Ok(())
}

// ── RollDice ───────────────────────────────────────────────
// Accounts: [payer (signer), game_account]

fn process_roll(
    accounts: &[AccountInfo],
    player: Pubkey,
    bet_amount: u64,
    seed: u64,
) -> Result<(), ProgramError> {
    let account_iter = &mut accounts.iter();
    let _payer = next_account_info(account_iter)?;
    let game_account = next_account_info(account_iter)?;

    let game_data = game_account.data.borrow();
    let mut state: GameState = borsh::from_slice(&game_data)
        .map_err(|_| ProgramError::InvalidAccountData)?;
    drop(game_data);

    if bet_amount < state.min_bet || bet_amount > state.max_bet {
        msg!("Bet {} outside range [{}, {}]", bet_amount, state.min_bet, state.max_bet);
        return Err(ProgramError::InvalidArgument);
    }

    let p = state.players.iter_mut().find(|p| p.pubkey == player)
        .ok_or_else(|| {
            msg!("Player not found");
            ProgramError::InvalidArgument
        })?;

    if p.balance < bet_amount {
        msg!("Insufficient balance: {} < {}", p.balance, bet_amount);
        return Err(ProgramError::InsufficientFunds);
    }

    // Generate roll (1-6)
    let pk_bytes = player.serialize();
    let entropy = seed
        .wrapping_mul(6364136223846793005)
        .wrapping_add(pk_bytes[0] as u64)
        .wrapping_add(pk_bytes[1] as u64)
        .wrapping_mul(1442695040888963407);
    let roll = ((entropy >> 33) % 6) + 1;

    p.balance -= bet_amount;
    p.total_wagered += bet_amount;
    p.games_played += 1;
    state.total_games += 1;

    if roll >= 4 {
        let house_cut = (bet_amount * state.house_edge_bps as u64) / 10000;
        let payout = bet_amount * 2 - house_cut;
        p.balance += payout;
        p.total_won += payout;
        msg!("Roll: {} | WIN | +{} sats (house: {})", roll, payout, house_cut);
    } else {
        msg!("Roll: {} | LOSS | -{} sats", roll, bet_amount);
    }

    let data = borsh::to_vec(&state)
        .map_err(|e| ProgramError::BorshIoError(e.to_string()))?;
    game_account.realloc(data.len(), true)?;
    game_account.data.borrow_mut().copy_from_slice(&data);

    Ok(())
}

// ── Withdraw ───────────────────────────────────────────────
// Accounts: [authority (signer, fee payer), game_account, authority_again (read-only, for UTXO)]
// The authority is system-owned + anchored. Its UTXO is manually added to the
// Bitcoin tx so the validator's verify_anchored_account_present check passes
// (fee deduction changes its state, so its UTXO must be in the BTC tx inputs).
// Only game_account goes into set_transaction_to_sign (program-owned).

fn process_withdraw(
    accounts: &[AccountInfo],
    player: Pubkey,
    amount: u64,
    destination: &str,
) -> Result<(), ProgramError> {
    let account_iter = &mut accounts.iter();
    let authority = next_account_info(account_iter)?;
    let game_account = next_account_info(account_iter)?;

    if !authority.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let game_data = game_account.data.borrow();
    let mut state: GameState = borsh::from_slice(&game_data)
        .map_err(|_| ProgramError::InvalidAccountData)?;
    drop(game_data);

    let p = state.players.iter_mut().find(|p| p.pubkey == player)
        .ok_or_else(|| {
            msg!("Player not found");
            ProgramError::InvalidArgument
        })?;

    if p.balance < amount {
        msg!("Insufficient balance: {} < {}", p.balance, amount);
        return Err(ProgramError::InsufficientFunds);
    }

    p.balance -= amount;

    let data = borsh::to_vec(&state)
        .map_err(|e| ProgramError::BorshIoError(e.to_string()))?;
    game_account.realloc(data.len(), true)?;
    game_account.data.borrow_mut().copy_from_slice(&data);

    // Build Bitcoin withdrawal transaction
    let dest_address = Address::from_str(destination)
        .map_err(|_| ProgramError::Custom(505))?
        .assume_checked();

    let mut tx = Transaction {
        version: Version::TWO,
        lock_time: LockTime::ZERO,
        input: vec![],
        output: vec![],
    };

    // Input 0: game account UTXO (via add_state_transition - it's writable + program-owned)
    // add_state_transition creates output[0] with the full UTXO value.
    // Subtract the withdrawal amount + Bitcoin miner fee so inputs > outputs.
    let btc_miner_fee: u64 = 400; // sats - covers ~300 vbyte P2TR tx at 1+ sat/vbyte
    let game_utxo_value = add_state_transition(&mut tx, game_account)?;
    let total_deduct = amount + btc_miner_fee;
    if game_utxo_value < total_deduct {
        msg!("Game pot insufficient: {} < {} (withdraw {} + fee {})",
            game_utxo_value, total_deduct, amount, btc_miner_fee);
        return Err(ProgramError::InsufficientFunds);
    }
    tx.output[0].value = Amount::from_sat(game_utxo_value - total_deduct);

    // Input 1: authority UTXO (manually constructed - authority is read-only,
    // so we can't use add_state_transition which asserts is_writable).
    // This satisfies the validator: the authority's UTXO is in the BTC tx inputs.
    tx.input.push(TxIn {
        previous_output: OutPoint {
            txid: authority.utxo.to_txid(),
            vout: authority.utxo.vout(),
        },
        script_sig: ScriptBuf::new(),
        sequence: Sequence::MAX,
        witness: Witness::new(),
    });
    // Output back to authority (roll over its UTXO)
    let auth_utxo_value = get_bitcoin_tx_output_value(
        authority.utxo.txid_big_endian(), authority.utxo.vout()
    ).ok_or(ProgramError::Custom(506))?;
    tx.output.push(TxOut {
        value: Amount::from_sat(auth_utxo_value),
        script_pubkey: ScriptBuf::from_bytes(get_account_script_pubkey(authority.key).to_vec()),
    });

    // Output: send withdrawal amount to player's BTC address
    tx.output.push(TxOut {
        value: Amount::from_sat(amount),
        script_pubkey: dest_address.script_pubkey(),
    });

    // Both inputs need signing: game account (index 0) + authority (index 1)
    let inputs_to_sign = [
        InputToSign { index: 0, signer: game_account.key.clone() },
        InputToSign { index: 1, signer: authority.key.clone() },
    ];

    // ONLY game_account in set_transaction_to_sign (program-owned).
    // The authority's UTXO is in the BTC tx inputs, satisfying the validator,
    // but authority is NOT in this list so the program doesn't try to modify it.
    set_transaction_to_sign(&[game_account.clone()], &tx, &inputs_to_sign)?;

    msg!("Withdraw: {} sats to {}", amount, destination);
    Ok(())
}

// ============================================================================
// Data Structures
// ============================================================================

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize)]
pub enum DiceInstruction {
    /// Create game account and initialize config
    InitializeGame {
        min_bet: u64,
        max_bet: u64,
        house_edge_bps: u16,
        utxo: UtxoMeta,    // UTXO to anchor the game account
        tx_hex: Vec<u8>,   // Fee transaction
    },
    /// Credit a player's balance after BTC deposit
    CreditDeposit {
        player: Pubkey,
        amount: u64,
    },
    /// Roll dice with a bet
    RollDice {
        player: Pubkey,
        bet_amount: u64,
        seed: u64,
    },
    /// Withdraw BTC to player's address
    Withdraw {
        player: Pubkey,
        amount: u64,
        destination: String,
    },
}

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize)]
pub struct PlayerEntry {
    pub pubkey: Pubkey,
    pub balance: u64,
    pub total_wagered: u64,
    pub total_won: u64,
    pub games_played: u64,
}

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize)]
pub struct GameState {
    pub min_bet: u64,
    pub max_bet: u64,
    pub house_edge_bps: u16,
    pub total_games: u64,
    pub players: Vec<PlayerEntry>,
}
`;

export const DICE_GAME_SETUP_TS = `// ============================================================================
// Bitcoin Dice Game - Setup Script
// ============================================================================
//
// Run ONCE after deploying the program.
// Creates a PROGRAM-OWNED game account via CPI (create_account_with_anchor).
//
// The transaction requires TWO signers:
//   - payer  (fee payer / authority)
//   - game account (must sign to authorize create_account_with_anchor)
//
// After running:
//   1. The game account is owned by the dice program
//   2. Fund the game BTC address with testnet sats (the pot)
//   3. Run client.ts to play
// ============================================================================

async function setup() {
  console.log("========================================");
  console.log("  Dice Game - Setup");
  console.log("========================================");
  console.log("");

  const rpcUrl = (window as any).__archRpcUrl;
  const programAcct = (window as any).__archProgramAccount;
  const Bip322Signer = (window as any).Bip322Signer;
  const privkeyToWif = (window as any).__archPrivkeyHexToWif;
  const bip322SignWithKey = (window as any).__bip322SignWithKey; // BIP322 signing with derived P2TR address

  if (!rpcUrl) { console.log("ERROR: No RPC URL. Configure in Settings."); return; }
  if (!programAcct) { console.log("ERROR: No program keypair. Complete Build tab Step 1."); return; }

  console.log("Program ID: " + programAcct.pubkey.substring(0, 24) + "...");
  console.log("");

  const conn = new RpcConnection(rpcUrl);
  const archConn = ArchConnection(conn);

  // ── Helpers ─────────────────────────────────────────────────
  const encode_u64 = (val: number): Uint8Array => {
    const buf = new DataView(new ArrayBuffer(8));
    buf.setUint32(0, val & 0xFFFFFFFF, true);
    buf.setUint32(4, Math.floor(val / 0x100000000), true);
    return new Uint8Array(buf.buffer);
  };
  const encode_u16 = (val: number): Uint8Array => {
    const arr = new Uint8Array(2);
    arr[0] = val & 0xFF;
    arr[1] = (val >> 8) & 0xFF;
    return arr;
  };
  const encode_vec_u8 = (data: Uint8Array): Uint8Array => {
    const len = data.length;
    const arr = new Uint8Array(4 + len);
    arr[0] = len & 0xFF;
    arr[1] = (len >> 8) & 0xFF;
    arr[2] = (len >> 16) & 0xFF;
    arr[3] = (len >> 24) & 0xFF;
    arr.set(data, 4);
    return arr;
  };
  const hexToBytes = (hex: string): Uint8Array => {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) {
      out[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return out;
  };

  // Sign a message hash with BIP322 and return adjusted 64-byte signature
  const bip322Sign = (wif: string, address: string, hashHex: string): Uint8Array => {
    const sigB64 = Bip322Signer.sign(wif, address, hashHex);
    const sigStr = typeof sigB64 === "string" ? sigB64 : btoa(String.fromCharCode(...Array.from(sigB64)));
    let sig = Uint8Array.from(atob(sigStr), function(c) { return c.charCodeAt(0); });
    if (sig.length === 65) sig = sig.slice(0, 64);
    if (typeof SignatureUtil !== "undefined") {
      try { sig = SignatureUtil.adjustSignature(sig); } catch (_) {}
    }
    return sig;
  };

  if (!bip322SignWithKey) {
    console.log("ERROR: __bip322SignWithKey not available. IDE may need a hard refresh.");
    return;
  }

  // System program ID: 000...0001
  const systemProgramPubkey = new Uint8Array(32);
  systemProgramPubkey[31] = 1;

  // Helper: wait for a tx to be processed, return {success, titanError, msg}
  const waitForTx = async function(txid: string): Promise<{success: boolean, titanError: boolean, msg: string}> {
    for (let poll = 0; poll < 10; poll++) {
      await new Promise(function(r) { setTimeout(r, 3000); });
      try {
        const result = await conn.getProcessedTransaction(txid);
        if (!result) continue;
        const status = result.status || (result as any).Status;
        if (typeof status !== "object" || status === null) continue;
        if (result.runtime_transaction) {
          const logs = result.runtime_transaction.logs || [];
          for (let i = 0; i < logs.length; i++) console.log("    " + logs[i]);
        }
        if (status.type === "failed") {
          const m = String(status.message || "");
          return { success: false, titanError: m.toLowerCase().includes("itan"), msg: m };
        }
        return { success: true, titanError: false, msg: "" };
      } catch (_) {}
    }
    return { success: false, titanError: false, msg: "not processed in time" };
  };

  // ── Step 1: Set up payer account ──────────────────────────
  console.log("Step 1: Setting up payer account...");
  const setupResult = await ClientTransactionUtil.setupAccount(conn);
  const payerPubkey = setupResult.accountPubkey;
  const useWallet = setupResult.useWallet;
  console.log("  Address: " + setupResult.accountAddress);
  console.log("  Wallet:  " + useWallet);
  await new Promise(function(r) { setTimeout(r, 3000); });

  // ── Step 2: Create game account keypair ───────────────────
  console.log("");
  console.log("Step 2: Creating game account keypair...");
  const gameAccount = await archConn.createNewAccount();
  const gameAccountPubkey = PubkeyUtil.fromHex(gameAccount.pubkey);
  console.log("  Pubkey:  " + gameAccount.pubkey.substring(0, 24) + "...");
  console.log("  Address: " + gameAccount.address);

  // Request ARCH airdrop for compute budget
  try {
    await conn.requestAirdrop(gameAccountPubkey);
    console.log("  ARCH airdrop requested.");
  } catch (e: any) {
    console.log("  Airdrop note: " + (e.message || e));
  }

  // ── Step 3: Fund game account with BTC UTXO ───────────────
  const FUND_AMOUNT_SATS = 3000;
  console.log("");
  console.log("Step 3: Funding game account with BTC UTXO...");
  console.log("");
  console.log("  >> WALLET PROMPT: Send " + FUND_AMOUNT_SATS + " sats to create the");
  console.log("     game account's Bitcoin UTXO. This funds the on-chain");
  console.log("     game pot that holds player deposits and pays out wins.");
  console.log("");

  let fundTxid: string;
  try {
    fundTxid = await walletProxy.sendBitcoin(gameAccount.address, FUND_AMOUNT_SATS);
    console.log("  Wallet TX: " + fundTxid);
  } catch (e: any) {
    console.log("ERROR: Wallet sendBitcoin failed: " + (e.message || e));
    console.log("  Make sure your wallet is connected and has testnet BTC.");
    return;
  }

  const utxoBytes = UtxoMetaUtil.fromHex(fundTxid, 0);
  console.log("  UTXO: " + fundTxid.substring(0, 16) + "... vout=0 (" + utxoBytes.length + " bytes)");

  // ── Step 4: Anchor game account (with Titan retry) ─────────
  // Anchor MUST happen while account is still system-owned.
  // Arch doesn't roll back partial state on failed txs, so we anchor
  // SEPARATELY before allocate+assign to avoid inconsistent state.
  const progBytes = hexToBytes(programAcct.pubkey);

  const MIN_BET = 100;
  const MAX_BET = 10000;
  const HOUSE_EDGE_BPS = 250; // 2.5%

  // GameState borsh size: u64+u64+u16+u64+vec(0)=8+8+2+8+4=30
  const stateSize = 30;

  // Bincode-encode system instructions:
  // Anchor (variant 3): [03,00,00,00] + 32-byte txid + u32 vout
  const anchorData = new Uint8Array(40);
  anchorData.set([3, 0, 0, 0], 0);
  for (let i = 0; i < 32; i++) anchorData[4 + i] = utxoBytes[i];
  for (let i = 0; i < 4; i++) anchorData[36 + i] = utxoBytes[32 + i];

  console.log("");
  console.log("Step 4: Anchor account (waiting for Titan to index BTC tx)...");

  // Helper: build, sign, send a single-instruction system tx
  const sendSystemTx = async function(ixData: Uint8Array, label: string): Promise<string> {
    const ix = {
      program_id: systemProgramPubkey,
      accounts: [{ pubkey: gameAccountPubkey, is_signer: true, is_writable: true }],
      data: Array.from(ixData),
    };
    const bh = await conn.getBestBlockHash();
    const bhBytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) bhBytes[i] = parseInt(bh.slice(i * 2, i * 2 + 2), 16);
    const san = SanitizedMessageUtil.createSanitizedMessage([ix], gameAccountPubkey, bhBytes);
    if (!san || !("header" in san)) throw new Error("Failed to create message for " + label);
    const hh = new TextDecoder().decode(SanitizedMessageUtil.hash(san));
    const sig = new Uint8Array(bip322SignWithKey(gameAccount.privkey, hh, "testnet"));
    const msg = {
      header: san.header,
      account_keys: san.account_keys.map(function(k: Uint8Array) { return Array.from(k); }),
      recent_blockhash: Array.from(bhBytes),
      instructions: san.instructions.map(function(x: any) {
        return { program_id_index: x.program_id_index, accounts: x.accounts.slice(), data: Array.from(x.data) };
      }),
    };
    return await conn.sendTransaction({ version: 0, signatures: [Array.from(sig)], message: msg });
  };

  // Retry loop for anchor
  const MAX_RETRIES = 8;
  const RETRY_DELAY_MS = 10000;
  let anchorDone = false;

  for (let retry = 0; retry < MAX_RETRIES; retry++) {
    if (retry > 0) {
      console.log("  Waiting " + (RETRY_DELAY_MS / 1000) + "s for Titan...");
      await new Promise(function(r) { setTimeout(r, RETRY_DELAY_MS); });
    }
    console.log("  Attempt " + (retry + 1) + "/" + MAX_RETRIES + "...");
    try {
      const txid = await sendSystemTx(anchorData, "anchor");
      console.log("  Submitted: " + txid);
      const r = await waitForTx(txid);
      if (r.success) { anchorDone = true; break; }
      if (r.titanError) { console.log("  Titan not ready yet."); continue; }
      console.log("  FAILED: " + r.msg);
      return;
    } catch (e: any) {
      console.log("  " + (e.message || e));
      continue;
    }
  }
  if (!anchorDone) {
    console.log("ERROR: Anchor failed after " + MAX_RETRIES + " retries. BTC TX: " + fundTxid);
    return;
  }
  console.log("  Anchor succeeded!");

  // Verify anchor was set
  try {
    const info = await conn.readAccountInfo(gameAccountPubkey);
    if (info) {
      const utxoField = info.utxo ? (typeof info.utxo === "string" ? info.utxo : JSON.stringify(info.utxo)) : "none";
      const owner = info.owner ? (typeof info.owner === "string" ? info.owner : Array.from(info.owner as Uint8Array).map(function(b: number) { return b.toString(16).padStart(2, "0"); }).join("")) : "?";
      const dataLen = info.data ? (info.data as any).length || 0 : 0;
      console.log("  POST-ANCHOR: owner=" + owner.substring(0, 16) + "... data=" + dataLen + "b utxo=" + utxoField);
    } else {
      console.log("  POST-ANCHOR: account not found!");
    }
  } catch (e: any) {
    console.log("  POST-ANCHOR read: " + (e.message || e));
  }

  // ── Step 5: Allocate + Assign ─────────────────────────────
  console.log("");
  console.log("Step 5: Allocate (" + stateSize + " bytes) + Assign to program...");

  // Allocate (variant 6): [06,00,00,00] + u64 space
  const allocateData = new Uint8Array(12);
  allocateData.set([6, 0, 0, 0], 0);
  new DataView(allocateData.buffer).setUint32(4, stateSize, true);
  // high 4 bytes of u64 are 0

  // Assign (variant 2): [02,00,00,00] + 32-byte program pubkey
  const assignData = new Uint8Array(36);
  assignData.set([2, 0, 0, 0], 0);
  assignData.set(progBytes, 4);

  // Send allocate
  try {
    const txid = await sendSystemTx(allocateData, "allocate");
    console.log("  Allocate submitted: " + txid);
    const r = await waitForTx(txid);
    if (!r.success) { console.log("  Allocate FAILED: " + r.msg); return; }
    console.log("  Allocate succeeded!");
  } catch (e: any) {
    console.log("  Allocate error: " + (e.message || e));
    return;
  }

  // Send assign
  try {
    const txid = await sendSystemTx(assignData, "assign");
    console.log("  Assign submitted: " + txid);
    const r = await waitForTx(txid);
    if (!r.success) { console.log("  Assign FAILED: " + r.msg); return; }
    console.log("  Assign succeeded!");
  } catch (e: any) {
    console.log("  Assign error: " + (e.message || e));
    return;
  }

  // Verify final state before InitializeGame
  try {
    const info = await conn.readAccountInfo(gameAccountPubkey);
    if (info) {
      const utxoField = info.utxo ? (typeof info.utxo === "string" ? info.utxo : JSON.stringify(info.utxo)) : "none";
      const owner = info.owner ? (typeof info.owner === "string" ? info.owner : Array.from(info.owner as Uint8Array).map(function(b: number) { return b.toString(16).padStart(2, "0"); }).join("")) : "?";
      const dataLen = info.data ? (info.data as any).length || 0 : 0;
      console.log("  PRE-INIT: owner=" + owner.substring(0, 16) + "... data=" + dataLen + "b utxo=" + utxoField);
    }
  } catch (e: any) {
    console.log("  PRE-INIT read: " + (e.message || e));
  }

  // ── Step 6: InitializeGame (dice program writes state) ─────
  // No Bitcoin state transition needed — just writing config data.
  // Use wallet payer as fee payer (payer doesn't need anchor since no BTC tx).
  console.log("");
  console.log("Step 6: InitializeGame (write game state)...");
  console.log("  Min bet: " + MIN_BET + "  Max bet: " + MAX_BET + "  Edge: " + (HOUSE_EDGE_BPS / 100) + "%");

  const emptyTxHex = encode_vec_u8(new Uint8Array(0));
  const instrLen = 1 + 8 + 8 + 2 + 36 + emptyTxHex.length;
  const instructionData = new Uint8Array(instrLen);
  let off = 0;
  instructionData[off++] = 0;
  instructionData.set(encode_u64(MIN_BET), off); off += 8;
  instructionData.set(encode_u64(MAX_BET), off); off += 8;
  instructionData.set(encode_u16(HOUSE_EDGE_BPS), off); off += 2;
  instructionData.set(utxoBytes, off); off += 36;
  instructionData.set(emptyTxHex, off);

  const ix_init = {
    program_id: progBytes,
    accounts: [
      { pubkey: payerPubkey, is_signer: true, is_writable: true },
      { pubkey: gameAccountPubkey, is_signer: true, is_writable: true },
      { pubkey: systemProgramPubkey, is_signer: false, is_writable: false },
    ],
    data: Array.from(instructionData),
  };

  const bestBlockHash2 = await conn.getBestBlockHash();
  const blockhashBytes2 = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    blockhashBytes2[i] = parseInt(bestBlockHash2.slice(i * 2, i * 2 + 2), 16);
  }

  const sanitized2 = SanitizedMessageUtil.createSanitizedMessage(
    [ix_init], payerPubkey, blockhashBytes2
  );
  if (!sanitized2 || typeof sanitized2 !== "object" || !("header" in sanitized2)) {
    console.log("ERROR: Failed to create sanitized message for TX2");
    return;
  }

  const hash2 = new TextDecoder().decode(SanitizedMessageUtil.hash(sanitized2));

  // Sign: payer (wallet) + game account (local)
  let payerSig2: Uint8Array;
  if (useWallet) {
    console.log("");
    console.log("  >> WALLET PROMPT: Sign to authorize the InitializeGame");
    console.log("     transaction. This writes the game config on-chain.");
    console.log("");
    const sigStr = await walletProxy.signMessage(hash2, "bip322-simple");
    const isHex = function(s: string) { return /^[0-9a-fA-F]+$/.test(s) && s.length % 2 === 0; };
    const isB64 = function(s: string) { try { return btoa(atob(s)) === s; } catch { return false; } };
    payerSig2 = isHex(sigStr)
      ? hexToBytes(sigStr)
      : isB64(sigStr)
        ? Uint8Array.from(atob(sigStr), function(c) { return c.charCodeAt(0); })
        : (() => { throw new Error("Unknown sig encoding"); })();
    if (payerSig2.length === 65) payerSig2 = payerSig2.slice(0, 64);
    try { payerSig2 = SignatureUtil.adjustSignature(payerSig2); } catch (_) {}
  } else {
    const local = (window as any).__archLocalAccount;
    if (!local || !local.wif) { console.log("ERROR: No payer WIF"); return; }
    payerSig2 = bip322Sign(local.wif, local.address, hash2);
  }
  const gameSig2 = new Uint8Array(bip322SignWithKey(gameAccount.privkey, hash2, "testnet"));
  console.log("  Signatures: payer=" + payerSig2.length + "b game=" + gameSig2.length + "b");

  const sendMsg2 = {
    header: sanitized2.header,
    account_keys: sanitized2.account_keys.map(function(k: Uint8Array) { return Array.from(k); }),
    recent_blockhash: Array.from(blockhashBytes2),
    instructions: sanitized2.instructions.map(function(ix: any) {
      return {
        program_id_index: ix.program_id_index,
        accounts: Array.isArray(ix.accounts) ? ix.accounts.slice() : [],
        data: Array.from(ix.data),
      };
    }),
  };

  let initTxid: string;
  try {
    initTxid = await conn.sendTransaction({
      version: 0, signatures: [Array.from(payerSig2), Array.from(gameSig2)], message: sendMsg2,
    });
    console.log("  Submitted: " + initTxid);
  } catch (e: any) {
    console.log("  ERROR: " + (e.message || e));
    return;
  }

  // Wait for TX2 processing
  for (let poll = 0; poll < 10; poll++) {
    await new Promise(function(r) { setTimeout(r, 3000); });
    try {
      const result = await conn.getProcessedTransaction(initTxid);
      if (!result) continue;
      const status = result.status || (result as any).Status;
      if (typeof status !== "object" || status === null) continue;
      if (result.runtime_transaction) {
        const logs = result.runtime_transaction.logs || [];
        for (let i = 0; i < logs.length; i++) console.log("    " + logs[i]);
      }
      if (status.type === "failed") {
        console.log("  TX2 FAILED: " + (status.message || ""));
        return;
      }
      break;
    } catch (_) {}
  }

  // ── Step 7: Verify game account state ─────────────────────
  console.log("");
  console.log("Step 7: Verifying game account...");
  try {
    const acctInfo = await conn.readAccountInfo(gameAccountPubkey);
    if (acctInfo) {
      const owner = acctInfo.owner ? (typeof acctInfo.owner === "string" ? acctInfo.owner : Array.from(acctInfo.owner as Uint8Array).map(function(b: number) { return b.toString(16).padStart(2, "0"); }).join("")) : "unknown";
      const dataLen = acctInfo.data ? (acctInfo.data as any).length || 0 : 0;
      console.log("  Owner: " + owner);
      console.log("  Data:  " + dataLen + " bytes");
    }
  } catch (e: any) {
    console.log("  " + (e.message || e));
  }

  // ── Step 8: Create authority keypair (for BTC payouts) ─────
  // The authority stays system-owned (can pay fees) + anchored (satisfies
  // validator). We hold its private key so we can sign withdraw txs locally.
  console.log("");
  console.log("Step 8: Creating authority keypair for BTC payouts...");
  const authority = await archConn.createNewAccount();
  const authorityPubkey = PubkeyUtil.fromHex(authority.pubkey);
  console.log("  Pubkey:  " + authority.pubkey.substring(0, 24) + "...");
  console.log("  Address: " + authority.address);

  // Airdrop ARCH tokens for fees
  try { await conn.requestAirdrop(authorityPubkey); } catch (_) {}

  // Check if authority is already anchored
  let authAlreadyAnchored = false;
  try {
    const authInfo = await conn.readAccountInfo(authorityPubkey);
    if (authInfo && authInfo.utxo) {
      const utxoStr = typeof authInfo.utxo === "string" ? authInfo.utxo : JSON.stringify(authInfo.utxo);
      if (utxoStr && !utxoStr.includes("0000000000000000000000000000000000000000000000000000000000000000")) {
        authAlreadyAnchored = true;
        console.log("  Authority already anchored!");
      }
    }
  } catch (_) {}

  if (!authAlreadyAnchored) {
    console.log("");
    console.log("  >> WALLET PROMPT: Send 546 sats to create the authority");
    console.log("     account's UTXO. This enables BTC withdrawals.");
    console.log("");
    let authFundTxid: string;
    try {
      authFundTxid = await walletProxy.sendBitcoin(authority.address, 546);
      console.log("  Authority fund TX: " + authFundTxid);
    } catch (e: any) {
      console.log("ERROR: Wallet sendBitcoin for authority failed: " + (e.message || e));
      return;
    }

    // Anchor the authority (same Titan retry pattern)
    const authUtxoBytes = UtxoMetaUtil.fromHex(authFundTxid, 0);
    const authAnchorData = new Uint8Array(40);
    authAnchorData.set([3, 0, 0, 0], 0);
    for (let i = 0; i < 32; i++) authAnchorData[4 + i] = authUtxoBytes[i];
    for (let i = 0; i < 4; i++) authAnchorData[36 + i] = authUtxoBytes[32 + i];

    // sendSystemTx signs with game account; we need one that signs with authority
    const sendAuthSystemTx = async function(ixData: Uint8Array): Promise<string> {
      const ix = {
        program_id: systemProgramPubkey,
        accounts: [{ pubkey: authorityPubkey, is_signer: true, is_writable: true }],
        data: Array.from(ixData),
      };
      const bh = await conn.getBestBlockHash();
      const bhBytes = new Uint8Array(32);
      for (let i = 0; i < 32; i++) bhBytes[i] = parseInt(bh.slice(i * 2, i * 2 + 2), 16);
      const san = SanitizedMessageUtil.createSanitizedMessage([ix], authorityPubkey, bhBytes);
      if (!san || !("header" in san)) throw new Error("Failed to create message");
      const hh = new TextDecoder().decode(SanitizedMessageUtil.hash(san));
      const sig = new Uint8Array(bip322SignWithKey(authority.privkey, hh, "testnet"));
      const msg = {
        header: san.header,
        account_keys: san.account_keys.map(function(k: Uint8Array) { return Array.from(k); }),
        recent_blockhash: Array.from(bhBytes),
        instructions: san.instructions.map(function(x: any) {
          return { program_id_index: x.program_id_index, accounts: x.accounts.slice(), data: Array.from(x.data) };
        }),
      };
      return await conn.sendTransaction({ version: 0, signatures: [Array.from(sig)], message: msg });
    };

    let authAnchorDone = false;
    for (let retry = 0; retry < 8; retry++) {
      if (retry > 0) {
        console.log("  Waiting 10s for Titan...");
        await new Promise(function(r) { setTimeout(r, 10000); });
      }
      console.log("  Authority anchor attempt " + (retry + 1) + "/8...");
      try {
        const txid = await sendAuthSystemTx(authAnchorData);
        console.log("  Submitted: " + txid);
        const r = await waitForTx(txid);
        if (r.success) { authAnchorDone = true; break; }
        if (r.titanError) { console.log("  Titan not ready."); continue; }
        console.log("  FAILED: " + r.msg); return;
      } catch (e: any) { console.log("  " + (e.message || e)); continue; }
    }
    if (!authAnchorDone) { console.log("ERROR: Authority anchor failed."); return; }
    console.log("  Authority anchored!");
  }

  // ── Done ──────────────────────────────────────────────────
  (window as any).__diceGameAccount = {
    pubkey: gameAccount.pubkey,
    address: gameAccount.address,
  };
  (window as any).__diceAuthority = {
    pubkey: authority.pubkey,
    address: authority.address,
    privkey: authority.privkey,
  };

  console.log("");
  console.log("========================================");
  console.log("  Setup complete!");
  console.log("");
  console.log("  Game account (program-owned):");
  console.log("  Pubkey:  " + gameAccount.pubkey.substring(0, 24) + "...");
  console.log("  Address: " + gameAccount.address);
  console.log("");
  console.log("  Authority (system-owned, for BTC payouts):");
  console.log("  Pubkey:  " + authority.pubkey.substring(0, 24) + "...");
  console.log("");
  console.log("  Config:");
  console.log("  - Min bet:    " + MIN_BET + " sats");
  console.log("  - Max bet:    " + MAX_BET + " sats");
  console.log("  - House edge: " + (HOUSE_EDGE_BPS / 100) + "%");
  console.log("");
  console.log("  Run client.ts to play.");
  console.log("========================================");
}

try { await setup(); } catch (e: any) { console.log("Error: " + (e.message || e)); }
`;

export const DICE_GAME_CLIENT_TS = `// ============================================================================
// Bitcoin Dice Game - Player Client
// ============================================================================
//
// Prerequisites:
//   1. Deploy the program (Build tab)
//   2. Run setup.ts to create the program-owned game account
//   3. Fund the game account BTC address with testnet sats
//   4. Connect wallet (Unisat/Xverse)
//
// Flow:
//   1. Deposit BTC to the game pot
//   2. Credit your balance on-chain
//   3. Roll dice and check result
//   4. Withdraw winnings
// ============================================================================

async function play() {
  console.log("========================================");
  console.log("  Bitcoin Dice Game");
  console.log("========================================");
  console.log("");

  const rpcUrl = (window as any).__archRpcUrl;
  const programAcct = (window as any).__archProgramAccount;

  // Game account created by setup.ts (program-owned)
  const gameAcct = (window as any).__diceGameAccount
    || (window as any).__archProgramAuthority;

  if (!rpcUrl) { console.log("ERROR: No RPC URL."); return; }
  if (!programAcct) { console.log("ERROR: No program keypair. Build tab Step 1."); return; }
  if (!gameAcct) { console.log("ERROR: No game account. Run setup.ts first."); return; }

  console.log("Program: " + programAcct.pubkey.substring(0, 20) + "...");
  console.log("Game:    " + gameAcct.pubkey.substring(0, 20) + "...");
  console.log("");

  // ── Connect wallet ─────────────────────────────────────

  console.log("Connecting wallet...");
  const available = await walletProxy.isAvailable();
  if (!available) {
    console.log("ERROR: Connect Unisat or Xverse wallet first.");
    return;
  }

  const walletType = await walletProxy.getWalletType();
  const walletAccounts = await walletProxy.getAccounts();
  const pubkeyHex = await walletProxy.getPublicKey();

  console.log("Wallet: " + walletType);
  console.log("Address: " + walletAccounts[0]);
  console.log("");

  const conn = new RpcConnection(rpcUrl);
  console.log("Setting up Arch account...");
  const { accountPubkey, useWallet } = await ClientTransactionUtil.setupAccount(conn);

  // Wait for airdrop
  await new Promise(function(r) { setTimeout(r, 3000); });

  // Helper: hex string to Uint8Array
  const hexToBytes = (hex: string): Uint8Array => {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) {
      out[i] = parseInt(hex.substring(i * 2, i * 2 + 2), 16);
    }
    return out;
  };

  const progBytes = hexToBytes(programAcct.pubkey);
  const gameBytes = hexToBytes(gameAcct.pubkey);

  const encode_u64 = (val: number): Uint8Array => {
    const buf = new DataView(new ArrayBuffer(8));
    buf.setUint32(0, val & 0xFFFFFFFF, true);
    buf.setUint32(4, Math.floor(val / 0x100000000), true);
    return new Uint8Array(buf.buffer);
  };

  // ── Deposit BTC ────────────────────────────────────────

  const POT_ADDRESS = gameAcct.address;
  const DEPOSIT = 1000;

  console.log("STEP 1: Deposit " + DEPOSIT + " sats to game pot");
  console.log("  Pot: " + POT_ADDRESS.substring(0, 24) + "...");
  console.log("");
  console.log("  >> WALLET PROMPT: Send " + DEPOSIT + " sats to the game pot.");
  console.log("     This is your buy-in to play the dice game.");
  console.log("");

  let depositOk = false;
  try {
    const txid = await walletProxy.sendBitcoin(POT_ADDRESS, DEPOSIT);
    console.log("  Deposit TXID: " + txid);
    depositOk = true;
  } catch (err: any) {
    console.log("  Deposit skipped: " + (err.message || err));
  }
  console.log("");

  // ── Credit balance ─────────────────────────────────────

  if (depositOk) {
    console.log("STEP 2: Credit " + DEPOSIT + " sats on-chain");
    console.log("");
    console.log("  >> WALLET PROMPT: Sign to record your deposit on-chain.");
    console.log("     No BTC is sent -- this just updates your game balance.");
    console.log("");

    // CreditDeposit = enum variant 1: [1] [32 bytes player pubkey] [u64 amount]
    const creditData = new Uint8Array(1 + 32 + 8);
    creditData[0] = 1;
    creditData.set(accountPubkey, 1);
    creditData.set(encode_u64(DEPOSIT), 33);

    try {
      const txid = await ClientTransactionUtil.signAndSendTransaction(conn, {
        signers: [accountPubkey],
        instructions: [{
          program_id: progBytes,
          accounts: [
            { pubkey: accountPubkey, is_signer: true, is_writable: false },
            { pubkey: gameBytes, is_signer: false, is_writable: true },
          ],
          data: Array.from(creditData),
        }],
      }, useWallet);
      console.log("  Credited! TXID: " + txid);
    } catch (err: any) {
      console.log("  Credit error: " + (err.message || err));
    }
    console.log("");
  }

  // ── Roll Dice ──────────────────────────────────────────

  const BET = 500;
  const SEED = Math.floor(Math.random() * 1000000);

  console.log("STEP 3: Roll dice (bet " + BET + " sats, seed " + SEED + ")");
  console.log("");
  console.log("  >> WALLET PROMPT: Sign to roll the dice. The program will");
  console.log("     determine WIN or LOSS and update your balance.");
  console.log("");

  // RollDice = enum variant 2: [2] [32 bytes pubkey] [u64 bet] [u64 seed]
  const rollData = new Uint8Array(1 + 32 + 8 + 8);
  rollData[0] = 2;
  rollData.set(accountPubkey, 1);
  rollData.set(encode_u64(BET), 33);
  rollData.set(encode_u64(SEED), 41);

  try {
    const txid = await ClientTransactionUtil.signAndSendTransaction(conn, {
      signers: [accountPubkey],
      instructions: [{
        program_id: progBytes,
        accounts: [
          { pubkey: accountPubkey, is_signer: true, is_writable: false },
          { pubkey: gameBytes, is_signer: false, is_writable: true },
        ],
        data: Array.from(rollData),
      }],
    }, useWallet);
    console.log("  Rolled! TXID: " + txid);
    console.log("  Check explorer logs for WIN/LOSS result.");
  } catch (err: any) {
    console.log("  Roll error: " + (err.message || err));
  }
  console.log("");

  // ── Withdraw (using authority keypair for BTC payout) ───

  const WITHDRAW = 500;
  console.log("STEP 4: Withdraw " + WITHDRAW + " sats (BTC payout)");
  console.log("  To: " + walletAccounts[0].substring(0, 20) + "...");

  // Get the authority keypair saved by setup.ts
  const authority = (window as any).__diceAuthority;
  if (!authority || !authority.privkey) {
    console.log("  ERROR: No authority keypair. Run setup.ts first (same session).");
  } else {
    const bip322SignWithKey = (window as any).__bip322SignWithKey;

    // Withdraw = enum variant 3: [3] [32 bytes pubkey] [u64 amount] [u32 str_len] [str bytes]
    const destStr = walletAccounts[0];
    const destBytes = new TextEncoder().encode(destStr);
    const wdData = new Uint8Array(1 + 32 + 8 + 4 + destBytes.length);
    let woff = 0;
    wdData[woff++] = 3;
    wdData.set(accountPubkey, woff); woff += 32;
    wdData.set(encode_u64(WITHDRAW), woff); woff += 8;
    const lenView = new DataView(new ArrayBuffer(4));
    lenView.setUint32(0, destBytes.length, true);
    wdData.set(new Uint8Array(lenView.buffer), woff); woff += 4;
    wdData.set(destBytes, woff);

    // Build withdraw tx manually with AUTHORITY as fee payer (not wallet).
    // Authority is system-owned + anchored, so it can pay fees AND satisfies
    // the validator's anchoring check for writable accounts.
    const authorityPubkey = PubkeyUtil.fromHex(authority.pubkey);

    const ix_wd = {
      program_id: progBytes,
      accounts: [
        { pubkey: authorityPubkey, is_signer: true, is_writable: true },  // payer (authority)
        { pubkey: gameBytes, is_signer: false, is_writable: true },        // game account
      ],
      data: Array.from(wdData),
    };

    try {
      const bh = await conn.getBestBlockHash();
      const bhBytes = new Uint8Array(32);
      for (let i = 0; i < 32; i++) bhBytes[i] = parseInt(bh.slice(i * 2, i * 2 + 2), 16);

      // Authority is the fee payer (first arg to createSanitizedMessage)
      const san = SanitizedMessageUtil.createSanitizedMessage([ix_wd], authorityPubkey, bhBytes);
      if (!san || !("header" in san)) throw new Error("Failed to create message");
      const hh = new TextDecoder().decode(SanitizedMessageUtil.hash(san));

      // Sign with authority (local — no wallet prompt needed!)
      console.log("  Signing with authority keypair (no wallet prompt)...");
      const authSig = new Uint8Array(bip322SignWithKey(authority.privkey, hh, "testnet"));

      const msg = {
        header: san.header,
        account_keys: san.account_keys.map(function(k: Uint8Array) { return Array.from(k); }),
        recent_blockhash: Array.from(bhBytes),
        instructions: san.instructions.map(function(x: any) {
          return { program_id_index: x.program_id_index, accounts: x.accounts.slice(), data: Array.from(x.data) };
        }),
      };

      const txid = await conn.sendTransaction({
        version: 0, signatures: [Array.from(authSig)], message: msg,
      });
      console.log("  Withdrawal submitted! TXID: " + txid);
      console.log("  BTC payout transaction created. Validators will broadcast it.");
    } catch (err: any) {
      console.log("  Withdraw error: " + (err.message || err));
    }
  }

  console.log("");
  console.log("========================================");
  console.log("  Game complete!");
  console.log("========================================");
}

try { await play(); } catch (e: any) { console.log("Error: " + (e.message || e)); }
`;
