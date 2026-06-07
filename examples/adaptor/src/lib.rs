use anchor_lang::prelude::*;
use instructions::*;

pub mod instructions;

// PLACEHOLDER program id. Replace with `solana-keygen pubkey target/deploy/<name>-keypair.json`
// (and update Anchor.toml) before you build/deploy. The vault's `add_adaptor` instruction
// registers this exact id as the adaptor a strategy will CPI into.
declare_id!("92VYotqKr8xZBNZsVhipMeaUmkE5UhPjm3nU99F5ZtJ9");

#[program]
pub mod voltr_example_adaptor {
    use super::*;

    /// Called once by the vault program during `initialize_strategy`.
    /// Set up any protocol-specific accounts the strategy needs (receipt-token
    /// ATAs, a per-strategy user/obligation account on the target protocol, etc).
    /// Must return `Result<()>` — no position value yet.
    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        initialize_handler(ctx)
    }

    /// Called by the vault program during `deposit_strategy`, AFTER the vault has
    /// already moved `amount` underlying tokens into `destination_token_account`
    /// (the vault_strategy_asset_ata, owned by the `strategy` PDA).
    ///
    /// MUST return `Result<u64>` = the strategy's CURRENT total position value in
    /// underlying-asset terms. The vault reads this via `get_return_data` to track P&L.
    pub fn deposit(
        ctx: Context<Deposit>,
        amount: u64,
        params: Option<DepositParams>,
    ) -> Result<u64> {
        deposit_handler(ctx, amount, params)
    }

    /// Called by the vault program during `withdraw_strategy`. Pull `amount` of
    /// underlying out of the target protocol back into `source_token_account`
    /// (the vault_strategy_asset_ata); the vault then sweeps it back to idle.
    ///
    /// MUST return `Result<u64>` = the strategy's REMAINING total position value in
    /// underlying-asset terms after the withdrawal.
    pub fn withdraw(
        ctx: Context<Withdraw>,
        amount: u64,
        params: Option<WithdrawParams>,
    ) -> Result<u64> {
        withdraw_handler(ctx, amount, params)
    }
}
