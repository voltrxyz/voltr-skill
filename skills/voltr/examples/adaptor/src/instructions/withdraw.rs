use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022,
    token_interface::{Mint, TokenAccount, TokenInterface},
};

/// Optional, adaptor-defined params (see DepositParams). `end_value` overrides
/// the reported REMAINING position value.
#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct WithdrawParams {
    pub placeholder_vec_len: u32,
    pub end_value: u64,
}

/// Same FIXED account order as Deposit, passed by the vault during
/// `withdraw_strategy`:
///
///   [vault_strategy_auth (signer), strategy, vault_asset_mint,
///    vault_strategy_asset_ata, asset_token_program, ...remaining]
///
/// The adaptor must move `amount` underlying OUT of the protocol back into the
/// vault_strategy_asset_ata; the vault sweeps it to idle after the CPI returns.
#[derive(Accounts)]
pub struct Withdraw<'info> {
    /// vault_strategy_auth — the destination of withdrawn underlying and the
    /// signer the vault provides.
    #[account(mut)]
    pub authority: Signer<'info>,

    /// strategy PDA — here it OWNS the source token account, so the adaptor signs
    /// the transfer out with this PDA's seeds + bump (see below). A real adaptor
    /// would sign protocol CPIs (redeem/withdraw) with the same per-strategy PDA.
    /// CHECK: opaque handle in this minimal example; validate against protocol state in a real adaptor.
    #[account(seeds = [b"strategy"], bump)]
    pub strategy: AccountInfo<'info>,

    #[account(mut)]
    pub vault_asset_mint: Box<InterfaceAccount<'info, Mint>>,

    /// vault_strategy_asset_ata — destination for withdrawn underlying.
    #[account(
        mut,
        associated_token::mint = vault_asset_mint,
        associated_token::authority = authority,
        associated_token::token_program = token_program,
    )]
    pub authority_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,

    /// Where this example holds the position (stands in for the protocol),
    /// owned by the `strategy` PDA.
    #[account(
        mut,
        associated_token::mint = vault_asset_mint,
        associated_token::authority = strategy,
        associated_token::token_program = token_program,
    )]
    pub source_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    //
    // --- A real adaptor appends protocol withdraw/redeem accounts here. ---
}

pub fn withdraw_handler(
    ctx: Context<Withdraw>,
    amount: u64,
    params: Option<WithdrawParams>,
) -> Result<u64> {
    if amount.gt(&0) {
        // Pull `amount` underlying back out. Because the source ATA is owned by
        // the `strategy` PDA, we sign with that PDA's seeds + bump via
        // `new_with_signer`. A real adaptor first converts `amount` (underlying)
        // into the protocol's units (e.g. receipt/collateral tokens, rounding up)
        // and then CPIs the protocol's redeem/withdraw, signing the same way:
        //
        //   let receipt_amount = (amount as u128)
        //       .checked_mul(receipt_balance as u128)?
        //       .checked_div_ceil(current_underlying as u128)? as u64;
        //   klend::cpi::redeem_reserve_collateral(cpi_ctx_with_signer, receipt_amount)?;
        token_2022::transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token_2022::TransferChecked {
                    from: ctx.accounts.source_token_account.to_account_info(),
                    mint: ctx.accounts.vault_asset_mint.to_account_info(),
                    to: ctx.accounts.authority_token_account.to_account_info(),
                    authority: ctx.accounts.strategy.to_account_info(),
                },
                &[&[b"strategy", &[ctx.bumps.strategy]]],
            ),
            amount,
            ctx.accounts.vault_asset_mint.decimals,
        )?;

        // Reload after the CPI so the remaining-value read below is accurate.
        ctx.accounts.source_token_account.reload()?;
    }

    // Report the REMAINING total position value in underlying terms. Here that is
    // the leftover balance in the source ATA. A real adaptor recomputes from
    // protocol state after the redeem (same formula as deposit).
    let end_value = if let Some(params) = params {
        params.end_value
    } else {
        ctx.accounts.source_token_account.amount
    };
    Ok(end_value)
}
