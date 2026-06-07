use anchor_lang::prelude::*;

/// Account order is FIXED by the vault program. During `initialize_strategy` the
/// vault CPIs into this adaptor passing, in this exact order:
///
///   [payer, vault_strategy_auth (signer), strategy, system_program, ...remaining]
///
/// Anchor matches positionally, so the first four struct fields MUST be these,
/// in this order. Append protocol-specific accounts after `system_program`
/// (as named fields here, or read them from `ctx.remaining_accounts`).
#[derive(Accounts)]
pub struct Initialize<'info> {
    /// Funds account creation (rent). The vault forwards its own payer here.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// The vault's per-strategy authority PDA. It signs the CPI from the vault,
    /// and is the owner/authority of the strategy's token accounts and any
    /// per-strategy state you create on the target protocol.
    #[account(mut)]
    pub authority: Signer<'info>,

    /// The `strategy` account. This is the 1:1 handle the vault uses for this
    /// strategy and SHOULD map to your protocol's own state (a market / reserve /
    /// pool / vault PDA). In a real adaptor validate the mapping, e.g.
    /// `#[account(constraint = strategy.key() == market.key())]`, or derive it as
    /// a PDA (`seeds = [b"strategy", market.key().as_ref()], bump`).
    /// CHECK: opaque handle in this minimal example; validate against protocol state in a real adaptor.
    pub strategy: AccountInfo<'info>,

    /// Needed if you create accounts (CPI to system_program / init ATAs) here.
    pub system_program: Program<'info, System>,
    //
    // --- A real adaptor appends protocol-specific accounts below, e.g. ---
    // pub protocol_program: AccountInfo<'info>,        // target program to CPI into
    // pub receipt_mint: InterfaceAccount<'info, Mint>, // protocol receipt token
    // #[account(init_if_needed, payer = payer,
    //     associated_token::mint = receipt_mint,
    //     associated_token::authority = authority)]
    // pub strategy_receipt_ata: InterfaceAccount<'info, TokenAccount>,
    // ...or read them from ctx.remaining_accounts.
}

pub fn initialize_handler(_ctx: Context<Initialize>) -> Result<()> {
    // This minimal adaptor needs no setup: the strategy holds its position simply
    // as a balance in its asset ATA (created by the vault).
    //
    // A real adaptor would here:
    //   - CPI to the target protocol to create per-strategy state
    //     (e.g. Kamino `init_user_metadata`, Drift `initialize_vault_depositor`),
    //     guarding with an "already exists" check so re-init is a no-op, and
    //   - init any receipt-token ATA owned by `authority`.
    Ok(())
}
