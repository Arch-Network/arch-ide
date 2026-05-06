interface SatelliteExampleSource {
  /** Map of file name → contents under the project's `src/` directory. */
  src: Record<string, string>;
  /** Map of file name → contents under the project's `client/` directory. */
  client: Record<string, string>;
}

const buildClient = (title: string, notes: string) => `// ${title} — Satellite example client
//
// This generated project ships with a compile-checked Satellite program in
// src/lib.rs. The fastest way to exercise it today is:
//   1. Build and deploy the program from the IDE.
//   2. Open the Program Inspector.
//   3. Import the generated IDL from the build output (if not auto-loaded).
//   4. Invoke the instruction described below.
//
${notes}
`;

const CREATE_NEW_ACCOUNT_LIB_RS = `use arch_satellite_lang::prelude::*;

declare_id!("1111111111111111111111111111111111111111111111111111111111111111");

#[program]
pub mod create_new_account {
    use super::*;

    pub fn create_profile(ctx: Context<CreateProfile>, label: String) -> Result<()> {
        require!(label.len() <= 64, CreateAccountError::LabelTooLong);

        let profile = &mut ctx.accounts.profile;
        profile.owner = ctx.accounts.user.key();
        profile.label = label;
        profile.revision = profile.revision.saturating_add(1);
        msg!("Profile revision {} for {}", profile.revision, profile.owner);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateProfile<'info> {
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + 32 + 4 + 64 + 8,
        seeds = [b"profile", user.key().as_ref()],
        bump
    )]
    pub profile: Account<'info, UserProfile>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct UserProfile {
    pub owner: Pubkey,
    pub label: String,
    pub revision: u64,
}

#[error_code]
pub enum CreateAccountError {
    #[msg("Profile labels are capped at 64 bytes")]
    LabelTooLong,
}
`;

const ESCROW_LIB_RS = `use arch_satellite_lang::prelude::*;

declare_id!("1111111111111111111111111111111111111111111111111111111111111111");

#[program]
pub mod escrow {
    use super::*;

    pub fn create_escrow(ctx: Context<CreateEscrow>, amount: u64) -> Result<()> {
        require!(amount > 0, EscrowError::InvalidAmount);

        let escrow = &mut ctx.accounts.escrow;
        escrow.maker = ctx.accounts.maker.key();
        escrow.taker = ctx.accounts.taker.key();
        escrow.amount = amount;
        escrow.is_released = false;
        escrow.is_cancelled = false;
        msg!("Escrow created for {} units", amount);
        Ok(())
    }

    pub fn release(ctx: Context<ReleaseEscrow>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(!escrow.is_released, EscrowError::AlreadyReleased);
        require!(!escrow.is_cancelled, EscrowError::AlreadyCancelled);
        require_keys_eq!(escrow.taker, ctx.accounts.taker.key(), EscrowError::WrongTaker);

        escrow.is_released = true;
        msg!("Escrow released by taker {}", escrow.taker);
        Ok(())
    }

    pub fn cancel(ctx: Context<CancelEscrow>) -> Result<()> {
        let escrow = &mut ctx.accounts.escrow;
        require!(!escrow.is_released, EscrowError::AlreadyReleased);
        require!(!escrow.is_cancelled, EscrowError::AlreadyCancelled);
        require_keys_eq!(escrow.maker, ctx.accounts.maker.key(), EscrowError::WrongMaker);

        escrow.is_cancelled = true;
        msg!("Escrow cancelled by maker {}", escrow.maker);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateEscrow<'info> {
    #[account(
        init_if_needed,
        payer = maker,
        space = 8 + 32 + 32 + 8 + 1 + 1,
        seeds = [b"escrow", maker.key().as_ref()],
        bump
    )]
    pub escrow: Account<'info, EscrowState>,
    #[account(mut)]
    pub maker: Signer<'info>,
    /// CHECK: Stored as the counterparty. No data is read from this account.
    pub taker: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ReleaseEscrow<'info> {
    #[account(mut, seeds = [b"escrow", escrow.maker.as_ref()], bump)]
    pub escrow: Account<'info, EscrowState>,
    pub taker: Signer<'info>,
}

#[derive(Accounts)]
pub struct CancelEscrow<'info> {
    #[account(mut, seeds = [b"escrow", maker.key().as_ref()], bump)]
    pub escrow: Account<'info, EscrowState>,
    pub maker: Signer<'info>,
}

#[account]
pub struct EscrowState {
    pub maker: Pubkey,
    pub taker: Pubkey,
    pub amount: u64,
    pub is_released: bool,
    pub is_cancelled: bool,
}

#[error_code]
pub enum EscrowError {
    #[msg("Escrow amount must be greater than zero")]
    InvalidAmount,
    #[msg("Escrow has already been released")]
    AlreadyReleased,
    #[msg("Escrow has already been cancelled")]
    AlreadyCancelled,
    #[msg("Only the configured taker can release this escrow")]
    WrongTaker,
    #[msg("Only the maker can cancel this escrow")]
    WrongMaker,
}
`;

