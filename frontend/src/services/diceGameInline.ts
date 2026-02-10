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
    system_instruction::{create_account_with_anchor, sign_input},
    system_program::SYSTEM_PROGRAM_ID,
    utxo::UtxoMeta,
    rent::minimum_rent,
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
// Accounts: [payer (signer), game_account, system_program]
// Creates the game account via CPI to system program, anchored to a UTXO.
// The game account will be owned by this program.

fn process_init(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    min_bet: u64,
    max_bet: u64,
    house_edge_bps: u16,
    utxo: UtxoMeta,
    tx_hex: &[u8],
) -> Result<(), ProgramError> {
    let account_iter = &mut accounts.iter();
    let payer = next_account_info(account_iter)?;
    let game_account = next_account_info(account_iter)?;

    if !payer.is_signer {
        return Err(ProgramError::MissingRequiredSignature);
    }

    // Create game state
    let state = GameState {
        min_bet,
        max_bet,
        house_edge_bps,
        total_games: 0,
        players: vec![],
    };

    let data = borsh::to_vec(&state)
        .map_err(|e| ProgramError::BorshIoError(e.to_string()))?;

    // Create the game account via CPI, anchored to the provided UTXO
    let txid: [u8; 32] = utxo.txid().try_into()
        .map_err(|_| ProgramError::InvalidArgument)?;

    invoke(
        &create_account_with_anchor(
            payer.key,
            game_account.key,
            minimum_rent(data.len()),
            data.len() as u64,
            program_id,
            txid,
            utxo.vout(),
        ),
        &[payer.clone(), game_account.clone()],
    )?;

    // Write initial state
    game_account.data.borrow_mut().copy_from_slice(&data);

    // Build Bitcoin transaction for the state transition
    let fees_tx: Transaction = bitcoin::consensus::deserialize(tx_hex)
        .map_err(|_| ProgramError::Custom(504))?;

    let mut tx = Transaction {
        version: Version::TWO,
        lock_time: LockTime::ZERO,
        input: vec![],
        output: vec![],
    };

    let _ = add_state_transition(&mut tx, payer);
    let _ = add_state_transition(&mut tx, game_account);
    tx.input.push(fees_tx.input[0].clone());

    let inputs_to_sign = [InputToSign {
        index: 1,
        signer: game_account.key.clone(),
    }];

    set_transaction_to_sign(accounts, &tx, &inputs_to_sign)?;

    let ix = sign_input(0, payer.key);
    invoke(&ix, &[payer.clone()])?;

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
// Accounts: [payer (signer), game_account]
// Spends the game account's UTXO via add_state_transition,
// adds an output to the player's BTC address.

fn process_withdraw(
    accounts: &[AccountInfo],
    player: Pubkey,
    amount: u64,
    destination: &str,
) -> Result<(), ProgramError> {
    let account_iter = &mut accounts.iter();
    let payer = next_account_info(account_iter)?;
    let game_account = next_account_info(account_iter)?;

    if !payer.is_signer {
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

    // add_state_transition spends game account's UTXO -> new output back to game
    let _ = add_state_transition(&mut tx, game_account)?;

    // Extra output: send withdrawal amount to player
    tx.output.push(TxOut {
        value: Amount::from_sat(amount),
        script_pubkey: dest_address.script_pubkey(),
    });

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
// Creates a dedicated game account with a real UTXO (the pot).
//
// After running:
//   1. Note the game account address printed below
//   2. Fund that BTC address with testnet sats (this becomes the pot)
//   3. Run client.ts to play
// ============================================================================

async function setup() {
  console.log("========================================");
  console.log("  Dice Game - Setup");
  console.log("========================================");
  console.log("");

  const rpcUrl = (window as any).__archRpcUrl;
  const programAcct = (window as any).__archProgramAccount;

  if (!rpcUrl) { console.log("ERROR: No RPC URL."); return; }
  if (!programAcct) { console.log("ERROR: No program keypair. Build tab Step 1."); return; }

  console.log("Program: " + programAcct.pubkey.substring(0, 20) + "...");
  console.log("");

  // Create a new Arch account to serve as the game account.
  // This account gets a real UTXO automatically.
  const conn = new RpcConnection(rpcUrl);
  const archConn = ArchConnection(conn);

  console.log("Creating game account...");
  const gameAccount = await archConn.createNewAccount();
  console.log("Game account created!");
  console.log("  Pubkey:  " + gameAccount.pubkey);
  console.log("  Address: " + gameAccount.address);
  console.log("");

  // Store it so client.ts can find it
  (window as any).__diceGameAccount = gameAccount;

  // Request airdrop to fund the account
  const gamePubkeyBytes = new Uint8Array(gameAccount.pubkey.length / 2);
  for (let i = 0; i < gamePubkeyBytes.length; i++) {
    gamePubkeyBytes[i] = parseInt(gameAccount.pubkey.substring(i*2, i*2+2), 16);
  }

  console.log("Requesting airdrop for game account...");
  try {
    await conn.requestAirdrop(gamePubkeyBytes);
    console.log("Airdrop requested.");
  } catch (e: any) {
    console.log("Airdrop note: " + (e.message || e));
  }

  console.log("");
  console.log("========================================");
  console.log("  Setup complete!");
  console.log("");
  console.log("  Game pot BTC address:");
  console.log("  " + gameAccount.address);
  console.log("");
  console.log("  Fund this address with testnet sats,");
  console.log("  then run client.ts to play.");
  console.log("========================================");
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
// 4. Roll dice and check result
// 5. Withdraw winnings
//
// Prerequisites: Deploy program, fund the pot address with testnet sats.
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

  const progBytes = new Uint8Array(programAcct.pubkey.length / 2);
  for (let i = 0; i < progBytes.length; i++) {
    progBytes[i] = parseInt(programAcct.pubkey.substring(i*2, i*2+2), 16);
  }

  // Authority pubkey bytes (game account)
  const authBytes = new Uint8Array(authority.pubkey.length / 2);
  for (let i = 0; i < authBytes.length; i++) {
    authBytes[i] = parseInt(authority.pubkey.substring(i*2, i*2+2), 16);
  }

  const encode_u64 = (val: number): Uint8Array => {
    const buf = new DataView(new ArrayBuffer(8));
    buf.setUint32(0, val & 0xFFFFFFFF, true);
    buf.setUint32(4, Math.floor(val / 0x100000000), true);
    return new Uint8Array(buf.buffer);
  };

  // ── Deposit BTC ────────────────────────────────────────

  const POT_ADDRESS = authority.address;
  const DEPOSIT = 1000;

  console.log("STEP 1: Deposit " + DEPOSIT + " sats");
  console.log("  Pot: " + POT_ADDRESS.substring(0, 24) + "...");

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

    // CreditDeposit = enum 1: [1] [32 bytes player pubkey] [u64 amount]
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
            { pubkey: accountPubkey, is_signer: true, is_writable: true },
            { pubkey: authBytes, is_signer: false, is_writable: true },
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

  // RollDice = enum 2: [2] [32 bytes pubkey] [u64 bet] [u64 seed]
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
          { pubkey: accountPubkey, is_signer: true, is_writable: true },
          { pubkey: authBytes, is_signer: false, is_writable: true },
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

  // ── Withdraw ───────────────────────────────────────────

  const WITHDRAW = 500;
  console.log("STEP 4: Withdraw " + WITHDRAW + " sats");
  console.log("  To: " + walletAccounts[0].substring(0, 20) + "...");

  // Withdraw = enum 3: [3] [32 bytes pubkey] [u64 amount] [u32 str_len] [str bytes]
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

  try {
    const txid = await ClientTransactionUtil.signAndSendTransaction(conn, {
      signers: [accountPubkey],
      instructions: [{
        program_id: progBytes,
        accounts: [
          { pubkey: accountPubkey, is_signer: true, is_writable: true },
          { pubkey: authBytes, is_signer: false, is_writable: true },
        ],
        data: Array.from(wdData),
      }],
    }, useWallet);
    console.log("  Withdrawal submitted! TXID: " + txid);
    console.log("  Program crafted a Bitcoin TxOut to your wallet.");
    console.log("  Arch validators will broadcast it.");
  } catch (err: any) {
    console.log("  Withdraw error: " + (err.message || err));
  }

  console.log("");
  console.log("========================================");
  console.log("  Game complete!");
  console.log("========================================");
}

try { await play(); } catch (e: any) { console.log("Error: " + (e.message || e)); }
`;
