# Voltr Vault CPI Wrappers

Drop-in CPI wrapper structs for calling the Voltr Vault program from your own Anchor program. Each file defines a `*Params<'info>` struct holding the `AccountInfo`s plus the target `voltr_vault_program`, a `to_account_infos()` helper, and a method that builds the instruction (discriminator + args) and `invoke`s it. Copy a file into your program, populate the struct from your `Context`, and call the method.

See [`../../references/cpi-integration.md`](../../references/cpi-integration.md) for the full spec (accounts tables, params, PDA derivation, errors, ASCII flow).

## Files

| File | Instruction | Args |
|---|---|---|
| [`deposit_vault.rs`](./deposit_vault.rs) | `deposit_vault` | `amount: u64` |
| [`request_withdraw_vault.rs`](./request_withdraw_vault.rs) | `request_withdraw_vault` | `amount: u64, is_amount_in_lp: bool, is_withdraw_all: bool` |
| [`withdraw_vault.rs`](./withdraw_vault.rs) | `withdraw_vault` | none |
| [`cancel_request_withdraw_vault.rs`](./cancel_request_withdraw_vault.rs) | `cancel_request_withdraw_vault` | none |
| [`instant_withdraw_vault.rs`](./instant_withdraw_vault.rs) | `instant_withdraw_vault` | `amount: u64, is_amount_in_lp: bool, is_withdraw_all: bool` |

## Correct discriminators

These files use the CORRECT Anchor discriminators (`sha256("global:<ix_name>")[0..8]`), verified against the Mintlify docs:

| Instruction | Discriminator |
|---|---|
| `deposit_vault` | `[126, 224, 21, 255, 228, 53, 117, 33]` |
| `request_withdraw_vault` | `[248, 225, 47, 22, 116, 144, 23, 143]` |
| `withdraw_vault` | `[135, 7, 237, 120, 149, 94, 95, 7]` |
| `cancel_request_withdraw_vault` | `[231, 54, 14, 6, 223, 124, 127, 238]` |
| `instant_withdraw_vault` | `[221, 56, 115, 168, 128, 220, 235, 245]` |

> **WARNING — README discrepancy in the upstream `voltr-vault-cpi` repo.** The upstream `voltr-vault-cpi/README.md` lists STALE/WRONG discriminators for `deposit_vault` (`[41, 158, 82, 88, 95, 140, 106, 154]`), `request_withdraw_vault` (`[147, 67, 155, 26, 32, 163, 32, 193]`), and `withdraw_vault` (`[81, 229, 229, 94, 86, 233, 198, 15]`). DO NOT use those. The values in these `.rs` files and the Mintlify docs are authoritative.

## No signer seeds for vault PDAs

Your calling program does **not** provide PDA signer seeds for the vault's internal PDAs (`vault_asset_idle_auth`, `vault_lp_mint_auth`, `request_withdraw_vault_receipt`). The Voltr Vault program runs its own `invoke_signed` internally. You only pass the correct PDA addresses in the account list. The wrappers use plain `invoke`, not `invoke_signed`. The `user_transfer_authority` (and `payer` for `request_withdraw_vault`) must be signers on the outer transaction.
