# Depositor & App-Developer Reference (deposit/withdraw via SDK + REST API)

When to read this: you are building a frontend, bot, or service that lets users deposit into and withdraw from Voltr vaults — either with the `@voltr/vault-sdk` v2 (`@solana/kit`) builders client-side, or via the public Voltr REST API that returns unsigned transactions to sign client-side.

Siblings: [./architecture.md](./architecture.md) (vault model & PDAs) · runnable code in [../examples/depositor/](../examples/depositor/) (`deposit.ts`, `request-withdraw.ts`, `withdraw.ts`, `instant-withdraw.ts`, `rest-api-deposit.ts`).

Verified constants:
- Vault program (mainnet): `vVoLTRjQmtFpiYoegx285Ze4gsLJ8ZxgFKVcuvmG1a8`
- SDK: `@voltr/vault-sdk` v2 + `@solana/kit` (the `get*InstructionAsync` builder surface; NOT the old v1 `VoltrClient`).
- REST API base: `https://api.voltr.xyz` · Swagger: `https://api.voltr.xyz/docs` · public, no API key.
- LP token decimals: always **9**. Asset decimals vary per vault (e.g. USDC = 6).

---

## 1. LP token model

A vault is an ERC4626-style share vault. A depositor sends the vault's **underlying asset** (e.g. USDC) and receives **LP tokens** representing a proportional claim on the vault's total value.

- Each vault mints a dedicated SPL **LP mint** (PDA: `findVaultLpMintPda({ vault })`, 9 decimals).
- Position value is tracked via **asset-per-LP** (a.k.a. share price): `assetPerLp = totalVaultValue / lpSupply`. As the strategy earns yield, `totalVaultValue` rises while `lpSupply` is unchanged, so each LP token becomes worth more underlying asset. Losses move it the other way.
- Deposit: `lpMinted ≈ assetAmount / assetPerLp` (minus issuance fee). Withdraw: `assetOut ≈ lpBurned * assetPerLp` (minus redemption fee).
- Read live share price on-chain with `getCurrentAssetPerLpForVault(rpc, vault)`; via API with `GET /vault/{pubkey}/share-price`.
- A user's underlying-asset balance is derived: `userAssets = userLp * assetPerLp`. Read it via `getPositionAndTotalValuesForVault` (SDK) or `GET /vault/{pubkey}/user/{userPubkey}/balance` (API).

Amounts are always **raw smallest units** (lamports / base units), expressed as `bigint` in the SDK and as decimal **strings** (`lamportAmount`) in the REST API.

---

## 2. Deposit flow

One instruction, single transaction. Builder: `getDepositVaultInstructionAsync`.

1. Ensure the user has an associated token account (ATA) for the vault LP mint (`getCreateAssociatedTokenIdempotentInstruction*`). For native SOL vaults, also wrap SOL into wSOL first (create wSOL ATA, transfer SOL, `syncNative`).
2. Append `getDepositVaultInstructionAsync({ userTransferAuthority, vault, vaultAssetMint, assetTokenProgram, amount })`.
3. Sign with the user's wallet and send.

`amount` = raw asset units (e.g. `1_000_000n` = 1 USDC). The vault deducts the **issuance fee** (if any) then mints LP to the user. Reverts with `MaxCapExceeded` if the deposit would push vault TVL past `maxCap`.

See [../examples/depositor/deposit.ts](../examples/depositor/deposit.ts).

---

## 3. Withdrawal: two-step vs instant vs cancel

Vaults configure a `withdrawalWaitingPeriod` (seconds). This dictates which path is valid.

| Path | When usable | Steps | Builders |
|---|---|---|---|
| **Two-step** | always (required when `withdrawalWaitingPeriod > 0`) | request → wait period → claim | `getRequestWithdrawVaultInstructionAsync` then `getWithdrawVaultInstructionAsync` |
| **Instant** | only when `withdrawalWaitingPeriod == 0` | single tx | `getInstantWithdrawVaultInstructionAsync` |
| **Cancel** | while a request is outstanding | single tx, returns escrowed LP | `getCancelRequestWithdrawVaultInstructionAsync` |

### Two-step withdrawal