const DICE_GAME_LIB_RS = `use arch_satellite_lang::prelude::*;
use arch_satellite_lang::arch_program::program::get_bitcoin_block_height;

declare_id!("1111111111111111111111111111111111111111111111111111111111111111");

#[program]
pub mod dice_game {
    use super::*;

    pub fn initialize_game(ctx: Context<InitializeGame>, min_bet: u64, max_bet: u64) -> Result<()> {
        require!(min_bet > 0, DiceError::InvalidBetRange);
        require!(max_bet >= min_bet, DiceError::InvalidBetRange);

        let game = &mut ctx.accounts.game;
        game.authority = ctx.accounts.authority.key();
        game.min_bet = min_bet;
        game.max_bet = max_bet;
        game.nonce = 0;
        game.wins = 0;
        game.losses = 0;
        msg!("Dice game initialized: min={}, max={}", min_bet, max_bet);
        Ok(())
    }

    pub fn place_bet(ctx: Context<PlaceBet>, wager: u64, guess: u8) -> Result<()> {
        let game = &mut ctx.accounts.game;
        require!(wager >= game.min_bet && wager <= game.max_bet, DiceError::BetOutOfRange);
        require!((1..=6).contains(&guess), DiceError::InvalidGuess);

        let bet = &mut ctx.accounts.bet;
        bet.player = ctx.accounts.player.key();
        bet.game = game.key();
        bet.wager = wager;
        bet.guess = guess;
        bet.roll = 0;
        bet.won = false;
        bet.settled = false;
        game.nonce = game.nonce.saturating_add(1);
        msg!("Bet placed: {} units on {}", wager, guess);
        Ok(())
    }

    pub fn settle_bet(ctx: Context<SettleBet>) -> Result<()> {
        let game = &mut ctx.accounts.game;
        let bet = &mut ctx.accounts.bet;
        require!(!bet.settled, DiceError::AlreadySettled);

        let height = get_bitcoin_block_height();
        let roll = ((height.wrapping_add(game.nonce).wrapping_add(bet.wager)) % 6 + 1) as u8;
        bet.roll = roll;
        bet.won = roll == bet.guess;
        bet.settled = true;

        if bet.won {
            game.wins = game.wins.saturating_add(1);
        } else {
            game.losses = game.losses.saturating_add(1);
        }

        msg!("Dice rolled {} — player guessed {} — won={}", roll, bet.guess, bet.won);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeGame<'info> {
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + 32 + 8 + 8 + 8 + 8 + 8,
        seeds = [b"dice-game", authority.key().as_ref()],
        bump
    )]
    pub game: Account<'info, GameState>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PlaceBet<'info> {
    #[account(mut)]
    pub game: Account<'info, GameState>,
    #[account(
        init_if_needed,
        payer = player,
        space = 8 + 32 + 32 + 8 + 1 + 1 + 1 + 1,
        seeds = [b"bet", game.key().as_ref(), player.key().as_ref()],
        bump
    )]
    pub bet: Account<'info, BetState>,
    #[account(mut)]
    pub player: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct SettleBet<'info> {
    #[account(mut)]
    pub game: Account<'info, GameState>,
    #[account(mut, seeds = [b"bet", game.key().as_ref(), bet.player.as_ref()], bump)]
    pub bet: Account<'info, BetState>,
}

#[account]
pub struct GameState {
    pub authority: Pubkey,
    pub min_bet: u64,
    pub max_bet: u64,
    pub nonce: u64,
    pub wins: u64,
    pub losses: u64,
}

#[account]
pub struct BetState {
    pub player: Pubkey,
    pub game: Pubkey,
    pub wager: u64,
    pub guess: u8,
    pub roll: u8,
    pub won: bool,
    pub settled: bool,
}

#[error_code]
pub enum DiceError {
    #[msg("Invalid bet range")]
    InvalidBetRange,
    #[msg("Bet is outside the configured range")]
    BetOutOfRange,
    #[msg("Guess must be between 1 and 6")]
    InvalidGuess,
    #[msg("Bet has already been settled")]
    AlreadySettled,
}
`;

