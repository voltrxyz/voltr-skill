# Depositor examples

Runnable scripts for depositing into and withdrawing from a Voltr vault, as a user / app developer. Two routes are shown: the `@voltr/vault-sdk` v2 builders (client-side, sign locally) and the public REST API (server builds an unsigned tx, you sign client-side).

Reference: [../../references/depositor-and-api.md](../../references/depositor-and-api.md).

## Files

| File | What it does | Builder / endpoint |
|---|---|---|
| [deposit.ts](./deposit.ts) | Deposit asset → receive LP | `getDepositVaultInstructionAsync` |
| [request-withdraw.ts](./request-withdraw.ts) | Two-step withdrawal, step 1 (escrow LP, start waiting period) | `getRequestWithdrawVaultInstructionAsync` |
| [withdraw.ts](./withdraw.ts) | Two-step withdrawal, step 2 (claim after waiting period) | `getWithdrawVaultInstructionAsync` |
| [instant-withdraw.ts](./instant-withdraw.ts) | Single-tx redeem (only when `withdrawalWaitingPeriod == 0`) | `getInstantWithdrawVaultInstructionAsync` |
| [rest-api-deposit.ts](./rest-api-deposit.ts) | Deposit via REST: fetch unsigned tx, sign, send | `POST https://api.voltr.xyz/vault/{pubkey}/deposit` |
| [_shared.ts](./_shared.ts) | Helpers: load kit signer, build/sign/send a v0 tx | — |

Cancel an outstanding request with `getCancelRequestWithdrawVaultInstructionAsync` (no amount params) — same shape as `withdraw.ts`.

## Setup

```bash
npm install @voltr/vault-sdk @solana/kit @solana-program/token
```

Environment variables (used by `_shared.ts`):

- `RPC_URL` — Solana RPC HTTP endpoint (a `ws://`/`wss://` subscriptions URL is derived from it). Defaults to mainnet-beta public RPC.
- `USER_KEYPAIR` — path to a Solana keypair JSON file (the depositor's wallet).

Run any file with `npx tsx <file>.ts`.

## Placeholders to fill in

Edit the constants at the top of each file before running:

- `VAULT` — `"VAULT_ADDRESS"` → the target Voltr vault pubkey.
- `ASSET_MINT` — defaults to USDC (`EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`); set to the vault's underlying asset mint.
- `ASSET_TOKEN_PROGRAM` — defaults to SPL Token; use the Token-2022 program address for Token-2022 assets.
- `AMOUNT` / `LAMPORT_AMOUNT` — raw smallest units. SDK examples use `bigint`; the REST example uses a **string**.
- `IS_AMOUNT_IN_LP` / `IS_WITHDRAW_ALL` — see the reference's `is_amount_in_lp` / `is_withdraw_all` section.

## Notes

- LP mint has 9 decimals; asset decimals vary by vault (USDC = 6). All amounts are raw units.
- Preview conversions before building: `GET /vault/{pubkey}/simulate-deposit?amount=...` and `GET /vault/{pubkey}/simulate-withdraw?amount=...`.
- `instant-withdraw.ts` reverts with `InstantWithdrawNotAllowed` unless `withdrawalWaitingPeriod == 0`. The REST equivalent is `POST /vault/{pubkey}/direct-withdraw` (there is no `/instant-withdraw` route).
- These are illustrative; pin exact dependency versions and confirm builder/`@solana/kit` signatures against the installed package versions.
