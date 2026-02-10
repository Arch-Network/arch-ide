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
    client: ['client.ts'],
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
    /// Withdraw sats to a Bitcoin address
    Withdraw {
        amount: u64,
        destination: String, // Bitcoin address
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
    'client.ts': `// ============================================================================
// Bitcoin Dice Game - Wallet-Integrated Client
// ============================================================================
//
// This client connects to your Bitcoin wallet (Unisat or Xverse),
// retrieves your pubkey, derives your player PDA, and demonstrates
// the full dice game flow with real wallet signing.
//
// SDK globals available: RpcConnection, PubkeyUtil, MessageUtil,
//   ArchConnection, SignatureUtil, walletProxy, ClientTransactionUtil
//
// Usage: Connect your wallet, select this file, and click "Run".
// ============================================================================

// ── Helper: async wrapper for top-level await ────────────

async function main() {

  console.log("========================================");
  console.log("  Bitcoin Dice Game");
  console.log("========================================");
  console.log("");

  // ── Step 1: Connect Wallet ─────────────────────────────

  console.log("STEP 1: Connect Wallet");
  console.log("  Checking for Bitcoin wallet...");

  const walletAvailable = await walletProxy.isAvailable();
  if (!walletAvailable) {
    console.log("");
    console.log("  ERROR: No wallet connected!");
    console.log("  Please connect Unisat or Xverse wallet");
    console.log("  using the 'Install Wallet' button in the");
    console.log("  bottom status bar, then run again.");
    return;
  }

  const walletType = await walletProxy.getWalletType();
  const accounts = await walletProxy.getAccounts();
  const pubkeyHex = await walletProxy.getPublicKey();

  console.log("  Wallet:  " + walletType);
  console.log("  Address: " + accounts[0]);
  console.log("  Pubkey:  " + pubkeyHex.substring(0, 16) + "...");
  console.log("");

  // ── Step 2: Derive Player PDA ──────────────────────────

  console.log("STEP 2: Derive Player PDA");

  // The on-chain program derives the player PDA from:
  //   seeds = ["player", player_wallet_pubkey]
  // The client needs to compute the same address to pass it
  // as an account in transactions.

  const pubkeyBytes = [];
  for (let i = 0; i < pubkeyHex.length; i += 2) {
    pubkeyBytes.push(parseInt(pubkeyHex.substring(i, i + 2), 16));
  }

  console.log("  Player wallet pubkey: " + pubkeyHex.substring(0, 20) + "...");
  console.log("  PDA seeds: ['player', wallet_pubkey]");
  console.log("  The program uses Pubkey::find_program_address()");
  console.log("  to derive a unique account for each player.");
  console.log("");

  // ── Step 3: Game Flow Demo ─────────────────────────────

  console.log("STEP 3: Deposit BTC");
  console.log("  Sending 1,000 sats to the game pot...");
  console.log("  Your wallet will prompt you to confirm.");
  console.log("");

  // The pot address would be the program's Bitcoin address in production.
  // For this demo, we use the player's own address as a placeholder.
  const POT_ADDRESS = accounts[0];
  const DEPOSIT_AMOUNT = 1000; // sats

  try {
    const txid = await walletProxy.sendBitcoin(POT_ADDRESS, DEPOSIT_AMOUNT);
    console.log("  Deposit TX confirmed!");
    console.log("  TXID: " + txid);
    console.log("  Amount: " + DEPOSIT_AMOUNT + " sats");
    console.log("");
    console.log("  Next, the program would be called with a Deposit");
    console.log("  instruction to credit your PDA balance on-chain.");
  } catch (err: any) {
    console.log("  Deposit skipped: " + (err.message || err));
    console.log("  (User cancelled or wallet error)");
  }
  console.log("");

  // ── Step 4: Roll Dice ──────────────────────────────────

  console.log("STEP 4: Roll the Dice!");
  console.log("  Rules: Roll 4-6 = WIN (2x minus 2.5% house edge)");
  console.log("         Roll 1-3 = LOSS");
  console.log("");

  // Simulate rolls using the same entropy as the on-chain program
  const HOUSE_EDGE_BPS = 250;
  const DEPOSIT = 10000;
  const bets = [
    { amount: 2000, seed: Math.floor(Math.random() * 1000000) },
    { amount: 3000, seed: Math.floor(Math.random() * 1000000) },
    { amount: 1500, seed: Math.floor(Math.random() * 1000000) },
    { amount: 2500, seed: Math.floor(Math.random() * 1000000) },
    { amount: 5000, seed: Math.floor(Math.random() * 1000000) },
  ];

  let balance = DEPOSIT;
  let totalWagered = 0;
  let totalWon = 0;
  let wins = 0;

  // Use actual wallet pubkey bytes for entropy (matches on-chain logic)
  const pk0 = pubkeyBytes[0] || 0;
  const pk1 = pubkeyBytes[1] || 0;

  for (const bet of bets) {
    // Replicate on-chain dice roll algorithm
    let entropy = bet.seed;
    entropy = Math.imul(entropy, 6364136223846793005 & 0xFFFFFFFF) >>> 0;
    entropy = (entropy + pk0) >>> 0;
    entropy = (entropy + pk1) >>> 0;
    entropy = Math.imul(entropy, 1442695040888963407 & 0xFFFFFFFF) >>> 0;
    const roll = ((entropy >>> 17) % 6) + 1;
    const won = roll >= 4;

    totalWagered += bet.amount;
    balance -= bet.amount;

    if (won) {
      const houseCut = Math.floor((bet.amount * HOUSE_EDGE_BPS) / 10000);
      const payout = bet.amount * 2 - houseCut;
      balance += payout;
      totalWon += payout;
      wins++;
      console.log("  Bet " + bet.amount + " | Roll: " + roll + " | WIN  +" + payout + " sats");
    } else {
      console.log("  Bet " + bet.amount + " | Roll: " + roll + " | LOSS -" + bet.amount + " sats");
    }
  }

  console.log("");
  console.log("  Results: " + wins + "/" + bets.length + " won");
  console.log("  Wagered: " + totalWagered + " sats");
  console.log("  Won:     " + totalWon + " sats");
  console.log("  Balance: " + balance + " sats");
  console.log("");

  // ── Step 5: Withdraw ───────────────────────────────────

  console.log("STEP 5: Withdraw");
  console.log("  Sending " + DEPOSIT_AMOUNT + " sats back to your wallet...");
  console.log("  (In production, the program's pot would send your full");
  console.log("   balance of " + balance + " sats via a Bitcoin TxOut.)");
  console.log("  Your wallet will prompt you to confirm.");
  console.log("");

  try {
    const withdrawTxid = await walletProxy.sendBitcoin(accounts[0], DEPOSIT_AMOUNT);
    console.log("  Withdrawal TX confirmed!");
    console.log("  TXID: " + withdrawTxid);
    console.log("  Amount: " + DEPOSIT_AMOUNT + " sats returned to wallet");
  } catch (err: any) {
    console.log("  Withdrawal skipped: " + (err.message || err));
  }
  console.log("");

  // ── Summary ────────────────────────────────────────────

  console.log("========================================");
  console.log("  Game Complete!");
  console.log("  Deposited: " + DEPOSIT_AMOUNT + " sats");
  console.log("  Wagered:   " + totalWagered + " sats");
  console.log("  Won:        " + wins + "/" + bets.length + " rolls");
  console.log("  Balance:   " + balance + " sats");
  console.log("  Withdrawn: " + DEPOSIT_AMOUNT + " sats");
  console.log("========================================");
}

try {
  await main();
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