const SECP256K1_SIGNATURE_LIB_RS = `use arch_satellite_lang::prelude::*;

declare_id!("1111111111111111111111111111111111111111111111111111111111111111");

#[program]
pub mod secp256k1_signature {
    use super::*;

    pub fn record_verification(
        ctx: Context<RecordVerification>,
        message_hash: [u8; 32],
        signature: [u8; 64],
        public_key: [u8; 33],
    ) -> Result<()> {
        let verification = &mut ctx.accounts.verification;
        verification.authority = ctx.accounts.authority.key();
        verification.message_hash = message_hash;
        verification.signature = signature;
        verification.public_key = public_key;
        verification.verified = true;
        verification.attempts = verification.attempts.saturating_add(1);
        msg!("Recorded secp256k1 verification attempt #{}", verification.attempts);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct RecordVerification<'info> {
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + 32 + 32 + 64 + 33 + 1 + 8,
        seeds = [b"secp256k1", authority.key().as_ref()],
        bump
    )]
    pub verification: Account<'info, VerificationRecord>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct VerificationRecord {
    pub authority: Pubkey,
    pub message_hash: [u8; 32],
    pub signature: [u8; 64],
    pub public_key: [u8; 33],
    pub verified: bool,
    pub attempts: u64,
}
`;

const ORACLE_LIB_RS = `use arch_satellite_lang::prelude::*;
use arch_satellite_lang::arch_program::program::get_bitcoin_block_height;

declare_id!("1111111111111111111111111111111111111111111111111111111111111111");

#[program]
pub mod oracle {
    use super::*;

    pub fn initialize_feed(ctx: Context<InitializeFeed>, symbol: String) -> Result<()> {
        require!(symbol.len() <= 16, OracleError::SymbolTooLong);

        let feed = &mut ctx.accounts.feed;
        feed.authority = ctx.accounts.authority.key();
        feed.symbol = symbol;
        feed.value = 0;
        feed.confidence = 0;
        feed.round = 0;
        feed.last_updated_height = get_bitcoin_block_height();
        msg!("Oracle feed initialized");
        Ok(())
    }

    pub fn publish_price(ctx: Context<PublishPrice>, value: i64, confidence: u64) -> Result<()> {
        require_keys_eq!(ctx.accounts.feed.authority, ctx.accounts.authority.key(), OracleError::Unauthorized);

        let feed = &mut ctx.accounts.feed;
        feed.value = value;
        feed.confidence = confidence;
        feed.round = feed.round.saturating_add(1);
        feed.last_updated_height = get_bitcoin_block_height();
        msg!("Oracle {} round {} = {}", feed.symbol, feed.round, value);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializeFeed<'info> {
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + 32 + 4 + 16 + 8 + 8 + 8 + 8,
        seeds = [b"oracle", authority.key().as_ref()],
        bump
    )]
    pub feed: Account<'info, OracleFeed>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct PublishPrice<'info> {
    #[account(mut, seeds = [b"oracle", authority.key().as_ref()], bump)]
    pub feed: Account<'info, OracleFeed>,
    pub authority: Signer<'info>,
}

#[account]
pub struct OracleFeed {
    pub authority: Pubkey,
    pub symbol: String,
    pub value: i64,
    pub confidence: u64,
    pub round: u64,
    pub last_updated_height: u64,
}

#[error_code]
pub enum OracleError {
    #[msg("Oracle symbol is capped at 16 bytes")]
    SymbolTooLong,
    #[msg("Only the oracle authority can publish updates")]
    Unauthorized,
}
`;

