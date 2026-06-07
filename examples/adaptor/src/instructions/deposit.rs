use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022,
    token_interface::{Mint, TokenAccount, TokenInterface},
};

/// Optional, adaptor-defined params. Passed through by the vault manager.
/// Here `end_value` lets a caller override the reported position value (handy for
/// testing / mock strategies). A real adaptor usually computes the value from
/// on-chain protocol state instead and may not need params at all.
#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct DepositParams {
    pub placeholder_vec_len: u32,
    pub end_value: u64,
}

/// Account order is FIXED by the vault program. During `deposit_strategy` the
/// vault CPIs into this adaptor passing, in this exact order:
///
///   [vault_strategy_auth (signer), strategy, vault_asset_mint,
///    vault_strategy_asset_ata, asset_token_program, ...remaining]
///
/// The first five struct fields MUST be these, in this order (Anchor matches
/// positionally). Crucially, before this CPI the vault has ALREADY transferred
/// `amount` underlying tokens INTO `destination_token_account` (the
/// vault_strategy_asset_ata). So the adaptor's job is to move those tokens from
/// that ATA into the target protocol, then report position value.
#[derive(Accounts)]
pub struct Deposit<'info> {
    /// vault_strategy_auth — signs the CPI and authorizes moving tokens out of
    /// the strategy ATA / into the protocol.
    #[account(mut)]
    pub authority: Signer<'info>,

    /// strategy = your protocol's state handle. Derived here as a PDA so the
    /// withdraw path can sign with it; a real adaptor would instead constrain it
    /// to the target market/reserve (`constraint = strategy.key() == market.key()`)
    /// or derive it from that account's key.
    /// CHECK: opaque handle in this minimal example; validate against protocol state in a real adaptor.
    #[account(seeds = [b"strategy"], bump)]
    pub strategy: AccountInfo<'info>,

    /// The vault's underlying asset mint (e.g. USDC). Token-2022 compatible.
    #[account(mut)]
    pub vault_asset_mint: Box<InterfaceAccount<'info, Mint>>,

    /// NOTE: in the canonical interface this 4th account is the
    /// `vault_strategy_asset_ata` (the strategy-owned ATA the vault funded).
    /// This minimal adaptor models "the protocol" as simply keeping the deposited
    /// tokens in a separate strategy-owned ATA, so it splits the single funded ATA
    /// into a source (`authority_token_account`) and a destination
    /// (`destination_token_account`). A real adaptor uses the funded ATA directly
    /// as the source of a CPI into the target protocol and has no
    /// `destination_token_account`.
    #[account(
        mut,
        associated_token::mint = vault_asset_mint,
        associated_token::authority = authority,
        associated_token::token_program = token_program,
    )]
    pub authority_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    /// asset_token_program — SPL Token or Token-2022 (TokenInterface handles both).
    pub token_program: Interface<'info, TokenInterface>,

    /// Where this example "parks" deposited tokens (stands in for the protocol).
    /// Owned by the `strategy` PDA so withdraw can sign with the PDA bump.
    #[account(
        mut,
        associated_token::mint = vault_asset_mint,
        associated_token::authority = strategy,
        associated_token::token_program = token_program,
    )]
    pub destination_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    //
    // --- A real adaptor appends protocol-specific accounts (named or via
    //     ctx.remaining_accounts), e.g. reserve, market, receipt mint,
    //     receipt ATA, protocol_program, oracle/scope price accounts. ---
}

pub fn deposit_handler(
    ctx: Context<Deposit>,
    amount: u64,
    params: Option<DepositParams>,
) -> Result<u64> {
    if amount.gt(&0) {
        // Move the just-deposited underlying into the protocol. Here that is a
        // plain transfer_checked into the strategy-owned destination ATA.
        //
        // A real adaptor REPLACES this with a CPI into the target protocol, e.g.
        //   klend::cpi::deposit_reserve_liquidity(cpi_ctx, amount)?;  // mints receipt tokens
        // using the funded ATA as the source of liquidity.
        token_2022::transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                token_2022::TransferChecked {
                    from: ctx.accounts.authority_token_account.to_account_info(),
                    mint: ctx.accounts.vault_asset_mint.to_account_info(),
                    to: ctx.accounts.destination_token_account.to_account_info(),
                    authority: ctx.accounts.authority.to_account_info(),
                },
            ),
            amount,
            ctx.accounts.vault_asset_mint.decimals,
        )?;

        // ALWAYS reload accounts mutated by a CPI before reading them, otherwise
        // the in-memory copy is stale and the reported position value is wrong.
        ctx.accounts.destination_token_account.reload()?;
    }

    // Report the strategy's CURRENT total position value, in underlying terms.
    //
    // This example's position == the balance sitting in the destination ATA, so
    // the value is just that balance. A real adaptor computes value from protocol
    // state, e.g. receipt-token balance converted at the current exchange rate:
    //
    //   let value = (receipt_balance as u128)
    //       .checked_mul(total_underlying as u128).ok_or(Err::MathOverflow)?
    //       .checked_div(total_receipt_supply as u128).ok_or(Err::MathOverflow)? as u64;
    //
    // (Handle the first-deposit / zero-supply case by returning the raw amount.)
    let end_value = if let Some(params) = params {
        // Optional override path (mock/testing).
        params.end_value
    } else {
        ctx.accounts.destination_token_account.amount
    };
    Ok(end_value)
}
