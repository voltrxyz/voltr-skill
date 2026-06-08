# Building a Custom Voltr Adaptor

> When to read this: you are a **yield/DeFi protocol** that wants vault managers to allocate vault funds into your protocol. You will write and deploy an on-chain Anchor program (the "adaptor") that the Voltr vault CPIs into. Read [architecture.md](./architecture.md) first for the fund-flow and PDA model. The complete compilable starter lives at [../examples/adaptor/](../examples/adaptor/). If you instead want to deposit/withdraw *from* a vault inside your own program, you want [cpi-integration.md](./cpi-integration.md), not this file.

## What an adaptor is

An adaptor is a thin Solana program that bridges one Voltr vault to one target protocol. The vault program calls your adaptor via CPI; your adaptor routes those calls into the target protocol (Kamino, Drift, a CEX bridge, etc.) and reports the position's value back.

```
manager: deposit_strategy / withdraw_strategy
        ↓
Vault program  ──CPI──►  YOUR ADAPTOR  ──CPI──►  target protocol
        ▲                      │
        └── reads u64 position value via get_return_data
```

You do **not** modify or fork the vault program. You deploy your own program, the vault **admin** registers it with `add_adaptor`, then `initialize_strategy` creates a strategy bound to it, and the **manager** moves funds with `deposit_strategy` / `withdraw_strategy` (which CPI your adaptor).

## The three required instructions

Every adaptor MUST expose exactly these three entrypoints with these signatures. Anchor discriminators are derived from the instruction names, so name them exactly `initialize`, `deposit`, `withdraw`.

| Instruction | Vault calls it during | Signature | Returns |
|---|---|---|---|
| `initialize` | `initialize_strategy` | `fn initialize(ctx) -> Result<()>` | `()` |
| `deposit` | `deposit_strategy` | `fn deposit(ctx, amount: u64, params: Option<P>) -> Result<u64>` | **current** total position value, underlying terms |
| `withdraw` | `withdraw_strategy` | `fn withdraw(ctx, amount: u64, params: Option<P>) -> Result<u64>` | **remaining** total position value, underlying terms |

The trailing `params: Option<P>` is adaptor-defined and optional — the manager passes it through. Use it for slippage bounds, expected-value overrides for mock/testing, route hints, etc. The minimal starter uses it to optionally override the reported value; most real adaptors compute value from on-chain state and may not need params.

### The returned `u64` is the contract

`deposit` and `withdraw` return the strategy's position value **in the vault's underlying-asset units** (e.g. lamports of USDC). The vault reads it via Solana's `get_return_data` and uses it to track the strategy's contribution to total assets and to compute P&L, fees, and the high-water mark. **An inaccurate return corrupts vault accounting** — overstate it and you mint phantom value; understate it and depositors lose. Compute it from real protocol state, after reloading.

## Fixed account order passed by the vault

The vault always passes a fixed prefix of accounts in this exact order. Anchor matches positionally, so the **first N fields of your `#[derive(Accounts)]` struct must be these, in order**. Append protocol-specific accounts after them (as named fields, or read from `ctx.remaining_accounts`).

**`initialize`** — `[payer, vault_strategy_auth (signer), strategy, system_program, ...remaining]`

**`deposit` / `withdraw`** — `[vault_strategy_auth (signer), strategy, vault_asset_mint, vault_strategy_asset_ata, asset_token_program, ...remaining]`

Key accounts:

| Account | What it is |
|---|---|
| `vault_strategy_auth` | Per-strategy PDA owned by the vault (`findVaultStrategyAuthPda({ vault, strategy })`). It **signs** the CPI into your adaptor, owns the strategy's token accounts, and is the authority you'll use when signing CPIs into the target protocol. In a minimal adaptor it appears as `authority: Signer`. |
| `strategy` | The 1:1 handle for this strategy. SHOULD map to your protocol's own state account (market/reserve/pool/vault). Validate the mapping (see below). |
| `vault_asset_mint` | The vault's underlying asset mint. Token-2022 compatible — use `InterfaceAccount<Mint>` + `TokenInterface`. |
| `vault_strategy_asset_ata` | Strategy-owned ATA for the asset. **On deposit the vault has ALREADY moved `amount` underlying into this ATA before calling you** — your job is to deploy it into the protocol. **On withdraw you must move underlying back INTO this ATA** — the vault sweeps it to idle after your CPI returns. |
| `asset_token_program` | SPL Token or Token-2022. |

## Strategy = your protocol's state — validate it

The `strategy` account is opaque to the vault; **you** must constrain it so a manager can't point a strategy at an account that doesn't match the protocol accounts in `remaining_accounts`. Two common patterns:

```rust
// (a) strategy IS / must equal a specific protocol state account:
#[account(constraint = strategy.key() == market.key())]
pub strategy: AccountInfo<'info>,

// (b) strategy is a PDA derived from the target state (lets you sign with it):
#[account(seeds = [b"strategy", market.key().as_ref()], bump)]
pub strategy: AccountInfo<'info>,
```