const STAKE_LIB_RS = `use arch_satellite_lang::prelude::*;

declare_id!("1111111111111111111111111111111111111111111111111111111111111111");

#[program]
pub mod stake {
    use super::*;

    pub fn initialize_pool(ctx: Context<InitializePool>, reward_rate_bps: u64) -> Result<()> {
        require!(reward_rate_bps <= 10_000, StakeError::InvalidRewardRate);

        let pool = &mut ctx.accounts.pool;
        pool.authority = ctx.accounts.authority.key();
        pool.reward_rate_bps = reward_rate_bps;
        pool.total_staked = 0;
        pool.total_rewards_claimed = 0;
        msg!("Stake pool initialized with {} bps rewards", reward_rate_bps);
        Ok(())
    }

    pub fn stake(ctx: Context<StakeTokens>, amount: u64) -> Result<()> {
        require!(amount > 0, StakeError::InvalidAmount);

        let pool = &mut ctx.accounts.pool;
        let position = &mut ctx.accounts.position;
        if position.owner == Pubkey::default() {
            position.owner = ctx.accounts.user.key();
            position.pool = pool.key();
        }
        require_keys_eq!(position.owner, ctx.accounts.user.key(), StakeError::Unauthorized);

        position.amount = position.amount.saturating_add(amount);
        pool.total_staked = pool.total_staked.saturating_add(amount);
        msg!("Staked {} units", amount);
        Ok(())
    }

    pub fn unstake(ctx: Context<StakeTokens>, amount: u64) -> Result<()> {
        require!(amount > 0, StakeError::InvalidAmount);
        require!(ctx.accounts.position.amount >= amount, StakeError::InsufficientStake);

        let pool = &mut ctx.accounts.pool;
        let position = &mut ctx.accounts.position;
        require_keys_eq!(position.owner, ctx.accounts.user.key(), StakeError::Unauthorized);

        position.amount -= amount;
        pool.total_staked = pool.total_staked.saturating_sub(amount);
        msg!("Unstaked {} units", amount);
        Ok(())
    }

    pub fn claim_rewards(ctx: Context<StakeTokens>) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        let position = &mut ctx.accounts.position;
        require_keys_eq!(position.owner, ctx.accounts.user.key(), StakeError::Unauthorized);

        let reward = position.amount.saturating_mul(pool.reward_rate_bps) / 10_000;
        position.rewards_claimed = position.rewards_claimed.saturating_add(reward);
        pool.total_rewards_claimed = pool.total_rewards_claimed.saturating_add(reward);
        msg!("Claimed {} reward units", reward);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + 32 + 8 + 8 + 8,
        seeds = [b"stake-pool", authority.key().as_ref()],
        bump
    )]
    pub pool: Account<'info, StakePool>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct StakeTokens<'info> {
    #[account(mut)]
    pub pool: Account<'info, StakePool>,
    #[account(
        init_if_needed,
        payer = user,
        space = 8 + 32 + 32 + 8 + 8,
        seeds = [b"stake-position", pool.key().as_ref(), user.key().as_ref()],
        bump
    )]
    pub position: Account<'info, StakePosition>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct StakePool {
    pub authority: Pubkey,
    pub reward_rate_bps: u64,
    pub total_staked: u64,
    pub total_rewards_claimed: u64,
}

#[account]
pub struct StakePosition {
    pub owner: Pubkey,
    pub pool: Pubkey,
    pub amount: u64,
    pub rewards_claimed: u64,
}

#[error_code]
pub enum StakeError {
    #[msg("Reward rate must be between 0 and 10,000 basis points")]
    InvalidRewardRate,
    #[msg("Amount must be greater than zero")]
    InvalidAmount,
    #[msg("Insufficient staked balance")]
    InsufficientStake,
    #[msg("Unauthorized stake position access")]
    Unauthorized,
}
`;

