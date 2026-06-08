# Voltr Vault CPI Integration

When to read this: you are writing an **on-chain Solana program** that calls (CPIs) into the Voltr Vault program to deposit/withdraw on behalf of a user — e.g. routers, aggregators, tranching, or fractional-reserve products built on vault LP tokens.

Siblings: [architecture](./architecture.md) · CPI wrapper code in [`../examples/cpi/`](../examples/cpi/) ([deposit_vault.rs](../examples/cpi/deposit_vault.rs), [request_withdraw_vault.rs](../examples/cpi/request_withdraw_vault.rs), [withdraw_vault.rs](../examples/cpi/withdraw_vault.rs), [cancel_request_withdraw_vault.rs](../examples/cpi/cancel_request_withdraw_vault.rs), [instant_withdraw_vault.rs](../examples/cpi/instant_withdraw_vault.rs)).

> **DISCRIMINATOR WARNING — trust the references, not the upstream README.** The upstream `voltr-vault-cpi/README.md` contains STALE/WRONG Anchor discriminators for `deposit_vault`, `request_withdraw_vault`, and `withdraw_vault` (it shows `deposit = [41,158,82,88,95,140,106,154]`, `request = [147,67,155,26,32,163,32,193]`, `withdraw = [81,229,229,94,86,233,198,15]` — all WRONG). Use ONLY the values in this file, the Mintlify docs, and [`../examples/cpi/*.rs`](../examples/cpi/) (these three agree). The correct values are tabulated below.

## When to CPI vs use the SDK

| Caller | Use |
|---|---|
| On-chain Solana program (router, aggregator, tranching, fractional-reserve, any program that must move vault funds atomically within its own instruction) | **CPI** — the instructions documented here |
| Off-chain automation, backends, frontends | **TypeScript SDK** (`https://voltrxyz.github.io/vault-sdk/`) |

## Deployed address

| Network | Program Address |
|---|---|
| Mainnet | `vVoLTRjQmtFpiYoegx285Ze4gsLJ8ZxgFKVcuvmG1a8` |

All PDAs below are derived from this program id.

## Model

Users deposit assets and receive LP tokens representing their share. Withdrawal is a **two-step** process (request → wait → claim) to manage liquidity and vault stability. Vaults with a zero `withdrawal_waiting_period` additionally support **instant withdraw** (one transaction). A pending request can be **cancelled** to reclaim LP tokens.

```
Deposit:           User Assets ──► Vault ──► LP Tokens to User

Request Withdraw:  LP Tokens ──► Escrow Receipt (request_withdraw_vault_receipt PDA)
                                       │
                                       │  vault.withdrawal_waiting_period
                                       ▼
Withdraw:          Escrow Receipt ──(burn LP)──► Assets to User ; receipt closed

Cancel Withdraw:   Escrow Receipt ──► LP Tokens back to User ; receipt closed
                   (any time, before or after waiting period)

Instant Withdraw:  LP Tokens ──(burn)──► Assets to User   (single tx; only if
                   withdrawal_waiting_period == 0; no receipt created)
```

## Instruction summary

| Instruction | Discriminator (`sha256("global:<name>")[0..8]`) | Args |
|---|---|---|
| `deposit_vault` | `[126, 224, 21, 255, 228, 53, 117, 33]` | `amount: u64` |
| `request_withdraw_vault` | `[248, 225, 47, 22, 116, 144, 23, 143]` | `amount: u64, is_amount_in_lp: bool, is_withdraw_all: bool` |
| `withdraw_vault` | `[135, 7, 237, 120, 149, 94, 95, 7]` | none |
| `cancel_request_withdraw_vault` | `[231, 54, 14, 6, 223, 124, 127, 238]` | none |
| `instant_withdraw_vault` | `[221, 56, 115, 168, 128, 220, 235, 245]` | `amount: u64, is_amount_in_lp: bool, is_withdraw_all: bool` |

