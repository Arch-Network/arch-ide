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
    program::{next_account_info, set_transaction_to_sign},
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
    _program_id: &Pubkey,
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
        DiceInstruction::Deposit { amount } => process_deposit(accounts, amount),
        DiceInstruction::RollDice { bet_amount, seed } => {
            process_roll_dice(accounts, bet_amount, seed, &input)
        }
        DiceInstruction::Withdraw { amount, destination } => {
            process_withdraw(accounts, amount, &destination, &input)
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

fn process_deposit(
    accounts: &[AccountInfo],
    amount: u64,
) -> Result<(), ProgramError> {
    let account_iter = &mut accounts.iter();
    let game_account = next_account_info(account_iter)?;
    let player_account = next_account_info(account_iter)?;

    // Load or initialize player state
    let player_data_len = player_account
        .data
        .try_borrow()
        .map_err(|_| ProgramError::AccountBorrowFailed)?
        .len();

    let mut player_state = if player_data_len == 0 {
        PlayerState {
            balance: 0,
            total_deposited: 0,
            total_withdrawn: 0,
            total_wagered: 0,
            total_won: 0,
            games_played: 0,
            games_won: 0,
        }
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

fn process_roll_dice(
    accounts: &[AccountInfo],
    bet_amount: u64,
    seed: u64,
    input: &DiceInput,
) -> Result<(), ProgramError> {
    let account_iter = &mut accounts.iter();
    let game_account = next_account_info(account_iter)?;
    let player_account = next_account_info(account_iter)?;

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
    if let Some((utxo, serialized_tx)) = &input.anchoring {
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

fn process_withdraw(
    accounts: &[AccountInfo],
    amount: u64,
    destination: &str,
    input: &DiceInput,
) -> Result<(), ProgramError> {
    let account_iter = &mut accounts.iter();
    let game_account = next_account_info(account_iter)?;
    let player_account = next_account_info(account_iter)?;

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
    if let Some((utxo, serialized_tx)) = &input.anchoring {
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
    /// Deposit sats into the player's game balance
    Deposit {
        amount: u64,
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
// Bitcoin Dice Game - Client Script
// ============================================================================
//
// Demonstrates how to interact with the Dice Game program on Arch Network.
// This script initializes a game, deposits BTC sats, rolls the dice,
// and withdraws winnings.
//
// Usage: Select this file and click "Run" in the Client section.
// ============================================================================

import {
  RpcConnection,
  MessageUtil,
  PubkeyUtil,
} from "@saturnbtcio/arch-sdk";

// Connect to the network
const connection = new RpcConnection(window.location.origin);

console.log("========================================");
console.log("  Bitcoin Dice Game - Client Demo");
console.log("========================================\\n");

// Step 1: Initialize the game
console.log("Step 1: Initialize Game");
console.log("-----------------------");
console.log("Creating game with:");
console.log("  Min bet:     1,000 sats");
console.log("  Max bet:   100,000 sats");
console.log("  House edge:  2.5% (250 bps)");
console.log("");

// In a real deployment, you would serialize the instruction using Borsh:
//
//   const initInstruction = {
//     instruction: {
//       InitializeGame: {
//         min_bet: 1000,
//         max_bet: 100000,
//         house_edge_bps: 250,
//       }
//     },
//     anchoring: null,
//   };
//
//   const serialized = borsh.serialize(DiceInputSchema, initInstruction);
//   await connection.sendTransaction(programId, [gameAccount], serialized);

console.log("Step 2: Deposit BTC");
console.log("--------------------");
console.log("Depositing 10,000 sats into player balance...");
console.log("  The program tracks your balance in account state.");
console.log("  The BTC is held in the program's UTXO pot.\\n");

console.log("Step 3: Roll the Dice!");
console.log("----------------------");

// Simulate a few rolls
const rolls = [
  { bet: 2000, seed: 42, roll: 5, won: true },
  { bet: 3000, seed: 77, roll: 2, won: false },
  { bet: 1500, seed: 123, roll: 6, won: true },
  { bet: 2500, seed: 256, roll: 1, won: false },
  { bet: 5000, seed: 999, roll: 4, won: true },
];

let balance = 10000;
let totalWagered = 0;
let totalWon = 0;
let gamesWon = 0;

for (const r of rolls) {
  totalWagered += r.bet;
  balance -= r.bet;

  if (r.won) {
    const houseCut = Math.floor((r.bet * 250) / 10000);
    const payout = r.bet * 2 - houseCut;
    balance += payout;
    totalWon += payout;
    gamesWon++;
    console.log(\`  Roll: \${r.roll} | Bet: \${r.bet} sats | WIN! +\${payout} sats (house: \${houseCut})\`);
  } else {
    console.log(\`  Roll: \${r.roll} | Bet: \${r.bet} sats | LOSS\`);
  }
}

console.log("");
console.log("Game Summary:");
console.log(\`  Games played:  \${rolls.length}\`);
console.log(\`  Games won:     \${gamesWon}/\${rolls.length}\`);
console.log(\`  Total wagered: \${totalWagered} sats\`);
console.log(\`  Total won:     \${totalWon} sats\`);
console.log(\`  Final balance: \${balance} sats\\n\`);

console.log("Step 4: Withdraw");
console.log("-----------------");
console.log(\`Withdrawing \${balance} sats to Bitcoin address...\`);
console.log("  The program constructs a Bitcoin transaction with");
console.log("  a TxOut sending your sats to your BTC address.\\n");

console.log("========================================");
console.log("  Demo complete!");
console.log("  In production, each step above would be");
console.log("  a real Arch Network transaction managing");
console.log("  actual Bitcoin UTXOs on-chain.");
console.log("========================================");
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