const VOTE_LIB_RS = `use arch_satellite_lang::prelude::*;

declare_id!("1111111111111111111111111111111111111111111111111111111111111111");

#[program]
pub mod vote {
    use super::*;

    pub fn create_proposal(ctx: Context<CreateProposal>, title: String) -> Result<()> {
        require!(title.len() <= 96, VoteError::TitleTooLong);

        let proposal = &mut ctx.accounts.proposal;
        proposal.authority = ctx.accounts.authority.key();
        proposal.title = title;
        proposal.yes_votes = 0;
        proposal.no_votes = 0;
        proposal.is_open = true;
        msg!("Proposal created");
        Ok(())
    }

    pub fn cast_vote(ctx: Context<CastVote>, support: bool) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        require!(proposal.is_open, VoteError::ProposalClosed);
        require!(!ctx.accounts.ballot.has_voted, VoteError::AlreadyVoted);

        let ballot = &mut ctx.accounts.ballot;
        ballot.voter = ctx.accounts.voter.key();
        ballot.proposal = proposal.key();
        ballot.support = support;
        ballot.has_voted = true;

        if support {
            proposal.yes_votes = proposal.yes_votes.saturating_add(1);
        } else {
            proposal.no_votes = proposal.no_votes.saturating_add(1);
        }
        msg!("Vote cast: support={}", support);
        Ok(())
    }

    pub fn close_proposal(ctx: Context<CloseProposal>) -> Result<()> {
        let proposal = &mut ctx.accounts.proposal;
        require_keys_eq!(proposal.authority, ctx.accounts.authority.key(), VoteError::Unauthorized);
        proposal.is_open = false;
        msg!("Proposal closed");
        Ok(())
    }
}

#[derive(Accounts)]
pub struct CreateProposal<'info> {
    #[account(
        init_if_needed,
        payer = authority,
        space = 8 + 32 + 4 + 96 + 8 + 8 + 1,
        seeds = [b"proposal", authority.key().as_ref()],
        bump
    )]
    pub proposal: Account<'info, Proposal>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CastVote<'info> {
    #[account(mut)]
    pub proposal: Account<'info, Proposal>,
    #[account(
        init_if_needed,
        payer = voter,
        space = 8 + 32 + 32 + 1 + 1,
        seeds = [b"ballot", proposal.key().as_ref(), voter.key().as_ref()],
        bump
    )]
    pub ballot: Account<'info, Ballot>,
    #[account(mut)]
    pub voter: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct CloseProposal<'info> {
    #[account(mut, seeds = [b"proposal", authority.key().as_ref()], bump)]
    pub proposal: Account<'info, Proposal>,
    pub authority: Signer<'info>,
}

#[account]
pub struct Proposal {
    pub authority: Pubkey,
    pub title: String,
    pub yes_votes: u64,
    pub no_votes: u64,
    pub is_open: bool,
}

#[account]
pub struct Ballot {
    pub voter: Pubkey,
    pub proposal: Pubkey,
    pub support: bool,
    pub has_voted: bool,
}

#[error_code]
pub enum VoteError {
    #[msg("Proposal title is capped at 96 bytes")]
    TitleTooLong,
    #[msg("Proposal is closed")]
    ProposalClosed,
    #[msg("This voter already cast a ballot")]
    AlreadyVoted,
    #[msg("Only the proposal authority can close it")]
    Unauthorized,
}
`;

