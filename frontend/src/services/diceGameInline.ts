// Inline source code for the Bitcoin Dice Game example project.
// Separated from exampleProjectsService.ts for maintainability.

export const DICE_GAME_LIB_RS = `use arch_program::{
    account::AccountInfo,
    bitcoin::{
        self, absolute::LockTime, transaction::Version, Address, Amount, Transaction,
        TxOut,
    },
    entrypoint,
    helper::add_state_transition,
    input_to_sign::InputToSign,
    msg,
    program::{invoke, next_account_info, set_transaction_to_sign},
    program_error::ProgramError,
    pubkey::Pubkey,
    system_instruction::sign_input,
    utxo::UtxoMeta,
};
use borsh::{BorshDeserialize, BorshSerialize};
use std::str::FromStr;

// ============================================================================
// Bitcoin Dice Game
// ============================================================================
//
// A Satoshi Dice-style game on Arch Network.
//
// Architecture:
//   - Game account: holds the pot (BTC UTXO) + player balances + config
//   - Created via setup.ts with create_account_with_anchor (real UTXO)
//   - Players deposit BTC to the game account's address
//   - Players call RollDice to bet from their balance
//   - Players call Withdraw to get BTC sent back to their wallet
//
// Instructions:
//   0. InitializeGame  - Set config (min/max bet, house edge)
//   1. CreditDeposit   - Credit a player's balance after they deposited BTC
//   2. RollDice        - Bet sats, roll 1-6, win on 4-6 (2x minus house edge)
//   3. Withdraw        - Send BTC back to player using pot UTXO
// ============================================================================

entrypoint!(process_instruction);

pub fn process_instruction(
    _program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> Result<(), ProgramError> {
    let instruction: DiceInstruction = borsh::from_slice(instruction_data)
        .map_err(|_| ProgramError::InvalidInstructionData)?;

    match instruction {
        DiceInstruction::InitializeGame { min_bet, max_bet, house_edge_bps } => {
            process_init(accounts, min_bet, max_bet, house_edge_bps)
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
// Accounts: [game_account (signer, writable)]

fn process_init(
    accounts: &[AccountInfo],
    min_bet: u64,
    max_bet: u64,
    house_edge_bps: u16,
) -> Result<(), ProgramError> {
    let account_iter = &mut accounts.iter();
    let game_account = next_account_info(account_iter)?;

    let state = GameState {
        min_bet,
        max_bet,
        house_edge_bps,
        total_games: 0,
        players: vec![],
    };

    let data = borsh::to_vec(&state)
        .map_err(|e| ProgramError::BorshIoError(e.to_string()))?;
    game_account.realloc(data.len(), true)?;
    game_account.data.borrow_mut().copy_from_slice(&data);

    msg!("Game initialized: min={}, max={}, edge={}bps", min_bet, max_bet, house_edge_bps);
    Ok(())
}

// ── CreditDeposit ──────────────────────────────────────────
// Accounts: [game_account (signer, writable)]
// Called after a player sends BTC to the game account's address.

fn process_credit(
    accounts: &[AccountInfo],
    player: Pubkey,
    amount: u64,
) -> Result<(), ProgramError> {
    let account_iter = &mut accounts.iter();
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
// Accounts: [game_account (signer, writable)]

fn process_roll(
    accounts: &[AccountInfo],
    player: Pubkey,
    bet_amount: u64,
    seed: u64,
) -> Result<(), ProgramError> {
    let account_iter = &mut accounts.iter();
    let game_account = next_account_info(account_iter)?;

    let game_data = game_account.data.borrow();
    let mut state: GameState = borsh::from_slice(&game_data)
        .map_err(|_| ProgramError::InvalidAccountData)?;
    drop(game_data);

    // Validate bet
    if bet_amount < state.min_bet || bet_amount > state.max_bet {
        msg!("Bet {} outside range [{}, {}]", bet_amount, state.min_bet, state.max_bet);
        return Err(ProgramError::InvalidArgument);
    }

    // Find player
    let p = state.players.iter_mut().find(|p| p.pubkey == player)
        .ok_or(ProgramError::InvalidArgument)?;

    if p.balance < bet_amount {
        msg!("Insufficient balance: {} < {}", p.balance, bet_amount);
        return Err(ProgramError::InsufficientFunds);
    }

    // Generate roll (1-6) from seed + player pubkey
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
// Accounts: [game_account (signer, writable)]
// Uses add_state_transition to spend the game account's UTXO,
// adds an extra output to send sats to the player's BTC address.

fn process_withdraw(
    accounts: &[AccountInfo],
    player: Pubkey,
    amount: u64,
    destination: &str,
) -> Result<(), ProgramError> {
    let account_iter = &mut accounts.iter();
    let game_account = next_account_info(account_iter)?;

    let game_data = game_account.data.borrow();
    let mut state: GameState = borsh::from_slice(&game_data)
        .map_err(|_| ProgramError::InvalidAccountData)?;
    drop(game_data);

    // Find player and check balance
    let p = state.players.iter_mut().find(|p| p.pubkey == player)
        .ok_or(ProgramError::InvalidArgument)?;

    if p.balance < amount {
        msg!("Insufficient balance for withdrawal: {} < {}", p.balance, amount);
        return Err(ProgramError::InsufficientFunds);
    }

    p.balance -= amount;

    // Save updated state
    let data = borsh::to_vec(&state)
        .map_err(|e| ProgramError::BorshIoError(e.to_string()))?;
    game_account.realloc(data.len(), true)?;
    game_account.data.borrow_mut().copy_from_slice(&data);

    // Build Bitcoin transaction
    let dest_address = Address::from_str(destination)
        .map_err(|_| ProgramError::Custom(505))?
        .assume_checked();

    let mut tx = Transaction {
        version: Version::TWO,
        lock_time: LockTime::ZERO,
        input: vec![],
        output: vec![],
    };

    // add_state_transition spends the game account's UTXO and creates
    // a new output back to the game account (preserving the pot minus withdrawal)
    let _utxo_value = add_state_transition(&mut tx, game_account)?;

    // Add withdrawal output to the player's BTC address
    tx.output.push(TxOut {
        value: Amount::from_sat(amount),
        script_pubkey: dest_address.script_pubkey(),
    });

    // The game account signs input 0 (its own UTXO)
    let inputs_to_sign = [InputToSign {
        index: 0,
        signer: game_account.key.clone(),
    }];

    set_transaction_to_sign(accounts, &tx, &inputs_to_sign)?;

    msg!("Withdraw: {} sats to {}", amount, destination);
    Ok(())
}

// ============================================================================
// Data Structures
// ============================================================================

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize)]
pub enum DiceInstruction {
    InitializeGame {
        min_bet: u64,
        max_bet: u64,
        house_edge_bps: u16,
    },
    CreditDeposit {
        player: Pubkey,
        amount: u64,
    },
    RollDice {
        player: Pubkey,
        bet_amount: u64,
        seed: u64,
    },
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
// Run ONCE after deploying the program to initialize the game state.
//
// What this does:
//   1. Connects to Arch Network
//   2. Calls InitializeGame on the deployed program
//   3. Sets up game config (min/max bet, house edge)
//
// After running this, fund the game account's BTC address with testnet sats.
// The game account address is shown in Build tab -> Step 2 (Authority).
// ============================================================================

async function setup() {
  console.log("========================================");
  console.log("  Dice Game - Setup");
  console.log("========================================");
  console.log("");

  const rpcUrl = (window as any).__archRpcUrl;
  const programAcct = (window as any).__archProgramAccount;

  if (!rpcUrl) { console.log("ERROR: No RPC URL."); return; }
  if (!programAcct) { console.log("ERROR: No program keypair."); return; }

  console.log("Program: " + programAcct.pubkey.substring(0, 20) + "...");

  const conn = new RpcConnection(rpcUrl);
  const { accountPubkey, useWallet } = await ClientTransactionUtil.setupAccount(conn);

  // Build InitializeGame instruction
  // Borsh enum variant 0: [0] [u64 min_bet] [u64 max_bet] [u16 house_edge_bps]
  const MIN_BET = 500;
  const MAX_BET = 50000;
  const HOUSE_EDGE = 250; // 2.5%

  const instrData = new Uint8Array(1 + 8 + 8 + 2);
  let off = 0;
  instrData[off++] = 0; // InitializeGame

  const write_u64 = (val: number, arr: Uint8Array, offset: number) => {
    const buf = new DataView(new ArrayBuffer(8));
    buf.setUint32(0, val & 0xFFFFFFFF, true);
    buf.setUint32(4, Math.floor(val / 0x100000000), true);
    arr.set(new Uint8Array(buf.buffer), offset);
  };

  write_u64(MIN_BET, instrData, off); off += 8;
  write_u64(MAX_BET, instrData, off); off += 8;
  instrData[off++] = HOUSE_EDGE & 0xFF;
  instrData[off++] = (HOUSE_EDGE >> 8) & 0xFF;

  const progBytes = new Uint8Array(programAcct.pubkey.length / 2);
  for (let i = 0; i < progBytes.length; i++) {
    progBytes[i] = parseInt(programAcct.pubkey.substring(i*2, i*2+2), 16);
  }

  console.log("");
  console.log("Config: min=" + MIN_BET + " max=" + MAX_BET + " edge=" + (HOUSE_EDGE/100) + "%");
  console.log("Sending InitializeGame...");

  const message = {
    signers: [accountPubkey],
    instructions: [{
      program_id: progBytes,
      accounts: [
        { pubkey: accountPubkey, is_signer: true, is_writable: true },
      ],
      data: Array.from(instrData),
    }],
  };

  try {
    const txid = await ClientTransactionUtil.signAndSendTransaction(conn, message, useWallet);
    console.log("");
    console.log("Game initialized! TXID: " + txid);
    console.log("");
    console.log("Next: run client.ts to play.");
  } catch (err: any) {
    console.log("Setup error: " + (err.message || err));
  }
}

try { await setup(); } catch (e: any) { console.log("Error: " + (e.message || e)); }
`;