## PDA derivation

Derive these with `Pubkey::find_program_address(seeds, &voltr_vault_program_id)`.

| Account | Seeds |
|---|---|
| `protocol` | `["protocol"]` |
| `vault_asset_idle_auth` | `["vault_asset_idle_auth", vault]` |
| `vault_lp_mint_auth` | `["vault_lp_mint_auth", vault]` |
| `request_withdraw_vault_receipt` | `["request_withdraw_vault_receipt", vault, user]` |

Because the receipt is keyed on `(vault, user)`, each user has at most one active withdrawal request per vault at a time.

## KEY RULE — no signer seeds for the vault's internal PDAs

Your program does **NOT** provide `invoke_signed` signer seeds for the vault's internal PDAs (`vault_asset_idle_auth`, `vault_lp_mint_auth`, `request_withdraw_vault_receipt`). The Voltr Vault program performs its own `invoke_signed` internally (for token transfers, mints, burns, and creating/closing the receipt). Your program just passes the correct PDA **addresses** in the account list and calls plain `invoke`. The only outer-transaction signers you must supply are `user_transfer_authority` (every instruction) and `payer` (`request_withdraw_vault` only).

## instruction_data assembly

For every instruction: `data = discriminator (8 bytes) ++ args`, where args are appended in declared order:

- `u64` → `amount.to_le_bytes()` (8 little-endian bytes)
- `bool` → single byte, `value as u8` (`is_amount_in_lp`, then `is_withdraw_all`)

```
deposit_vault:                  disc ++ amount.to_le_bytes()
request_withdraw_vault:         disc ++ amount.to_le_bytes() ++ [is_amount_in_lp as u8] ++ [is_withdraw_all as u8]
withdraw_vault:                 disc
cancel_request_withdraw_vault:  disc
instant_withdraw_vault:         disc ++ amount.to_le_bytes() ++ [is_amount_in_lp as u8] ++ [is_withdraw_all as u8]
```

The order of `AccountMeta`s passed in the instruction MUST match the accounts tables below exactly. The `AccountInfo` slice passed to `invoke` must contain the same accounts (the `voltr_vault_program` account itself does not appear in the metas, but must be present as the invoked program).

---

## `deposit_vault`

Deposits asset tokens into the vault and mints LP tokens to the user. Discriminator `[126, 224, 21, 255, 228, 53, 117, 33]`. Param: `amount: u64` (asset tokens to deposit). Full code: [`../examples/cpi/deposit_vault.rs`](../examples/cpi/deposit_vault.rs).

| # | Account | Mutable | Signer | Purpose |
|---|---|---|---|---|
| 0 | `user_transfer_authority` | No | Yes | The user depositing assets |
| 1 | `protocol` | No | No | Global Voltr protocol state (`["protocol"]`) |
| 2 | `vault` | Yes | No | Target vault state account |
| 3 | `vault_asset_mint` | No | No | Mint of the asset being deposited |
| 4 | `vault_lp_mint` | Yes | No | The vault's LP mint |
| 5 | `user_asset_ata` | Yes | No | User's asset token account (source) |
| 6 | `vault_asset_idle_ata` | Yes | No | Vault's idle asset token account (destination) |
| 7 | `vault_asset_idle_auth` | No | No | PDA authority over `vault_asset_idle_ata` |
| 8 | `user_lp_ata` | Yes | No | User's LP token account (destination) |
| 9 | `vault_lp_mint_auth` | No | No | PDA authority for minting LP tokens |
| 10 | `asset_token_program` | No | No | Token Program or Token-2022 for assets |
| 11 | `lp_token_program` | No | No | Token Program for LP tokens |
| 12 | `system_program` | No | No | Solana System Program |

