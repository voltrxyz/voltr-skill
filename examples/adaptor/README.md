# Minimal Voltr adaptor (starter)

A complete, compilable Anchor program implementing the Voltr adaptor interface, modeled on the canonical `voltr-basic-adaptor`. It is the smallest correct adaptor: it implements `initialize` / `deposit` / `withdraw`, returns the `u64` position value the vault expects, and signs token moves with the strategy PDA. Read [../../references/adaptor-creation.md](../../references/adaptor-creation.md) alongside it.

## Layout

```
examples/adaptor/
├── Cargo.toml                 # anchor-lang/anchor-spl 0.31.1, cdylib + idl-build
├── Xargo.toml
└── src/
    ├── lib.rs                 # #[program]: initialize / deposit / withdraw entrypoints
    └── instructions/
        ├── mod.rs
        ├── initialize.rs      # Initialize accounts (fixed prefix) + handler
        ├── deposit.rs         # Deposit accounts + handler, returns current position value
        └── withdraw.rs        # Withdraw accounts + handler, returns remaining position value
```

This is a program crate, not a full Anchor workspace — drop `src/` + `Cargo.toml` into an `anchor init` workspace (or add `Anchor.toml` + a `tests/` dir) to build and deploy.

## What it demonstrates (and what it fakes)

- The **fixed account order** the vault passes for each instruction (positionally matched by Anchor) — see the comments in each `instructions/*.rs`.
- The **`Result<u64>` return contract**: `deposit` reports current total position value, `withdraw` reports remaining, both in underlying-asset units.
- **Signing with the strategy PDA** (`CpiContext::new_with_signer` + `seeds=[b"strategy"]` + bump) on withdraw.
- **`reload()` after a CPI** before reading balances.
- Token-2022 compatibility via `InterfaceAccount` / `TokenInterface` / `transfer_checked`.

It **fakes** the target protocol by parking deposited tokens in a strategy-owned ATA, so "position value" is just that balance. A real adaptor replaces the `transfer_checked` calls with CPIs into the target protocol and computes value from protocol state.

## Adapting it for a real protocol

1. **Rename** the program (`Cargo.toml` `name`, `lib.rs` `mod`) and replace the placeholder `declare_id!("92VYotqKr8xZBNZsVhipMeaUmkE5UhPjm3nU99F5ZtJ9")` with your deployed program id (set it *before* the real `anchor deploy` — it's immutable on-chain).
2. **Constrain `strategy`** to your protocol state (`constraint = strategy.key() == market.key()`) or derive it as a PDA from that state.
3. **Append protocol accounts** after the fixed prefix (named fields or `ctx.remaining_accounts`): protocol program, market/reserve, receipt mint + ATA, oracle, etc.
4. **Replace the transfers** with real CPIs (deposit → mint receipt tokens; withdraw → redeem), signing with the strategy / `vault_strategy_auth` PDA.
5. **Compute position value** from protocol state with `u128` checked math; handle the zero-supply first deposit; reload before reading.
6. Add an `error.rs` (`#[error_code] enum AdaptorError { MathOverflow, InvalidAmount, ... }`) and any optional instructions (claim rewards, multi-step withdraw).

See the security checklist in [../../references/adaptor-creation.md](../../references/adaptor-creation.md) and the real implementations in `voltr-lending-adaptor` / `voltr-kamino-adaptor` for production patterns.
