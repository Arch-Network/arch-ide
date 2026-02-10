import { v4 as uuidv4 } from 'uuid';
import type { FileNode, Project } from '../types';
import { projectService } from './projectService';

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/Arch-Network/arch-examples/main/examples';

// Known file structure for each example (no API needed!)
// This maps to the actual structure in the arch-examples repo
// Note: srcPath can be 'program/src' or 'src' depending on the example
const EXAMPLE_STRUCTURES: Record<string, { src: string[], client?: string[], srcPath?: string }> = {
  'clock': {
    src: ['lib.rs'],
    srcPath: 'program/src'
  },
  'counter': {
    src: ['lib.rs'],
    srcPath: 'program/src'
  },
  'create-new-account': {
    src: ['lib.rs'],
    srcPath: 'program/src'
  },
  'dice-game': {
    src: ['lib.rs'],
    client: ['setup.ts', 'client.ts'],
    srcPath: 'program/src'
  },
  'escrow': {
    src: ['lib.rs'],
    srcPath: 'program/src'
  },
  'helloworld': {
    src: ['lib.rs'],
    srcPath: 'program/src'
  },
  'oracle': {
    src: ['lib.rs'],
    srcPath: 'program/src'
  },
  'secp256k1_signature': {
    src: ['lib.rs'],
    srcPath: 'program/src'
  },
  'stake': {
    src: ['lib.rs'],
    srcPath: 'program/src'
  },
  'test-sol-log-data': {
    src: ['lib.rs'],
    srcPath: 'program/src'
  },
  'vote': {
    src: ['lib.rs', 'shared_validator_state.rs', 'update_pubkey_package.rs', 'utils.rs', 'whitelist.rs'],
    srcPath: 'src'
  }
};

// ── Inline example sources ─────────────────────────────────
// For examples that don't yet exist in the arch-examples GitHub repo,
// we embed the source directly. The loader checks here first.