export const DICE_GAME_CLIENT_TS = `// ============================================================================
// Bitcoin Dice Game - Player Client
// ============================================================================
//
// 1. Connect wallet (Unisat/Xverse)
// 2. Deposit BTC to the game pot
// 3. Credit your balance on-chain
// 4. Roll dice
// 5. Withdraw winnings
//
// Prerequisites: Deploy program, run setup.ts, fund the pot address.
// ============================================================================

async function play() {
  console.log("========================================");
  console.log("  Bitcoin Dice Game");
  console.log("========================================");
  console.log("");

  const rpcUrl = (window as any).__archRpcUrl;
  const programAcct = (window as any).__archProgramAccount;
  const authority = (window as any).__archProgramAuthority;

  if (!rpcUrl) { console.log("ERROR: No RPC URL."); return; }
  if (!programAcct) { console.log("ERROR: No program keypair. Build tab Step 1."); return; }
  if (!authority) { console.log("ERROR: No authority. Build tab Step 2."); return; }

  // ── Connect wallet ─────────────────────────────────────

  console.log("Connecting wallet...");
  const available = await walletProxy.isAvailable();
  if (!available) {
    console.log("ERROR: Connect Unisat or Xverse wallet first.");
    return;
  }

  const walletType = await walletProxy.getWalletType();
  const accounts = await walletProxy.getAccounts();
  const pubkeyHex = await walletProxy.getPublicKey();

  console.log("Wallet: " + walletType + " | " + accounts[0].substring(0, 24) + "...");
  console.log("");

  const conn = new RpcConnection(rpcUrl);
  const { accountPubkey, useWallet } = await ClientTransactionUtil.setupAccount(conn);

  const progBytes = new Uint8Array(programAcct.pubkey.length / 2);
  for (let i = 0; i < progBytes.length; i++) {
    progBytes[i] = parseInt(programAcct.pubkey.substring(i*2, i*2+2), 16);
  }

  // Helper: encode a Borsh u64
  const encode_u64 = (val: number): Uint8Array => {
    const buf = new DataView(new ArrayBuffer(8));
    buf.setUint32(0, val & 0xFFFFFFFF, true);
    buf.setUint32(4, Math.floor(val / 0x100000000), true);
    return new Uint8Array(buf.buffer);
  };

  // Player pubkey as 32 bytes
  const playerPubkey = new Uint8Array(accountPubkey);

  // ── Deposit BTC ────────────────────────────────────────

  const POT_ADDRESS = authority.address;
  const DEPOSIT = 1000;

  console.log("STEP 1: Deposit " + DEPOSIT + " sats to pot");
  console.log("  Pot: " + POT_ADDRESS.substring(0, 24) + "...");

  let depositOk = false;
  try {
    const txid = await walletProxy.sendBitcoin(POT_ADDRESS, DEPOSIT);
    console.log("  TXID: " + txid);
    depositOk = true;
  } catch (err: any) {
    console.log("  Skipped: " + (err.message || err));
  }
  console.log("");

  // ── Credit balance on-chain ────────────────────────────

  if (depositOk) {
    console.log("STEP 2: Credit " + DEPOSIT + " sats on-chain");

    // CreditDeposit = enum 1: [1] [32 bytes pubkey] [u64 amount]
    const creditData = new Uint8Array(1 + 32 + 8);
    creditData[0] = 1;
    creditData.set(playerPubkey, 1);
    creditData.set(encode_u64(DEPOSIT), 33);

    try {
      const txid = await ClientTransactionUtil.signAndSendTransaction(conn, {
        signers: [accountPubkey],
        instructions: [{
          program_id: progBytes,
          accounts: [{ pubkey: accountPubkey, is_signer: true, is_writable: true }],
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

  console.log("STEP 3: Roll dice (bet 500 sats)");

  // RollDice = enum 2: [2] [32 bytes pubkey] [u64 bet] [u64 seed]
  const BET = 500;
  const SEED = Math.floor(Math.random() * 1000000);

  const rollData = new Uint8Array(1 + 32 + 8 + 8);
  rollData[0] = 2;
  rollData.set(playerPubkey, 1);
  rollData.set(encode_u64(BET), 33);
  rollData.set(encode_u64(SEED), 41);

  try {
    const txid = await ClientTransactionUtil.signAndSendTransaction(conn, {
      signers: [accountPubkey],
      instructions: [{
        program_id: progBytes,
        accounts: [{ pubkey: accountPubkey, is_signer: true, is_writable: true }],
        data: Array.from(rollData),
      }],
    }, useWallet);
    console.log("  Rolled! TXID: " + txid);
    console.log("  Check the explorer for the roll result in program logs.");
  } catch (err: any) {
    console.log("  Roll error: " + (err.message || err));
  }
  console.log("");

  // ── Withdraw ───────────────────────────────────────────

  const WITHDRAW = 500;
  console.log("STEP 4: Withdraw " + WITHDRAW + " sats to " + accounts[0].substring(0, 20) + "...");

  // Withdraw = enum 3: [3] [32 bytes pubkey] [u64 amount] [u32 str_len] [str bytes]
  const destBytes = new TextEncoder().encode(accounts[0]);
  const wdData = new Uint8Array(1 + 32 + 8 + 4 + destBytes.length);
  let woff = 0;
  wdData[woff++] = 3;
  wdData.set(playerPubkey, woff); woff += 32;
  wdData.set(encode_u64(WITHDRAW), woff); woff += 8;
  const lenBuf = new DataView(new ArrayBuffer(4));
  lenBuf.setUint32(0, destBytes.length, true);
  wdData.set(new Uint8Array(lenBuf.buffer), woff); woff += 4;
  wdData.set(destBytes, woff);

  try {
    const txid = await ClientTransactionUtil.signAndSendTransaction(conn, {
      signers: [accountPubkey],
      instructions: [{
        program_id: progBytes,
        accounts: [{ pubkey: accountPubkey, is_signer: true, is_writable: true }],
        data: Array.from(wdData),
      }],
    }, useWallet);
    console.log("  Withdrawal submitted! TXID: " + txid);
    console.log("  The program crafted a Bitcoin TxOut to your wallet.");
    console.log("  Arch validators will broadcast it.");
  } catch (err: any) {
    console.log("  Withdraw error: " + (err.message || err));
  }

  console.log("");
  console.log("========================================");
}

try { await play(); } catch (e: any) { console.log("Error: " + (e.message || e)); }
`;