**Step 1 — request_withdraw** (`getRequestWithdrawVaultInstructionAsync`):
- First create an ATA for the **request-withdraw receipt PDA** to escrow the user's LP (`findRequestWithdrawVaultReceiptPda({ vault, userTransferAuthority })`, then create that PDA's LP ATA idempotently).
- Then call the builder with `{ payer, userTransferAuthority, vault, amount, isAmountInLp, isWithdrawAll }`.
- This **escrows** the corresponding LP into the receipt and records `withdrawableFromTs = now + withdrawalWaitingPeriod`.
- Only **one active request per user per vault** — the receipt PDA is unique per `(vault, user)`. Submit a second request while one is open and it reverts (`OperationNotAllowed`).

**Step 2 — withdraw / claim** (`getWithdrawVaultInstructionAsync`):
- Takes **no amount params** — it claims exactly the outstanding request: `{ userTransferAuthority, vault, vaultAssetMint, assetTokenProgram }`.
- Ensure the user has an asset ATA first; for native SOL, append a `closeAccount` to unwrap.
- Reverts with `WithdrawalNotYetAvailable` if `now < withdrawableFromTs`. Check readiness via `getPendingWithdrawalForUser` / `GET .../pending-withdrawal` (returns `amountAtPresent` and `withdrawableFromTs`).

### Instant withdrawal

`getInstantWithdrawVaultInstructionAsync({ userTransferAuthority, vault, vaultAssetMint, assetTokenProgram, amount, isAmountInLp, isWithdrawAll })` — burns LP and returns assets in a **single transaction**, no request/claim cycle. Works **only when `withdrawalWaitingPeriod == 0`**; otherwise reverts with `InstantWithdrawNotAllowed`. (Distinct from manager-side strategy "direct withdraw".)

### Cancel

`getCancelRequestWithdrawVaultInstructionAsync({ userTransferAuthority, vault })` — no amount params. Closes the outstanding request and returns the escrowed LP to the user. Reverts (`OperationNotAllowed`) if no request is outstanding.

See [../examples/depositor/request-withdraw.ts](../examples/depositor/request-withdraw.ts), [../examples/depositor/withdraw.ts](../examples/depositor/withdraw.ts), [../examples/depositor/instant-withdraw.ts](../examples/depositor/instant-withdraw.ts).

---

## 4. `is_amount_in_lp` / `is_withdraw_all` semantics

Apply to `request_withdraw` and `instant_withdraw` (and the REST direct-withdraw). The `withdraw` (claim) and `cancel` instructions take **no** extra params.

| Param | Type | Meaning |
|---|---|---|
| `amount` | `u64` (`bigint`) | The quantity to withdraw, in raw smallest units. |
| `isAmountInLp` | `bool` | `true` → `amount` is in **LP tokens**. `false` → `amount` is in **underlying asset** units (the program converts to LP at the current share price). |
| `isWithdrawAll` | `bool` | `true` → withdraw the user's **entire LP balance**; `amount` and `isAmountInLp` are ignored. `false` → use `amount`. |

REST defaults (server-side): `request-withdrawal` → `isAmountInLp` defaults to `true`, `isWithdrawAll` defaults to `false`. SDK builders have no defaults — pass all three explicitly.

---

## 5. SDK quick reference (`@voltr/vault-sdk` v2)

Install: `npm install @voltr/vault-sdk @solana/kit`. Use `@solana/web3.js` only behind a narrow compat boundary.

### User-flow instruction builders

| Builder | Key args | Notes |
|---|---|---|
| `getDepositVaultInstructionAsync` | `{ userTransferAuthority, vault, vaultAssetMint, assetTokenProgram, amount }` | `amount` in asset units. |
| `getRequestWithdrawVaultInstructionAsync` | `{ payer, userTransferAuthority, vault, amount, isAmountInLp, isWithdrawAll }` | Pre-create the receipt-PDA LP ATA. |
| `getWithdrawVaultInstructionAsync` | `{ userTransferAuthority, vault, vaultAssetMint, assetTokenProgram }` | Claims the outstanding request; no amount. |
| `getInstantWithdrawVaultInstructionAsync` | `{ userTransferAuthority, vault, vaultAssetMint, assetTokenProgram, amount, isAmountInLp, isWithdrawAll }` | Only if `withdrawalWaitingPeriod == 0`. |
| `getCancelRequestWithdrawVaultInstructionAsync` | `{ userTransferAuthority, vault }` | No amount. |