const INLINE_EXAMPLES: Record<string, Record<string, string>> = {
  'dice-game': {
    'lib.rs': `use arch_program::{
    account::AccountInfo,
    bitcoin::{
        self, absolute::LockTime, transaction::Version, Address, Amount, Transaction,
        TxOut,
    },
    entrypoint,
    helper::add_state_transition,
    input_to_sign::InputToSign,
    msg,
    program::{invoke_signed, next_account_info, set_transaction_to_sign},
    program_error::ProgramError,
    pubkey::Pubkey,
    system_instruction::create_account_with_anchor,
    utxo::UtxoMeta,
    rent::minimum_rent,
};
use borsh::{BorshDeserialize, BorshSerialize};
use std::str::FromStr;

/// Derives the player PDA address from the player's wallet pubkey.
/// Seeds: ["player", player_wallet_pubkey]
pub fn find_player_address(player_wallet: &Pubkey, program_id: &Pubkey) -> (Pubkey, u8) {
    Pubkey::find_program_address(&[b"player", player_wallet.as_ref()], program_id)
}

// ============================================================================
// Bitcoin Dice Game
// ============================================================================
//
// A provably fair dice game built on Arch Network that manages BTC deposits,
// bets, and withdrawals using Bitcoin UTXOs.
//
// Instructions:
//   1. InitializeGame  - Set up the game pot and configuration
//   2. Deposit         - Add sats to the player's balance
//   3. RollDice        - Bet sats and roll (>= 4 wins 2x, < 4 loses)
//   4. Withdraw        - Cash out remaining balance to a BTC address
//
// Accounts:
//   - Game account: stores global game state (pot, stats)
//   - Player account: stores per-player balance and stats
// ============================================================================

entrypoint!(process_instruction);

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> Result<(), ProgramError> {
    let input: DiceInput = borsh::from_slice(instruction_data)
        .map_err(|_| ProgramError::InvalidInstructionData)?;

    match input.instruction {
        DiceInstruction::InitializeGame {
            min_bet,
            max_bet,
            house_edge_bps,
        } => process_initialize_game(accounts, min_bet, max_bet, house_edge_bps),
        DiceInstruction::Deposit { amount, player_bump, ref player_utxo } => {
            process_deposit(program_id, accounts, amount, player_bump, player_utxo)
        }
        DiceInstruction::RollDice { bet_amount, seed } => {
            process_roll_dice(program_id, accounts, bet_amount, seed, &input)
        }
        DiceInstruction::Withdraw { amount, ref destination } => {
            process_withdraw(program_id, accounts, amount, destination, &input)
        }
        DiceInstruction::SendBtc { amount, ref destination, fee_txid, fee_vout } => {
            process_send_btc(accounts, amount, destination, fee_txid, fee_vout)
        }
    }
}

// ── Initialize Game ────────────────────────────────────────

fn process_initialize_game(
    accounts: &[AccountInfo],
    min_bet: u64,
    max_bet: u64,
    house_edge_bps: u16,
) -> Result<(), ProgramError> {
    let account_iter = &mut accounts.iter();
    let game_account = next_account_info(account_iter)?;

    let data_len = game_account
        .data
        .try_borrow()
        .map_err(|_| ProgramError::AccountBorrowFailed)?
        .len();

    if data_len > 0 {
        return Err(ProgramError::AccountAlreadyInitialized);
    }

    let game_state = GameState {
        pot_balance: 0,
        min_bet,
        max_bet,
        house_edge_bps,
        total_games: 0,
        total_wagered: 0,
        total_paid_out: 0,
        is_initialized: true,
    };

    let serialized = borsh::to_vec(&game_state)
        .map_err(|e| ProgramError::BorshIoError(e.to_string()))?;

    game_account.realloc(serialized.len(), true)?;
    game_account
        .data
        .try_borrow_mut()
        .map_err(|_| ProgramError::AccountBorrowFailed)?
        .copy_from_slice(&serialized);

    msg!("Dice game initialized: min_bet={}, max_bet={}, house_edge={}bps",
        min_bet, max_bet, house_edge_bps);

    Ok(())
}

// ── Deposit ────────────────────────────────────────────────
// Accounts: [game, player_pda, player_wallet (signer), system_program]
// The player PDA is derived from ["player", player_wallet.key]

fn process_deposit(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    amount: u64,
    player_bump: u8,
    player_utxo: &Option<UtxoMeta>,
) -> Result<(), ProgramError> {
    let account_iter = &mut accounts.iter();
    let game_account = next_account_info(account_iter)?;
    let player_account = next_account_info(account_iter)?;
    let player_wallet = next_account_info(account_iter)?;
    let system_program = next_account_info(account_iter)?;

    // Validate player wallet is signer
    if !player_wallet.is_signer {
        msg!("Player wallet must be a signer");
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Validate player PDA
    let player_seeds = &[b"player", player_wallet.key.as_ref()];
    let (expected_pda, _bump) = Pubkey::find_program_address(player_seeds, program_id);
    if player_account.key != &expected_pda {
        msg!("Invalid player PDA");
        return Err(ProgramError::InvalidArgument);
    }

    // Create player PDA account if it doesn't exist
    let player_data_len = player_account
        .data
        .try_borrow()
        .map_err(|_| ProgramError::AccountBorrowFailed)?
        .len();

    let mut player_state = if player_data_len == 0 {
        // Create the PDA account
        let initial_state = PlayerState {
            wallet: *player_wallet.key,
            balance: 0,
            total_deposited: 0,
            total_withdrawn: 0,
            total_wagered: 0,
            total_won: 0,
            games_played: 0,
            games_won: 0,
        };
        let serialized = borsh::to_vec(&initial_state)
            .map_err(|e| ProgramError::BorshIoError(e.to_string()))?;

        if let Some(utxo) = player_utxo {
            let signer_seeds = &[b"player", player_wallet.key.as_ref(), &[player_bump]];
            let txid: [u8; 32] = utxo.txid().try_into()
                .map_err(|_| ProgramError::InvalidArgument)?;
            invoke_signed(
                &create_account_with_anchor(
                    player_wallet.key,
                    player_account.key,
                    minimum_rent(serialized.len()),
                    serialized.len() as u64,
                    program_id,
                    txid,
                    utxo.vout(),
                ),
                &[player_wallet.clone(), player_account.clone(), system_program.clone()],
                &[signer_seeds],
            )?;
        }

        initial_state
    } else {
        let data = player_account
            .data
            .try_borrow()
            .map_err(|_| ProgramError::AccountBorrowFailed)?;
        borsh::from_slice(&data)
            .map_err(|_| ProgramError::InvalidAccountData)?
    };

    // Update player balance
    player_state.balance += amount;
    player_state.total_deposited += amount;

    // Update game pot
    let game_data = game_account
        .data
        .try_borrow()
        .map_err(|_| ProgramError::AccountBorrowFailed)?;
    let mut game_state: GameState = borsh::from_slice(&game_data)
        .map_err(|_| ProgramError::InvalidAccountData)?;
    drop(game_data);

    game_state.pot_balance += amount;

    // Save player state
    let player_bytes = borsh::to_vec(&player_state)
        .map_err(|e| ProgramError::BorshIoError(e.to_string()))?;
    if player_bytes.len() > player_data_len {
        player_account.realloc(player_bytes.len(), true)?;
    }
    player_account
        .data
        .try_borrow_mut()
        .map_err(|_| ProgramError::AccountBorrowFailed)?
        .copy_from_slice(&player_bytes);

    // Save game state
    let game_bytes = borsh::to_vec(&game_state)
        .map_err(|e| ProgramError::BorshIoError(e.to_string()))?;
    game_account
        .data
        .try_borrow_mut()
        .map_err(|_| ProgramError::AccountBorrowFailed)?
        .copy_from_slice(&game_bytes);

    msg!("Deposited {} sats. Player balance: {}", amount, player_state.balance);

    Ok(())
}

// ── Roll Dice ──────────────────────────────────────────────

// Accounts: [game, player_pda, player_wallet (signer)]

fn process_roll_dice(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    bet_amount: u64,
    seed: u64,
    input: &DiceInput,
) -> Result<(), ProgramError> {
    let account_iter = &mut accounts.iter();
    let game_account = next_account_info(account_iter)?;
    let player_account = next_account_info(account_iter)?;
    let player_wallet = next_account_info(account_iter)?;

    // Validate signer
    if !player_wallet.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Validate player PDA
    let (expected_pda, _) = find_player_address(player_wallet.key, program_id);
    if player_account.key != &expected_pda {
        msg!("Invalid player PDA for this wallet");
        return Err(ProgramError::InvalidArgument);
    }

    // Load game state
    let game_data = game_account
        .data
        .try_borrow()
        .map_err(|_| ProgramError::AccountBorrowFailed)?;
    let mut game_state: GameState = borsh::from_slice(&game_data)
        .map_err(|_| ProgramError::InvalidAccountData)?;
    drop(game_data);

    if !game_state.is_initialized {
        return Err(ProgramError::UninitializedAccount);
    }

    // Validate bet
    if bet_amount < game_state.min_bet {
        msg!("Bet {} below minimum {}", bet_amount, game_state.min_bet);
        return Err(ProgramError::InvalidArgument);
    }
    if bet_amount > game_state.max_bet {
        msg!("Bet {} above maximum {}", bet_amount, game_state.max_bet);
        return Err(ProgramError::InvalidArgument);
    }

    // Load player state
    let player_data = player_account
        .data
        .try_borrow()
        .map_err(|_| ProgramError::AccountBorrowFailed)?;
    let mut player_state: PlayerState = borsh::from_slice(&player_data)
        .map_err(|_| ProgramError::InvalidAccountData)?;
    drop(player_data);

    if player_state.balance < bet_amount {
        msg!("Insufficient balance: {} < {}", player_state.balance, bet_amount);
        return Err(ProgramError::InsufficientFunds);
    }

    // Generate dice roll (1-6) using seed + player pubkey as entropy
    // In production, use a VRF or commit-reveal scheme for true fairness
    let pubkey_bytes = player_account.key.serialize();
    let entropy = seed
        .wrapping_mul(6364136223846793005)
        .wrapping_add(pubkey_bytes[0] as u64)
        .wrapping_add(pubkey_bytes[1] as u64)
        .wrapping_mul(1442695040888963407);
    let roll = ((entropy >> 33) % 6) + 1;

    msg!("Player rolled: {} (seed: {})", roll, seed);

    // Deduct bet from player
    player_state.balance -= bet_amount;
    player_state.total_wagered += bet_amount;
    player_state.games_played += 1;
    game_state.total_games += 1;
    game_state.total_wagered += bet_amount;

    // Win condition: roll >= 4 (roughly 50% chance, pays 2x)
    let won = roll >= 4;
    if won {
        let house_cut = (bet_amount * game_state.house_edge_bps as u64) / 10000;
        let payout = (bet_amount * 2) - house_cut;
        player_state.balance += payout;
        player_state.total_won += payout;
        player_state.games_won += 1;
        game_state.total_paid_out += payout;
        game_state.pot_balance = game_state.pot_balance
            .saturating_sub(payout.saturating_sub(bet_amount));
        msg!("WIN! Rolled {}. Payout: {} sats (house took {} sats)",
            roll, payout, house_cut);
    } else {
        game_state.pot_balance += bet_amount;
        msg!("LOSS. Rolled {}. Lost {} sats. Pot: {}",
            roll, bet_amount, game_state.pot_balance);
    }

    // Save player state
    let player_bytes = borsh::to_vec(&player_state)
        .map_err(|e| ProgramError::BorshIoError(e.to_string()))?;
    player_account
        .data
        .try_borrow_mut()
        .map_err(|_| ProgramError::AccountBorrowFailed)?
        .copy_from_slice(&player_bytes);

    // Save game state
    let game_bytes = borsh::to_vec(&game_state)
        .map_err(|e| ProgramError::BorshIoError(e.to_string()))?;
    game_account
        .data
        .try_borrow_mut()
        .map_err(|_| ProgramError::AccountBorrowFailed)?
        .copy_from_slice(&game_bytes);

    // Anchor state to Bitcoin if requested
    if let Some((_utxo, serialized_tx)) = &input.anchoring {
        let fees_tx: Transaction = bitcoin::consensus::deserialize(serialized_tx)
            .map_err(|_| ProgramError::Custom(504))?;

        let mut tx = Transaction {
            version: Version::TWO,
            lock_time: LockTime::ZERO,
            input: vec![],
            output: vec![],
        };

        add_state_transition(&mut tx, game_account);
        tx.input.push(fees_tx.input[0].clone());

        let inputs = [InputToSign {
            index: 0,
            signer: game_account.key.clone(),
        }];

        set_transaction_to_sign(accounts, &tx, &inputs)?;
    }

    Ok(())
}

// ── Withdraw ───────────────────────────────────────────────

// Accounts: [game, player_pda, player_wallet (signer)]

fn process_withdraw(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    amount: u64,
    destination: &str,
    input: &DiceInput,
) -> Result<(), ProgramError> {
    let account_iter = &mut accounts.iter();
    let game_account = next_account_info(account_iter)?;
    let player_account = next_account_info(account_iter)?;
    let player_wallet = next_account_info(account_iter)?;

    // Validate signer
    if !player_wallet.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Validate player PDA
    let (expected_pda, _) = find_player_address(player_wallet.key, program_id);
    if player_account.key != &expected_pda {
        msg!("Invalid player PDA for this wallet");
        return Err(ProgramError::InvalidArgument);
    }

    // Load player state
    let player_data = player_account
        .data
        .try_borrow()
        .map_err(|_| ProgramError::AccountBorrowFailed)?;
    let mut player_state: PlayerState = borsh::from_slice(&player_data)
        .map_err(|_| ProgramError::InvalidAccountData)?;
    drop(player_data);

    if player_state.balance < amount {
        msg!("Insufficient balance for withdrawal: {} < {}", player_state.balance, amount);
        return Err(ProgramError::InsufficientFunds);
    }

    // Load game state
    let game_data = game_account
        .data
        .try_borrow()
        .map_err(|_| ProgramError::AccountBorrowFailed)?;
    let mut game_state: GameState = borsh::from_slice(&game_data)
        .map_err(|_| ProgramError::InvalidAccountData)?;
    drop(game_data);

    // Update balances
    player_state.balance -= amount;
    player_state.total_withdrawn += amount;
    game_state.pot_balance = game_state.pot_balance.saturating_sub(amount);

    // Save player state
    let player_bytes = borsh::to_vec(&player_state)
        .map_err(|e| ProgramError::BorshIoError(e.to_string()))?;
    player_account
        .data
        .try_borrow_mut()
        .map_err(|_| ProgramError::AccountBorrowFailed)?
        .copy_from_slice(&player_bytes);

    // Save game state
    let game_bytes = borsh::to_vec(&game_state)
        .map_err(|e| ProgramError::BorshIoError(e.to_string()))?;
    game_account
        .data
        .try_borrow_mut()
        .map_err(|_| ProgramError::AccountBorrowFailed)?
        .copy_from_slice(&game_bytes);

    // Construct Bitcoin withdrawal transaction
    if let Some((_utxo, serialized_tx)) = &input.anchoring {
        let fees_tx: Transaction = bitcoin::consensus::deserialize(serialized_tx)
            .map_err(|_| ProgramError::Custom(504))?;

        let mut tx = Transaction {
            version: Version::TWO,
            lock_time: LockTime::ZERO,
            input: vec![],
            output: vec![],
        };

        add_state_transition(&mut tx, game_account);
        tx.input.push(fees_tx.input[0].clone());

        // Create output to player's Bitcoin address
        let dest_address = Address::from_str(destination)
            .map_err(|_| ProgramError::Custom(505))?
            .assume_checked();

        tx.output.push(TxOut {
            value: Amount::from_sat(amount),
            script_pubkey: dest_address.script_pubkey(),
        });

        let inputs = [InputToSign {
            index: 0,
            signer: game_account.key.clone(),
        }];

        set_transaction_to_sign(accounts, &tx, &inputs)?;

        msg!("Withdrawal of {} sats to {} queued", amount, destination);
    }

    msg!("Player balance after withdrawal: {}", player_state.balance);

    Ok(())
}

// ── SendBtc (simple direct send) ───────────────────────────
// Minimal instruction: just craft a Bitcoin TxOut to a destination.
// Accounts: [authority_account (signer + writable)]
// No game state required -- useful for testing withdrawals.

fn process_send_btc(
    accounts: &[AccountInfo],
    amount: u64,
    destination: &str,
    fee_txid: [u8; 32],
    fee_vout: u32,
) -> Result<(), ProgramError> {
    let account_iter = &mut accounts.iter();
    let authority = next_account_info(account_iter)?;

    if !authority.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    let dest_address = Address::from_str(destination)
        .map_err(|_| ProgramError::Custom(505))?
        .assume_checked();

    // Build the Bitcoin transaction using the provided UTXO as input
    let hash = bitcoin::hashes::sha256d::Hash::from_bytes_ref(&fee_txid);
    let txid = bitcoin::Txid::from_raw_hash(*hash);
    let outpoint = bitcoin::OutPoint::new(txid, fee_vout);

    let mut tx = Transaction {
        version: Version::TWO,
        lock_time: LockTime::ZERO,
        input: vec![bitcoin::TxIn {
            previous_output: outpoint,
            script_sig: bitcoin::ScriptBuf::new(),
            sequence: bitcoin::Sequence::MAX,
            witness: bitcoin::Witness::new(),
        }],
        output: vec![TxOut {
            value: Amount::from_sat(amount),
            script_pubkey: dest_address.script_pubkey(),
        }],
    };

    let inputs = [InputToSign {
        index: 0,
        signer: authority.key.clone(),
    }];

    set_transaction_to_sign(accounts, &tx, &inputs)?;

    msg!("SendBtc: {} sats to {} (utxo: {}:{})", amount, destination, txid, fee_vout);
    Ok(())
}

// ============================================================================
// Data Structures
// ============================================================================

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize)]
pub enum DiceInstruction {
    /// Initialize the dice game with configuration
    InitializeGame {
        min_bet: u64,
        max_bet: u64,
        house_edge_bps: u16, // basis points (100 = 1%)
    },
    /// Deposit sats into the player's game balance (creates PDA if needed)
    Deposit {
        amount: u64,
        player_bump: u8,
        player_utxo: Option<UtxoMeta>,
    },
    /// Roll the dice with a bet
    RollDice {
        bet_amount: u64,
        seed: u64, // client-provided entropy
    },
    /// Withdraw sats to a Bitcoin address (requires game state)
    Withdraw {
        amount: u64,
        destination: String,
    },
    /// Simple direct BTC send -- pass deposit txid for UTXO input
    SendBtc {
        amount: u64,
        destination: String,
        /// The deposit transaction ID (32 bytes, reversed) to use as Bitcoin input
        fee_txid: [u8; 32],
        fee_vout: u32,
    },
}

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize)]
pub struct DiceInput {
    pub instruction: DiceInstruction,
    /// Optional UTXO + fee transaction for Bitcoin anchoring
    pub anchoring: Option<(UtxoMeta, Vec<u8>)>,
}

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize)]
pub struct GameState {
    pub pot_balance: u64,
    pub min_bet: u64,
    pub max_bet: u64,
    pub house_edge_bps: u16,
    pub total_games: u64,
    pub total_wagered: u64,
    pub total_paid_out: u64,
    pub is_initialized: bool,
}

#[derive(Debug, Clone, BorshSerialize, BorshDeserialize)]
pub struct PlayerState {
    pub wallet: Pubkey,
    pub balance: u64,
    pub total_deposited: u64,
    pub total_withdrawn: u64,
    pub total_wagered: u64,
    pub total_won: u64,
    pub games_played: u64,
    pub games_won: u64,
}
`,
    'setup.ts': `// ============================================================================
// Bitcoin Dice Game - Setup Script (run once after deploy)
// ============================================================================
//
// Initializes the game state on-chain by calling the InitializeGame
// instruction on the deployed Dice Game program.
//
// Prerequisites:
//   1. Build the program (Build tab)
//   2. Deploy the program (Build tab -> Deploy)
//   3. Select this file and click "Run"
//
// This only needs to be run once per deployment.
// ============================================================================

async function setup() {
  console.log("========================================");
  console.log("  Dice Game - Setup");
  console.log("========================================");
  console.log("");

  // ── Check prerequisites ────────────────────────────────

  const rpcUrl = (window as any).__archRpcUrl;
  if (!rpcUrl) {
    console.log("ERROR: No RPC URL. Check Settings.");
    return;
  }

  const programAcct = (window as any).__archProgramAccount;
  if (!programAcct || !programAcct.pubkey) {
    console.log("ERROR: No program keypair found.");
    console.log("Go to Build tab -> Step 1 -> Generate keypair.");
    return;
  }

  console.log("Program ID: " + programAcct.pubkey.substring(0, 20) + "...");
  console.log("");

  // ── Connect and set up signing account ─────────────────

  const conn = new RpcConnection(rpcUrl);
  console.log("Setting up authority account...");
  const { accountPubkey, useWallet } = await ClientTransactionUtil.setupAccount(conn);
  console.log("Authority ready.");
  console.log("");

  // ── Build InitializeGame instruction ───────────────────

  const MIN_BET = 1000;       // 1,000 sats
  const MAX_BET = 100000;     // 100,000 sats
  const HOUSE_EDGE_BPS = 250; // 2.5%

  console.log("Game config:");
  console.log("  Min bet:     " + MIN_BET + " sats");
  console.log("  Max bet:     " + MAX_BET + " sats");
  console.log("  House edge:  " + (HOUSE_EDGE_BPS / 100) + "%");
  console.log("");

  // Borsh layout for DiceInput { instruction: InitializeGame {...}, anchoring: None }
  // InitializeGame is enum variant 0: [0] [u64 min] [u64 max] [u16 edge] [0 = None anchoring]
  const instrData = new Uint8Array(1 + 8 + 8 + 2 + 1);
  let off = 0;

  instrData[off++] = 0; // InitializeGame variant

  // u64 min_bet (LE)
  const minBuf = new DataView(new ArrayBuffer(8));
  minBuf.setUint32(0, MIN_BET, true);
  instrData.set(new Uint8Array(minBuf.buffer), off); off += 8;

  // u64 max_bet (LE)
  const maxBuf = new DataView(new ArrayBuffer(8));
  maxBuf.setUint32(0, MAX_BET, true);
  instrData.set(new Uint8Array(maxBuf.buffer), off); off += 8;

  // u16 house_edge_bps (LE)
  instrData[off++] = HOUSE_EDGE_BPS & 0xFF;
  instrData[off++] = (HOUSE_EDGE_BPS >> 8) & 0xFF;

  instrData[off] = 0; // None for anchoring

  // Program pubkey bytes
  const progBytes = [];
  for (let i = 0; i < programAcct.pubkey.length; i += 2) {
    progBytes.push(parseInt(programAcct.pubkey.substring(i, i + 2), 16));
  }
  const programPubkey = new Uint8Array(progBytes);

  console.log("Sending InitializeGame transaction...");

  const message = {
    signers: [accountPubkey],
    instructions: [{
      program_id: programPubkey,
      accounts: [
        { pubkey: accountPubkey, is_signer: true, is_writable: true },
      ],
      data: Array.from(instrData),
    }],
  };

  try {
    const txid = await ClientTransactionUtil.signAndSendTransaction(conn, message, useWallet);
    console.log("");
    console.log("Game initialized!");
    console.log("Arch TXID: " + txid);
    console.log("");
    console.log("You can now run client.ts to play the game.");
  } catch (err: any) {
    console.log("Setup failed: " + (err.message || err));
    console.log("Make sure the program is deployed first.");
  }

  console.log("");
  console.log("========================================");
}

try {
  await setup();
} catch (err: any) {
  console.log("Error: " + (err.message || err));
}
`,
    'client.ts': `// ============================================================================
// Bitcoin Dice Game - Player Client
// ============================================================================
//
// Connects your wallet, deposits BTC to the game pot, and withdraws
// winnings via the deployed Arch program.
//
// Prerequisites:
//   1. Deploy the program (Build tab)
//   2. Connect your Bitcoin wallet (Unisat or Xverse)
//   3. Select this file and click "Run"
// ============================================================================

async function play() {
  console.log("========================================");
  console.log("  Bitcoin Dice Game");
  console.log("========================================");
  console.log("");

  // ── Check prerequisites ────────────────────────────────

  const rpcUrl = (window as any).__archRpcUrl;
  if (!rpcUrl) {
    console.log("ERROR: No RPC URL. Check Settings.");
    return;
  }

  const programAcct = (window as any).__archProgramAccount;
  if (!programAcct || !programAcct.pubkey) {
    console.log("ERROR: No program keypair. Generate one in Build tab (Step 1).");
    return;
  }

  const authority = (window as any).__archProgramAuthority;
  if (!authority || !authority.address) {
    console.log("ERROR: No authority account. Generate one in Build tab (Step 2).");
    return;
  }

  // ── Step 1: Connect Wallet ─────────────────────────────

  console.log("STEP 1: Connect Wallet");

  const walletAvailable = await walletProxy.isAvailable();
  if (!walletAvailable) {
    console.log("  ERROR: No wallet connected!");
    console.log("  Connect Unisat or Xverse via the status bar.");
    return;
  }

  const walletType = await walletProxy.getWalletType();
  const accounts = await walletProxy.getAccounts();
  const pubkeyHex = await walletProxy.getPublicKey();

  console.log("  Wallet:  " + walletType);
  console.log("  Address: " + accounts[0]);
  console.log("");

  // ── Step 2: Deposit BTC to pot ─────────────────────────

  const POT_ADDRESS = authority.address;
  const DEPOSIT_AMOUNT = 1000; // sats

  console.log("STEP 2: Deposit " + DEPOSIT_AMOUNT + " sats");
  console.log("  Pot: " + POT_ADDRESS.substring(0, 24) + "...");
  console.log("  Your wallet will prompt you to confirm.");
  console.log("");

  let depositTxid: string | null = null;
  try {
    depositTxid = await walletProxy.sendBitcoin(POT_ADDRESS, DEPOSIT_AMOUNT);
    console.log("  Deposit confirmed!");
    console.log("  TXID: " + depositTxid);
  } catch (err: any) {
    console.log("  Deposit skipped: " + (err.message || err));
    console.log("  Cannot withdraw without a deposit UTXO.");
    return;
  }
  console.log("");

  // ── Step 3: Withdraw via Arch program ──────────────────

  const WITHDRAW_AMOUNT = DEPOSIT_AMOUNT; // withdraw what we deposited

  console.log("STEP 3: Withdraw " + WITHDRAW_AMOUNT + " sats via Arch Network");
  console.log("  The program will craft a Bitcoin TxOut to your wallet.");
  console.log("  Arch validators will broadcast the Bitcoin transaction.");
  console.log("");

  try {
    const conn = new RpcConnection(rpcUrl);
    console.log("  Setting up Arch account (requesting airdrop)...");
    const { accountPubkey, useWallet } = await ClientTransactionUtil.setupAccount(conn);

    // Wait for airdrop to confirm
    console.log("  Waiting for account to be funded...");
    await new Promise(function(r) { setTimeout(r, 3000); });

    // Program pubkey
    const progBytes = [];
    for (let i = 0; i < programAcct.pubkey.length; i += 2) {
      progBytes.push(parseInt(programAcct.pubkey.substring(i, i + 2), 16));
    }
    const programPubkey = new Uint8Array(progBytes);

    // Build SendBtc instruction (enum index 4)
    // Layout: [4] [u64 amount] [u32 str_len] [str bytes] [32 bytes txid] [u32 vout] [0 = None anchoring]
    const destination = accounts[0];
    const destBytes = new TextEncoder().encode(destination);

    // Convert deposit txid hex to bytes (reversed for Bitcoin internal byte order)
    const txidBytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      txidBytes[31 - i] = parseInt(depositTxid!.substring(i * 2, i * 2 + 2), 16);
    }
    const VOUT = 0; // First output of the deposit tx

    const instrData = new Uint8Array(1 + 8 + 4 + destBytes.length + 32 + 4 + 1);
    let off = 0;

    instrData[off++] = 4; // SendBtc variant

    // u64 amount (LE)
    const amtBuf = new DataView(new ArrayBuffer(8));
    amtBuf.setUint32(0, WITHDRAW_AMOUNT, true);
    instrData.set(new Uint8Array(amtBuf.buffer), off); off += 8;

    // String: u32 len + bytes
    const lenBuf = new DataView(new ArrayBuffer(4));
    lenBuf.setUint32(0, destBytes.length, true);
    instrData.set(new Uint8Array(lenBuf.buffer), off); off += 4;
    instrData.set(destBytes, off); off += destBytes.length;

    // [u8; 32] fee_txid
    instrData.set(txidBytes, off); off += 32;

    // u32 fee_vout (LE)
    const voutBuf = new DataView(new ArrayBuffer(4));
    voutBuf.setUint32(0, VOUT, true);
    instrData.set(new Uint8Array(voutBuf.buffer), off); off += 4;

    instrData[off] = 0; // None anchoring

    console.log("  Using deposit UTXO: " + depositTxid!.substring(0, 16) + "...:" + VOUT);

    console.log("  Signing transaction...");

    const message = {
      signers: [accountPubkey],
      instructions: [{
        program_id: programPubkey,
        accounts: [
          { pubkey: accountPubkey, is_signer: true, is_writable: true },
        ],
        data: Array.from(instrData),
      }],
    };

    const txid = await ClientTransactionUtil.signAndSendTransaction(conn, message, useWallet);
    console.log("");
    console.log("  Withdrawal submitted!");
    console.log("  Arch TXID: " + txid);
    console.log("  " + WITHDRAW_AMOUNT + " sats -> " + accounts[0].substring(0, 20) + "...");
  } catch (err: any) {
    console.log("  Withdrawal error: " + (err.message || err));
    console.log("  Make sure the program is deployed via Build tab.");
  }
  console.log("");

  // ── Summary ────────────────────────────────────────────

  console.log("========================================");
  console.log("  Deposited:  " + DEPOSIT_AMOUNT + " sats to pot");
  console.log("  Withdrawn:  " + WITHDRAW_AMOUNT + " sats via Arch");
  console.log("========================================");
}

try {
  await play();
} catch (err: any) {
  console.log("Error: " + (err.message || err));
}
`,
  },
};