```rust
pub struct DepositVaultParams<'info> {
    pub user_transfer_authority: AccountInfo<'info>,
    pub protocol: AccountInfo<'info>,
    pub vault: AccountInfo<'info>,
    pub vault_asset_mint: AccountInfo<'info>,
    pub vault_lp_mint: AccountInfo<'info>,
    pub user_asset_ata: AccountInfo<'info>,
    pub vault_asset_idle_ata: AccountInfo<'info>,
    pub vault_asset_idle_auth: AccountInfo<'info>,
    pub user_lp_ata: AccountInfo<'info>,
    pub vault_lp_mint_auth: AccountInfo<'info>,
    pub asset_token_program: AccountInfo<'info>,
    pub lp_token_program: AccountInfo<'info>,
    pub system_program: AccountInfo<'info>,
    pub voltr_vault_program: AccountInfo<'info>,
}
```

`instruction_data = [126,224,21,255,228,53,117,33] ++ amount.to_le_bytes()`

---

## `request_withdraw_vault`

Step 1 of 2: transfers the user's LP tokens into an escrow receipt. The user must then wait `vault.withdrawal_waiting_period` before calling `withdraw_vault`. Discriminator `[248, 225, 47, 22, 116, 144, 23, 143]`. Full code: [`../examples/cpi/request_withdraw_vault.rs`](../examples/cpi/request_withdraw_vault.rs).