`userTransferAuthority` / `payer` accept a `@solana/kit` `KeyPairSigner` (or `createNoopSigner(address)` when building an unsigned tx for someone else to sign — that is exactly what the REST backend does).

### Read helpers

| Helper | Returns |
|---|---|
| `getCurrentAssetPerLpForVault(rpc, vault)` | Current share price (asset per LP). |
| `getPositionAndTotalValuesForVault(rpc, vault, user)` | User position (LP + withdrawable asset value, pre/post fee) and vault totals. |
| `getPendingWithdrawalForUser(rpc, vault, user)` | `{ amountAssetToWithdrawAtPresent, withdrawableFromTs, ... }`, or throws/empty if none. |
| `fetchVault(rpc, vault)` | Raw vault account (incl. `withdrawalWaitingPeriod`, `maxCap`, fees). |
| `fetchRequestWithdrawVaultReceipt(rpc, pda)` | The outstanding request receipt. |
| `getVaultLpSupplyBreakdown(rpc, vault)` | LP supply totals. |

### PDA helpers

- `findVaultLpMintPda({ vault })`
- `findVaultAssetIdleAuthPda({ vault })`
- `findRequestWithdrawVaultReceiptPda({ vault, userTransferAuthority })` — seeds `["request_withdraw_vault_receipt", vault, user]`; unique per user per vault.

### Build/sign/send shape (`@solana/kit`)

```ts
import { createSolanaRpc, createSolanaRpcSubscriptions, pipe,
  createTransactionMessage, setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash, appendTransactionMessageInstructions,
  signTransactionMessageWithSigners, sendAndConfirmTransactionFactory,
  getSignatureFromTransaction } from "@solana/kit";
// build message → sign → send (full code in ../examples/depositor/*.ts)
```

---

## 6. REST API reference

Base: `https://api.voltr.xyz`. No auth. Routes are mounted directly at `/vault` and `/vaults` (no `/api` prefix). Confirmed from `voltr-api` source: `src/routes/vault.route.ts`, `src/routes/vaults.route.ts`, `src/controllers/vault.controller.ts`, `src/dtos/params.dto.ts`.

### Transaction-building endpoints (POST)

All return `{ "success": true, "transaction": "<base58 unsigned versioned tx>" }`. The transaction is a **fully built, optimized, unsigned versioned transaction** serialized as a **base58** string; signature slots are zero-filled. Private keys never touch the backend — you deserialize, sign client-side, and broadcast. An optional `Referer` header is recorded as a memo (`source: <referer>`) for deposit/withdraw/direct-withdraw.

| Method | Path | Body (JSON) | Builds |
|---|---|---|---|
| POST | `/vault/{pubkey}/deposit` | `userPubkey` (req), `lamportAmount` (req, string), `assetMint?`, `assetTokenProgram?` | Deposit (+ wraps SOL & creates ATAs) |
| POST | `/vault/{pubkey}/request-withdrawal` | `userPubkey` (req), `lamportAmount` (req, string), `isAmountInLp?` (default `true`), `isWithdrawAll?` (default `false`) | Two-step request (escrows LP) |
| POST | `/vault/{pubkey}/withdraw` | `userPubkey` (req), `assetMint?`, `assetTokenProgram?` | Claim outstanding request (no amount) |
| POST | `/vault/{pubkey}/cancel-withdrawal` | `userPubkey` (req) | Cancel outstanding request |
| POST | `/vault/{pubkey}/direct-withdraw` | `userPubkey` (req), `lamportAmount` (req, string), `isWithdrawAll` (req, bool), `assetMint?`, `assetTokenProgram?` | Instant/direct withdraw for supported vaults |

Notes:
- `lamportAmount` is a **string** (avoids u64 JS-number overflow). `isAmountInLp` / `isWithdrawAll` are JSON booleans.
- For `request-withdrawal`, the controller passes `isAmountInLp ?? true` and `isWithdrawAll ?? false`.
- `direct-withdraw` requires `isWithdrawAll` in the body (not optional). It is the API's instant-withdraw equivalent; it bypasses the waiting period for vaults that support a direct-withdraw integration (e.g. certain Kamino/Drift/Jupiter-backed vaults). There is **no** `/vault/{pubkey}/instant-withdraw` route — use `direct-withdraw`.

### Read endpoints — single vault (GET)