Each vault strategy is a 1:1 mapping to a specific instance of your protocol (one reserve, one market, one Drift vault, …).

## Position-value calculation

Always **reload** any account a CPI mutated before reading it, then convert protocol units to underlying using `u128` intermediates and checked math.

```rust
// Receipt/collateral-token based (cToken, kToken, etc.)
fn position_value(receipt_balance: u64, total_underlying: u64, total_receipt_supply: u64) -> Result<u64> {
    if total_receipt_supply == 0 {
        return Ok(0); // or the raw deposited amount on first deposit
    }
    Ok((receipt_balance as u128)
        .checked_mul(total_underlying as u128).ok_or(AdaptorError::MathOverflow)?
        .checked_div(total_receipt_supply as u128).ok_or(AdaptorError::MathOverflow)? as u64)
}
```

On **withdraw**, convert the requested underlying `amount` into protocol units (rounding *up* so you never under-deliver), CPI the protocol's redeem/withdraw, then recompute the remaining value the same way. Handle the first-deposit / zero-supply edge case explicitly.

## Optional / additional instructions

Adaptors are not limited to the three core instructions. The vault program only ever calls `initialize`/`deposit`/`withdraw`; **anything else is invoked directly by the manager** (separate transaction, or threaded through `remaining_accounts`). Common additions, seen in the core-team adaptors:

- **Multi-step withdrawals** — protocols with an unstake/cooldown (e.g. Drift vaults) add `request_withdraw` + `cancel_request_withdraw` alongside `withdraw`.
- **Reward harvesting** — `claim_rewards` / `harvest`, optionally swapping the reward mint back to the vault asset.
- **Multiple strategy types in one adaptor** — a single program can dispatch over several protocol shapes (the Lending adaptor handles Kamino/Drift/Marginfi/Solend; Spot handles swap vs Jupiter Earn) using a stored strategy-type tag and per-type seed derivations.
- **Direct withdraw** — the vault has `initialize_direct_withdraw_strategy` + `direct_withdraw_strategy(_with_tolerance)` so a **user** can pull their pro-rata share straight out of a strategy when idle liquidity is insufficient; supporting it requires the matching adaptor-side accounts.

## Security checklist

Mirror the patterns the core adaptors use (`voltr-lending-adaptor`, `voltr-kamino-adaptor`).

- [ ] **Strategy mapping validated** — `strategy` is constrained to / derived from the target protocol state.
- [ ] **Protocol PDAs verified** with `seeds = [...]` + `seeds::program = <protocol_program>` + `bump`, not passed unchecked.
- [ ] **Token accounts validated** — `associated_token::{mint, authority, token_program}` (or explicit `token::` constraints).
- [ ] **`CHECK:` comments document delegation** — for accounts the *target program* validates during the CPI, say so: `/// CHECK: validated by the target program in the CPI`.
- [ ] **Reload after every CPI** before computing position value.
- [ ] **Checked math + `u128` intermediates** for all conversions; round withdrawal protocol-units up.
- [ ] **First-deposit / zero-supply** edge case handled.
- [ ] **Token-2022 aware** — `InterfaceAccount`/`TokenInterface`, and use `transfer_checked` (pass `mint.decimals`).
- [ ] **Sign protocol CPIs with the strategy/`vault_strategy_auth` PDA** via `CpiContext::new_with_signer` and the PDA seeds+bump.
- [ ] **Oracle freshness/confidence** validated if you price the position from an oracle (see `voltr-lending-adaptor/.../utils/oracle_validation.rs`).
- [ ] **Tested**: deposit, withdraw, zero-amount, full withdrawal, first deposit, and an integration test where the **vault program** calls your adaptor and the returned `u64` matches expected.

## Build & register flow

1. Write the program (start from [../examples/adaptor/](../examples/adaptor/)). Replace the placeholder `declare_id!` with your deployed program id and update `Anchor.toml`.
2. `anchor build && anchor deploy` (mainnet program ids are immutable in `declare_id!` — set it before the real deploy).
3. Vault admin runs `add_adaptor` with your program id (one-time per vault).
4. Vault admin runs `initialize_strategy` with your adaptor's `initialize` discriminator + the strategy address + required `remainingAccounts` (see `getInitializeStrategyInstructionAsync` in [vault-manager-sdk.md](./vault-manager-sdk.md)).
5. Manager runs `deposit_strategy` / `withdraw_strategy`, supplying your adaptor's per-call `remainingAccounts`.

What is **stable** (the Voltr side): the three-instruction interface and the fixed account prefix. What is **adaptor-specific**: how `strategy` is derived, your instruction discriminators, the `remaining_accounts` list, and any extra serialized args. Publish those four things for managers to consume.