Params: `amount: u64`, `is_amount_in_lp: bool` (true → `amount` is LP tokens; false → underlying asset tokens), `is_withdraw_all: bool` (true → withdraw the user's entire LP balance, ignoring `amount`).

| # | Account | Mutable | Signer | Purpose |
|---|---|---|---|---|
| 0 | `payer` | Yes | Yes | Pays rent for the receipt account |
| 1 | `user_transfer_authority` | No | Yes | The user requesting the withdrawal |
| 2 | `protocol` | No | No | Global Voltr protocol state |
| 3 | `vault` | No | No | The vault to withdraw from |
| 4 | `vault_lp_mint` | No | No | The vault's LP mint |
| 5 | `user_lp_ata` | Yes | No | User's LP token account (source) |
| 6 | `request_withdraw_lp_ata` | Yes | No | Receipt's ATA holding escrowed LP tokens |
| 7 | `request_withdraw_vault_receipt` | Yes | No | PDA receipt storing request details (created here) |
| 8 | `lp_token_program` | No | No | Token Program for LP tokens |
| 9 | `system_program` | No | No | Solana System Program |

```rust
pub struct RequestWithdrawVaultParams<'info> {
    pub payer: AccountInfo<'info>,
    pub user_transfer_authority: AccountInfo<'info>,
    pub protocol: AccountInfo<'info>,
    pub vault: AccountInfo<'info>,
    pub vault_lp_mint: AccountInfo<'info>,
    pub user_lp_ata: AccountInfo<'info>,
    pub request_withdraw_lp_ata: AccountInfo<'info>,
    pub request_withdraw_vault_receipt: AccountInfo<'info>,
    pub lp_token_program: AccountInfo<'info>,
    pub system_program: AccountInfo<'info>,
    pub voltr_vault_program: AccountInfo<'info>,
}
```

`instruction_data = [248,225,47,22,116,144,23,143] ++ amount.to_le_bytes() ++ [is_amount_in_lp as u8] ++ [is_withdraw_all as u8]`

---

## `withdraw_vault`

Step 2 of 2: burns the escrowed LP tokens and transfers the underlying assets to the user, then closes the receipt (rent returned). Fails with `WithdrawalNotYetAvailable` if `withdrawal_waiting_period` has not elapsed since the request. Discriminator `[135, 7, 237, 120, 149, 94, 95, 7]`. No params. Full code: [`../examples/cpi/withdraw_vault.rs`](../examples/cpi/withdraw_vault.rs).

| # | Account | Mutable | Signer | Purpose |
|---|---|---|---|---|
| 0 | `user_transfer_authority` | Yes | Yes | The user finalizing the withdrawal |
| 1 | `protocol` | No | No | Global Voltr protocol state |
| 2 | `vault` | Yes | No | The vault state account |
| 3 | `vault_asset_mint` | No | No | Mint of the asset being withdrawn |
| 4 | `vault_lp_mint` | Yes | No | The vault's LP mint |
| 5 | `request_withdraw_lp_ata` | Yes | No | Receipt's ATA holding escrowed LP (source for burn) |
| 6 | `vault_asset_idle_ata` | Yes | No | Vault's idle asset token account (source) |
| 7 | `vault_asset_idle_auth` | Yes | No | PDA authority over `vault_asset_idle_ata` |
| 8 | `user_asset_ata` | Yes | No | User's asset token account (destination) |
| 9 | `request_withdraw_vault_receipt` | Yes | No | PDA receipt (closed after withdrawal) |
| 10 | `asset_token_program` | No | No | Token Program or Token-2022 for assets |
| 11 | `lp_token_program` | No | No | Token Program for LP tokens |
| 12 | `system_program` | No | No | Solana System Program |

```rust
pub struct WithdrawVaultParams<'info> {
    pub user_transfer_authority: AccountInfo<'info>,
    pub protocol: AccountInfo<'info>,
    pub vault: AccountInfo<'info>,
    pub vault_asset_mint: AccountInfo<'info>,
    pub vault_lp_mint: AccountInfo<'info>,
    pub request_withdraw_lp_ata: AccountInfo<'info>,
    pub vault_asset_idle_ata: AccountInfo<'info>,
    pub vault_asset_idle_auth: AccountInfo<'info>,
    pub user_asset_ata: AccountInfo<'info>,
    pub request_withdraw_vault_receipt: AccountInfo<'info>,
    pub asset_token_program: AccountInfo<'info>,
    pub lp_token_program: AccountInfo<'info>,
    pub system_program: AccountInfo<'info>,
    pub voltr_vault_program: AccountInfo<'info>,
}
```

`instruction_data = [135,7,237,120,149,94,95,7]` (discriminator only)

---

## `cancel_request_withdraw_vault`

Cancels a pending request: refunds the escrowed LP tokens to the user (minus any redemption fee that may apply) and closes the receipt. Callable at any time after the request, before or after the waiting period. Discriminator `[231, 54, 14, 6, 223, 124, 127, 238]`. No params. Full code: [`../examples/cpi/cancel_request_withdraw_vault.rs`](../examples/cpi/cancel_request_withdraw_vault.rs).

| # | Account | Mutable | Signer | Purpose |
|---|---|---|---|---|
| 0 | `user_transfer_authority` | Yes | Yes | The user cancelling; receives the closed receipt's rent |
| 1 | `protocol` | No | No | Global Voltr protocol state |
| 2 | `vault` | Yes | No | The vault state account |
| 3 | `vault_lp_mint` | Yes | No | The vault's LP mint |
| 4 | `user_lp_ata` | Yes | No | User's LP token account (destination for refunded LP) |
| 5 | `request_withdraw_lp_ata` | Yes | No | Receipt's ATA holding escrowed LP (source for refund) |
| 6 | `request_withdraw_vault_receipt` | Yes | No | PDA receipt (closed after cancellation) |
| 7 | `lp_token_program` | No | No | Token Program for LP tokens |
| 8 | `system_program` | No | No | Solana System Program |

```rust
pub struct CancelRequestWithdrawVaultParams<'info> {
    pub user_transfer_authority: AccountInfo<'info>,
    pub protocol: AccountInfo<'info>,
    pub vault: AccountInfo<'info>,
    pub vault_lp_mint: AccountInfo<'info>,
    pub user_lp_ata: AccountInfo<'info>,
    pub request_withdraw_lp_ata: AccountInfo<'info>,
    pub request_withdraw_vault_receipt: AccountInfo<'info>,
    pub lp_token_program: AccountInfo<'info>,
    pub system_program: AccountInfo<'info>,
    pub voltr_vault_program: AccountInfo<'info>,
}
```

`instruction_data = [231,54,14,6,223,124,127,238]` (discriminator only)

---

## `instant_withdraw_vault`

Single-transaction withdrawal: burns LP tokens directly and transfers assets to the user, bypassing the request/receipt flow. No receipt is created. Fails with `InstantWithdrawNotAllowed` if `vault.withdrawal_waiting_period != 0`. Same params as `request_withdraw_vault`. Discriminator `[221, 56, 115, 168, 128, 220, 235, 245]`. Full code: [`../examples/cpi/instant_withdraw_vault.rs`](../examples/cpi/instant_withdraw_vault.rs).

Params: `amount: u64`, `is_amount_in_lp: bool`, `is_withdraw_all: bool` (same semantics as `request_withdraw_vault`).

| # | Account | Mutable | Signer | Purpose |
|---|---|---|---|---|
| 0 | `user_transfer_authority` | No | Yes | The user withdrawing assets |
| 1 | `protocol` | No | No | Global Voltr protocol state |
| 2 | `vault` | Yes | No | The vault state account |
| 3 | `vault_asset_mint` | No | No | Mint of the asset being withdrawn |
| 4 | `vault_lp_mint` | Yes | No | The vault's LP mint |
| 5 | `user_lp_ata` | Yes | No | User's LP token account (source for burn) |
| 6 | `vault_asset_idle_ata` | Yes | No | Vault's idle asset token account (source) |
| 7 | `vault_asset_idle_auth` | Yes | No | PDA authority over `vault_asset_idle_ata` |
| 8 | `user_asset_ata` | Yes | No | User's asset token account (destination) |
| 9 | `asset_token_program` | No | No | Token Program or Token-2022 for assets |
| 10 | `lp_token_program` | No | No | Token Program for LP tokens |
| 11 | `system_program` | No | No | Solana System Program |

```rust
pub struct InstantWithdrawVaultParams<'info> {
    pub user_transfer_authority: AccountInfo<'info>,
    pub protocol: AccountInfo<'info>,
    pub vault: AccountInfo<'info>,
    pub vault_asset_mint: AccountInfo<'info>,
    pub vault_lp_mint: AccountInfo<'info>,
    pub user_lp_ata: AccountInfo<'info>,
    pub vault_asset_idle_ata: AccountInfo<'info>,
    pub vault_asset_idle_auth: AccountInfo<'info>,
    pub user_asset_ata: AccountInfo<'info>,
    pub asset_token_program: AccountInfo<'info>,
    pub lp_token_program: AccountInfo<'info>,
    pub system_program: AccountInfo<'info>,
    pub voltr_vault_program: AccountInfo<'info>,
}
```

`instruction_data = [221,56,115,168,128,220,235,245] ++ amount.to_le_bytes() ++ [is_amount_in_lp as u8] ++ [is_withdraw_all as u8]`

---

## Errors

Handle these errors returned by the Voltr Vault program:

| Error | Cause |
|---|---|
| `InvalidAmount` | Input amount is zero or invalid |
| `MaxCapExceeded` | Deposit would exceed the vault's maximum capacity |
| `WithdrawalNotYetAvailable` | `withdraw_vault` called before the waiting period elapsed |
| `InstantWithdrawNotAllowed` | `instant_withdraw_vault` called on a vault with a non-zero waiting period |
| `OperationNotAllowed` | The protocol has globally disabled the attempted operation |

The reference wrappers map any failed CPI to a local `ErrorCodes::CpiToVoltrVaultFailed` (`"CPI_TO_VOLTR_VAULT_PROGRAM_FAILED"`); to surface the underlying error code, propagate the `invoke` result directly instead of remapping.

## Reference repository

Full upstream reference: `github.com/voltrxyz/vault-cpi` (treat its `README.md` discriminators as stale — see the warning at the top of this file).