| Path | Params | Returns |
|---|---|---|
| `/vault/{pubkey}` | path `pubkey` | `{ success, vault }` — full vault info (config, asset, apy, allocations, `withdrawalWaitingPeriod`, `maxCap`, fees) |
| `/vault/{pubkey}/fee-earned` | query `startTs?`, `endTs?` | `{ success, data: { feeEarnedInLp } }` |
| `/vault/{pubkey}/share-price` | query `ts?` | `{ success, data: { sharePrice, totalValue } }` |
| `/vault/{pubkey}/simulate-deposit` | query `amount` (req, asset units) | `{ success, data: { estimatedLpAmount } }` |
| `/vault/{pubkey}/simulate-withdraw` | query `amount` (req, LP units) | `{ success, data: { estimatedAssetAmount } }` |
| `/vault/{pubkey}/lp-supply` | path `pubkey` | `{ circulatingSupply }` |
| `/vault/{pubkey}/user/{userPubkey}/balance` | path | `{ success, data: { userAssetAmount } }` (asset units) |
| `/vault/{pubkey}/user/{userPubkey}/pending-withdrawal` | path | `{ success, data: { amountAtPresent, withdrawableFromTs } \| null }` |
| `/vault/{pubkey}/user/{userPubkey}/actions` | query `limit?`, `offset?` | `{ success, data: VaultAction[] }` |

### Read endpoints — all vaults (GET, `/vaults`)

| Path | Returns |
|---|---|
| `/vaults` | `{ success, vaults: Vault[] }` |
| `/vaults/tvl` | `{ success, data: TotalTvl }` |
| `/vaults/interest-earned` | `{ success, data: InterestEarned }` (query `startTs?`, `endTs?`) |
| `/vaults/price` | `{ success, data: { [lpMint]: { value, priceChange24h } } }` |
| `/vaults/strategy-apr` | `{ success, data: { name, apy }[] }` |
| `/vaults/user/{userPubkey}/balance` | `{ success, data: UserVaultBalance[] }` (across non-hidden vaults) |
| `/vaults/user/{userPubkey}/actions` | `{ success, data: VaultAction[] }` (query `limit?`, `offset?`) |
| `/vaults/user/{userPubkey}/interest-earned` | `{ success, data: UserVaultInterestEarned[] }` (query `startTs?`, `endTs?`) |
| `/vaults/user/{userPubkey}/interest-earned/daily` | `{ success, data: UserVaultInterestEarnedPeriod[] }` |
| `/vaults/user/{userPubkey}/interest-earned/monthly` | `{ success, data: UserVaultInterestEarnedPeriod[] }` |

### Build-then-sign pattern

1. `POST` to a transaction-building endpoint with the user's pubkey + amount.
2. Receive `{ success, transaction }` where `transaction` is a **base58** serialized unsigned versioned tx.
3. Client-side: base58-decode → bytes → `getTransactionDecoder()` → sign with the user's wallet/signer → broadcast via your RPC.

End-to-end code: [../examples/depositor/rest-api-deposit.ts](../examples/depositor/rest-api-deposit.ts).

---

## 7. Errors

Program errors surfaced when the signed transaction is simulated/sent (the build endpoints succeed; failures appear on-chain or in simulation). Map and surface these to users.

| Error | Cause | Fix |
|---|---|---|
| `InvalidAmount` | Amount is 0, exceeds the user's LP/asset balance, or rounds to 0 LP. | Validate against the user's balance and the live share price before building. |
| `MaxCapExceeded` | Deposit would push vault TVL past `maxCap`. | Read `maxCap` + current TVL (`GET /vault/{pubkey}`); cap the deposit to remaining capacity. |
| `WithdrawalNotYetAvailable` | `withdraw` (claim) called before `withdrawableFromTs`. | Poll `pending-withdrawal` / `getPendingWithdrawalForUser`; only claim when `now >= withdrawableFromTs`. |
| `InstantWithdrawNotAllowed` | `instant_withdraw` on a vault with `withdrawalWaitingPeriod > 0`. | Use the two-step request → withdraw path instead. |
| `OperationNotAllowed` | Operation disabled via `DisabledOperations`, or a second request while one is outstanding, or cancel with none outstanding. | Check for an existing request first; respect the vault's disabled-operations config. |

REST-layer errors return `{ success: false, error: "<message>" }` with an HTTP status (e.g. `404` for an unknown vault, `400` for validation failures on body/params).