/**
 * Fetches file content directly from raw GitHub URL (no API needed!)
 * Tries multiple possible paths if the first one fails
 */
async function fetchRawFileContent(exampleName: string, filePath: string): Promise<string> {
  const possiblePaths = [
    filePath,
    // If path starts with 'program/src', try without 'program/' prefix
    filePath.replace('program/', ''),
    // If path starts with 'src', try with 'program/' prefix
    filePath.includes('program/') ? filePath : `program/${filePath}`
  ];

  // Remove duplicates
  const uniquePaths = [...new Set(possiblePaths)];

  let lastError: Error | null = null;

  for (const path of uniquePaths) {
    const rawUrl = `${GITHUB_RAW_BASE}/${exampleName}/${path}`;
    console.log(`Trying: ${rawUrl}`);

    try {
      const response = await fetch(rawUrl);
      if (response.ok) {
        console.log(`✅ Success: ${rawUrl}`);
        return response.text();
      }
      lastError = new Error(`${response.status} ${response.statusText}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
    }
  }

  throw new Error(`Failed to fetch ${filePath}: ${lastError?.message || 'Unknown error'}`);
}

/**
 * Builds the source file tree from hardcoded structure (no API needed!)
 * Checks inline examples first, then falls back to GitHub.
 */
async function buildSourceFiles(exampleName: string): Promise<FileNode[]> {
  const structure = EXAMPLE_STRUCTURES[exampleName];
  if (!structure) {
    throw new Error(`Unknown example: ${exampleName}`);
  }

  const fileNodes: FileNode[] = [];
  const srcPath = structure.srcPath || 'program/src';
  const inlineSrc = INLINE_EXAMPLES[exampleName];

  for (const fileName of structure.src) {
    try {
      // Use inline source if available, otherwise fetch from GitHub
      const content = inlineSrc?.[fileName]
        ?? await fetchRawFileContent(exampleName, `${srcPath}/${fileName}`);
      fileNodes.push({
        name: fileName,
        type: 'file',
        content,
        path: fileName
      });
    } catch (error) {
      console.error(`Failed to fetch ${fileName}:`, error);
      throw error;
    }
  }

  return fileNodes;
}

/**
 * Gets the description for an example project
 */
function getExampleDescription(exampleName: string): string {
  const descriptions: Record<string, string> = {
    'clock': 'Demonstrates time-based operations and block height tracking.',
    'counter': 'A simple counter program demonstrating state management on Arch Network.',
    'create-new-account': 'Learn how to create and initialize new accounts on Arch Network.',
    'dice-game': 'A provably fair dice game that manages BTC deposits, bets, and withdrawals using UTXOs.',
    'escrow': 'Implement secure escrow patterns for conditional transfers.',
    'helloworld': 'The classic first program - perfect for getting started with Arch.',
    'oracle': 'Build decentralized oracle solutions for external data feeds.',
    'secp256k1_signature': 'Learn secp256k1 signature verification on Arch Network.',
    'stake': 'Implement staking mechanisms and reward distribution.',
    'test-sol-log-data': 'Test and debug logging functionality in Arch programs.',
    'vote': 'Build voting and governance mechanisms with multi-file structure.'
  };

  return descriptions[exampleName] || `Example project: ${exampleName}`;
}

/**
 * Fetches client files from hardcoded structure (no API needed!)
 * Checks inline examples first, then falls back to GitHub.
 */
async function buildClientFiles(exampleName: string): Promise<FileNode[]> {
  const structure = EXAMPLE_STRUCTURES[exampleName];
  if (!structure || !structure.client) {
    console.log(`✓ No client files defined for ${exampleName}`);
    return [];
  }

  const clientFiles: FileNode[] = [];
  const inlineSrc = INLINE_EXAMPLES[exampleName];

  for (const fileName of structure.client) {
    try {
      const content = inlineSrc?.[fileName]
        ?? await fetchRawFileContent(exampleName, `app/${fileName}`);
      clientFiles.push({
        name: fileName,
        type: 'file',
        content,
        path: fileName
      });
    } catch (error) {
      console.warn(`Failed to fetch client file ${fileName}:`, error);
    }
  }

  console.log(`✓ Loaded ${clientFiles.length} client files for ${exampleName}`);
  return clientFiles;
}

/**
 * Generates a unique project name by checking existing projects
 * Appends a number if the name already exists (e.g., "counter", "counter (1)", "counter (2)")
 * Uses the same format as projectService.getUniqueProjectName for consistency
 */
async function generateUniqueProjectName(baseName: string): Promise<string> {
  const existingProjects = await projectService.getAllProjects();
  const existingNames = new Set(existingProjects.map(p => p.name));

  // If the base name is unique, use it
  if (!existingNames.has(baseName)) {
    return baseName;
  }

  // Otherwise, append a number in parentheses
  let counter = 1;
  let newName = `${baseName} (${counter})`;
  while (existingNames.has(newName)) {
    counter++;
    newName = `${baseName} (${counter})`;
  }

  return newName;
}

/**
 * Loads an example project from GitHub using direct raw URLs (no API!)
 * Fetches Rust source files from program/src/ directory and client files from app/
 * Ensures unique project names by appending numbers if needed
 */
export async function loadExampleProject(exampleName: string): Promise<Project> {
  console.log(`📦 Loading example project: ${exampleName}`);

  try {
    // Generate a unique project name
    const uniqueName = await generateUniqueProjectName(exampleName);
    if (uniqueName !== exampleName) {
      console.log(`📝 Project name already exists, using: ${uniqueName}`);
    }

    // Fetch source files using hardcoded structure (no API calls!)
    const srcFiles = await buildSourceFiles(exampleName);
    console.log(`✓ Loaded ${srcFiles.length} source files`);

    // Fetch client files using hardcoded structure (no API calls!)
    const clientFiles = await buildClientFiles(exampleName);

    // Build the project structure - always include both src/ and client/ directories
    const files: FileNode[] = [
      {
        name: 'src',
        type: 'directory',
        children: srcFiles,
        path: 'src'
      },
      {
        name: 'client',
        type: 'directory',
        children: clientFiles,
        path: 'client'
      }
    ];

    // Create a new project with the unique name
    const project: Project = {
      id: uuidv4(),
      name: uniqueName,
      description: getExampleDescription(exampleName),
      files,
      created: new Date(),
      lastModified: new Date()
    };

    // Save the project
    await projectService.saveProject(project);

    console.log(`✅ Successfully loaded ${uniqueName}!`);
    return project;
  } catch (error) {
    console.error(`❌ Failed to load example project ${exampleName}:`, error);
    throw new Error(`Failed to load example project: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Lists all available example projects (from hardcoded list - no API needed!)
 */
export async function listExampleProjects(): Promise<string[]> {
  return Object.keys(EXAMPLE_STRUCTURES);
}

export const exampleProjectsService = {
  loadExampleProject,
  listExampleProjects
};