const TEST_SOL_LOG_DATA_LIB_RS = `use arch_satellite_lang::prelude::*;

declare_id!("1111111111111111111111111111111111111111111111111111111111111111");

#[program]
pub mod test_sol_log_data {
    use super::*;

    pub fn write_log_data(ctx: Context<WriteLogData>, label: String, payload: Vec<u8>) -> Result<()> {
        require!(label.len() <= 32, LogDataError::LabelTooLong);
        require!(payload.len() <= 128, LogDataError::PayloadTooLong);

        let record = &mut ctx.accounts.record;
        record.author = ctx.accounts.author.key();
        record.last_label = label.clone();
        record.last_payload_len = payload.len() as u64;
        record.entries = record.entries.saturating_add(1);

        emit!(LogDataEvent {
            author: record.author,
            label,
            payload_len: payload.len() as u64,
        });

        msg!("Logged data payload #{}", record.entries);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct WriteLogData<'info> {
    #[account(
        init_if_needed,
        payer = author,
        space = 8 + 32 + 4 + 32 + 8 + 8,
        seeds = [b"log-data", author.key().as_ref()],
        bump
    )]
    pub record: Account<'info, LogRecord>,
    #[account(mut)]
    pub author: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct LogRecord {
    pub author: Pubkey,
    pub last_label: String,
    pub last_payload_len: u64,
    pub entries: u64,
}

#[event]
pub struct LogDataEvent {
    pub author: Pubkey,
    pub label: String,
    pub payload_len: u64,
}

#[error_code]
pub enum LogDataError {
    #[msg("Log label is capped at 32 bytes")]
    LabelTooLong,
    #[msg("Log payload is capped at 128 bytes")]
    PayloadTooLong,
}
`;

export const ADVANCED_SATELLITE_EXAMPLES: Record<string, SatelliteExampleSource> = {
  'create-new-account': {
    src: { 'lib.rs': CREATE_NEW_ACCOUNT_LIB_RS },
    client: {
      'client.ts': buildClient(
        'Create New Account',
        '// Invoke create_profile(label: string) with accounts: profile PDA, user signer, system program.',
      ),
    },
  },
  escrow: {
    src: { 'lib.rs': ESCROW_LIB_RS },
    client: {
      'client.ts': buildClient(
        'Escrow',
        '// Invoke create_escrow(amount: u64), then release() as taker or cancel() as maker.',
      ),
    },
  },
  'dice-game': {
    src: { 'lib.rs': DICE_GAME_LIB_RS },
    client: {
      'client.ts': buildClient(
        'Dice Game',
        '// Invoke initialize_game(min_bet, max_bet), place_bet(wager, guess), then settle_bet().',
      ),
    },
  },
  secp256k1_signature: {
    src: { 'lib.rs': SECP256K1_SIGNATURE_LIB_RS },
    client: {
      'client.ts': buildClient(
        'Secp256k1 Signature',
        '// Invoke record_verification(message_hash[32], signature[64], public_key[33]).',
      ),
    },
  },
  oracle: {
    src: { 'lib.rs': ORACLE_LIB_RS },
    client: {
      'client.ts': buildClient(
        'Oracle',
        '// Invoke initialize_feed(symbol), then publish_price(value, confidence) as the authority.',
      ),
    },
  },
  stake: {
    src: { 'lib.rs': STAKE_LIB_RS },
    client: {
      'client.ts': buildClient(
        'Stake',
        '// Invoke initialize_pool(reward_rate_bps), stake(amount), unstake(amount), claim_rewards().',
      ),
    },
  },
  vote: {
    src: { 'lib.rs': VOTE_LIB_RS },
    client: {
      'client.ts': buildClient(
        'Vote',
        '// Invoke create_proposal(title), cast_vote(support), and close_proposal().',
      ),
    },
  },
  'test-sol-log-data': {
    src: { 'lib.rs': TEST_SOL_LOG_DATA_LIB_RS },
    client: {
      'client.ts': buildClient(
        'Logging Test',
        '// Invoke write_log_data(label, payload) to persist a summary and emit a Satellite event.',
      ),
    },
  },
};
