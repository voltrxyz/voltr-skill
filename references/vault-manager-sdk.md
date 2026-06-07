# Vault Manager — SDK (`@voltr/vault-sdk` v2)

> When to read this: building Voltr transactions in TypeScript with `@solana/kit` — admin + manager operations via the generated `@voltr/vault-sdk`. Read [architecture.md](./architecture.md) first for the mental model. Runnable code: [../examples/sdk/](../examples/sdk/). For the operator CLI built on top of this, see [vault-manager-cli.md](./vault-manager-cli.md).

`@voltr/vault-sdk` `2.0.0` is a generated client built around instruction builders, PDA helpers, account fetchers, and extension helpers. The default client stack is `@solana/kit` (not `@solana/web3.js`).

## Install

```bash
npm install @voltr/vault-sdk @solana/kit
# plus, as needed:
npm install @solana-program/token @solana-program/system
```

Use `@solana/web3.js` only when an upstream dependency still requires it.

## Compositional model

There is **no `VoltrClient` class** in v2. You compose four families:

- `get*InstructionAsync(...)` — instruction builders for writes (one per program instruction).
- `find*Pda(...)` — PDA derivation helpers (return `[address, bump]`).
- `fetch*` — on-chain account loaders (take a kit RPC).
- extension helpers — derived reads for fees, LP economics, positions, withdrawals.

A builder returns a kit `Instruction`; you assemble instructions into a transaction message and sign/send with kit. The sdk-scripts repo wraps each builder in a `build*Operation(ctx, args)` that returns a `BuiltOperation` and feeds a shared processor — but the SDK itself is just the builders below.

## Minimal setup

```typescript
import {
  createKeyPairSignerFromBytes,
  generateKeyPairSigner,
} from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token";
import {
  findVaultAssetIdleAuthPda,
  getInitializeVaultInstructionAsync,
} from "@voltr/vault-sdk";

const adminSigner = await createKeyPairSignerFromBytes(
  Uint8Array.from(JSON.parse(process.env.ADMIN_SECRET_KEY_JSON!))
);
const vaultSigner = await generateKeyPairSigner(); // the vault account; must sign init

const [vaultAssetIdleAuth] = await findVaultAssetIdleAuthPda({
  vault: vaultSigner.address,
});
const [vaultAssetIdleAta] = await findAssociatedTokenPda({
  owner: vaultAssetIdleAuth,
  mint: assetMint,
  tokenProgram: assetTokenProgram,
});

const initializeVaultIx = await getInitializeVaultInstructionAsync({
  payer: adminSigner,
  admin: adminSigner.address,
  manager: managerAddress,            // distinct keypair's address — does NOT sign init
  vault: vaultSigner,
  vaultAssetMint: assetMint,
  vaultAssetIdleAta,
  assetTokenProgram,
  maxCap: 18_446_744_073_709_551_615n, // u64 max = uncapped; 0n = ZERO capacity
  startAtTs: 0n,
  lockedProfitDegradationDuration: 86_400n,
  managerPerformanceFee: 1_000,        // bps
  adminPerformanceFee: 500,
  managerManagementFee: 50,
  adminManagementFee: 25,
  redemptionFee: 10,
  issuanceFee: 10,
  withdrawalWaitingPeriod: 0n,
  name: "My Voltr Vault",
  description: "Short vault strategy description",
});
```

Amounts/caps/timestamps/durations are `bigint`; fees and bps are `number` (u16). All addresses are kit `Address` strings.

## Instruction builders

### Vault lifecycle (admin)

| Builder | Purpose |
|---|---|
| `getInitializeVaultInstructionAsync` | Create the vault, LP mint, idle ATA; set initial config/fees. |
| `getCreateLpMetadataInstructionAsync` | Set Metaplex LP-token metadata (`name`, `symbol`, `uri`). Pass `metadataAccount` from `findLpMetadataPda`. |
| `getUpdateVaultConfigInstructionAsync` | Update one config field (see [Updating config](#updating-config)). |
| `getAcceptVaultAdminInstruction` | Pending admin claims the role (note: synchronous `getAccept…Instruction`, no `Async`). |

### User flows

| Builder | Purpose |
|---|---|
| `getDepositVaultInstructionAsync` | Deposit asset, mint LP. Args: `userTransferAuthority`, `vault`, `vaultAssetMint`, `assetTokenProgram`, `amount`. |
| `getRequestWithdrawVaultInstructionAsync` | Open a withdrawal request. Args include `amount`, `isAmountInLp`, `isWithdrawAll`. One outstanding request per user per vault. |
| `getCancelRequestWithdrawVaultInstructionAsync` | Cancel the outstanding request. |
| `getWithdrawVaultInstructionAsync` | Claim a requested withdrawal after the waiting period. |
| `getInstantWithdrawVaultInstructionAsync` | Redeem LP directly against idle assets in one tx (no request/claim). Same `amount`/`isAmountInLp`/`isWithdrawAll` args. |

### Manager + admin flows (allocation & adaptors)

| Builder | Role | Purpose |
|---|---|---|
| `getAddAdaptorInstructionAsync` | admin | Register an adaptor program on the vault (one-time per adaptor). Args: `payer`, `admin`, `vault`, `adaptorProgram`. |
| `getRemoveAdaptorInstructionAsync` | admin | Deregister an adaptor. |
| `getInitializeStrategyInstructionAsync` | manager | Initialize a strategy on the vault. Args: `payer`, `manager`, `vault`, `strategy`, `adaptorProgram`, `instructionDiscriminator` (8 bytes), `additionalArgs`. Add protocol remaining accounts. |
| `getInitializeDirectWithdrawStrategyInstructionAsync` | admin | Register a user direct-withdraw path for a strategy. Args: `payer`, `admin`, `vault`, `strategy`, `adaptorProgram`, `instructionDiscriminator`, `additionalArgs`, `allowUserArgs`. |
| `getDepositStrategyInstructionAsync` | manager | Allocate idle → strategy via adaptor CPI. Args: `manager`, `vault`, `strategy`, `vaultAssetMint`, `assetTokenProgram`, `adaptorProgram`, `amount`, `instructionDiscriminator`, `additionalArgs`. |
| `getWithdrawStrategyInstructionAsync` | manager | Pull strategy → idle. Same arg shape; pass a large `amount` to withdraw all. |
| `getDirectWithdrawStrategyInstructionAsync` | user | User withdraws directly from a strategy (requires a registered direct-withdraw). |
| `getHarvestFeeInstructionAsync` | admin/harvester | Mint accrued fees to manager/admin/protocol LP accounts. Args: `harvester`, `vaultManager`, `vaultAdmin`, `protocolAdmin`, `vault`. |
| `getCalibrateHighWaterMarkInstructionAsync` | admin | Recalibrate the HWM. Args: `admin`, `vault`. |

> Strategy builders need protocol-specific **remaining accounts** and the right 8-byte **discriminator**. Do not hand-build these for Kamino/Spot/Trustful — use the adapter packages (`@voltr/scripts-kamino`, `-spot`, `-trustful`), which derive the accounts and supply the discriminator. The raw SDK path (manual remaining accounts) is shown in the strategy-initialization docs and is only for custom adaptors. See [../examples/sdk/allocate-funds.ts](../examples/sdk/allocate-funds.ts) and [add-adaptor-and-init-strategy.ts](../examples/sdk/add-adaptor-and-init-strategy.ts).

## PDA helpers

```typescript
import {
  findVaultLpMintPda,
  findVaultAssetIdleAuthPda,
  findVaultStrategyAuthPda,
  findStrategyInitReceiptPda,
  findRequestWithdrawVaultReceiptPda,
  findLpMetadataPda,
  findAdaptorAddReceiptPda,
} from "@voltr/vault-sdk";

const [lpMint]        = await findVaultLpMintPda({ vault });
const [idleAuth]      = await findVaultAssetIdleAuthPda({ vault });
const [strategyAuth]  = await findVaultStrategyAuthPda({ vault, strategy });
const [initReceipt]   = await findStrategyInitReceiptPda({ vault, strategy });
const [rwReceipt]     = await findRequestWithdrawVaultReceiptPda({ vault, userTransferAuthority });
const [lpMetadata]    = await findLpMetadataPda({ vault });
const [adaptorReceipt]= await findAdaptorAddReceiptPda({ vault, adaptorProgram });
```

See the seed table in [architecture.md](./architecture.md#pda-table).

## Reads & extension helpers

```typescript
import { createSolanaRpc } from "@solana/kit";
import {
  fetchVault,
  fetchRequestWithdrawVaultReceipt,
  fetchAllStrategyInitReceiptAccountsOfVault,
  getPositionAndTotalValuesForVault,
  getAccumulatedAdminFeesForVault,
  getAccumulatedManagerFeesForVault,
  getHighWaterMarkForVault,
  getCurrentAssetPerLpForVault,
  getVaultLpSupplyBreakdown,
  getPendingWithdrawalForUser,
  calculateAssetsForWithdraw,
} from "@voltr/vault-sdk";

const rpc = createSolanaRpc(process.env.HELIUS_RPC_URL!);

const vault = await fetchVault(rpc, vaultAddress);
const totalValue = vault.data.asset.totalValue;          // bigint, asset base units
const assetPerLp = await getCurrentAssetPerLpForVault(rpc, vaultAddress);
const { totalValue: tv, strategies } = await getPositionAndTotalValuesForVault(rpc, vaultAddress);
const withdrawable = await calculateAssetsForWithdraw(rpc, vaultAddress, userLpAmount);
```

| Helper | Returns |
|---|---|
| `fetchVault(rpc, vault)` | Decoded vault account (config, fees, `asset.totalValue`, HWM, …). |
| `fetchRequestWithdrawVaultReceipt(rpc, pda)` | A user's pending request receipt. |
| `fetchAllStrategyInitReceiptAccountsOfVault(rpc, vault)` | All initialized strategies for the vault. |
| `getPositionAndTotalValuesForVault(rpc, vault)` | `{ totalValue, strategies: [{ strategyId, amount }] }`. |
| `getAccumulatedManagerFeesForVault` / `…AdminFeesForVault` | Accrued (unharvested) fee amounts. |
| `getHighWaterMarkForVault` | Current HWM (`asset-per-LP` peak). |
| `getCurrentAssetPerLpForVault` | Current NAV per LP. |
| `getVaultLpSupplyBreakdown` | LP supply split across holders/fee buckets. |
| `getPendingWithdrawalForUser` | A user's outstanding withdrawal, if any. |
| `calculateAssetsForWithdraw(rpc, vault, lpAmount)` | Authoritative withdrawable asset amount after redemption fee + locked-profit degradation. |

See [../examples/sdk/read-vault-state.ts](../examples/sdk/read-vault-state.ts).

## Updating config

`getUpdateVaultConfigInstructionAsync` updates **one field per call**, and `data` must be a **pre-serialized** little-endian byte payload matching the field's type.

```typescript
import {
  getUpdateVaultConfigInstructionAsync,
  findVaultLpMintPda,
  VaultConfigField,
} from "@voltr/vault-sdk";
import { getU16Encoder, getU64Encoder, getAddressEncoder } from "@solana/kit";

// u16 field (fees, disabled-operations): 2-byte LE
const data = new Uint8Array(getU16Encoder().encode(1_500)); // 1500 bps

const updateIx = await getUpdateVaultConfigInstructionAsync({
  admin: adminSigner,
  vault: vaultAddress,
  field: VaultConfigField.ManagerPerformanceFee,
  data,
});
```

Per-field encoding:

| Kind | Fields | Encoder |
|---|---|---|
| `u64` (8-byte LE) | `MaxCap`, `StartAtTs`, `LockedProfitDegradationDuration`, `WithdrawalWaitingPeriod` | `getU64Encoder()` (bigint) |
| `u16` (2-byte LE) | `ManagerPerformanceFee`, `AdminPerformanceFee`, `ManagerManagementFee`, `AdminManagementFee`, `RedemptionFee`, `IssuanceFee`, `DisabledOperations` | `getU16Encoder()` (number) |
| `address` (32 bytes) | `Manager`, `PendingAdmin` | `getAddressEncoder()` |

`VaultConfigField` members: `MaxCap`, `StartAtTs`, `LockedProfitDegradationDuration`, `WithdrawalWaitingPeriod`, `ManagerPerformanceFee`, `AdminPerformanceFee`, `ManagerManagementFee`, `AdminManagementFee`, `RedemptionFee`, `IssuanceFee`, `Manager`, `PendingAdmin`, `DisabledOperations`.

> **Management-fee updates** (`ManagerManagementFee`, `AdminManagementFee`) require the vault LP mint appended as a read-only account on the instruction:
> ```typescript
> const [vaultLpMint] = await findVaultLpMintPda({ vault: vaultAddress });
> const finalIx = { ...updateIx, accounts: [...(updateIx.accounts ?? []), { address: vaultLpMint, role: AccountRole.READONLY }] };
> ```

> Admin transfer is two steps: admin sets `PendingAdmin` via `update_vault_config`, then the incoming admin signs `getAcceptVaultAdminInstruction`.

## Fees

```typescript
import {
  getHarvestFeeInstructionAsync,
  getCalibrateHighWaterMarkInstructionAsync,
} from "@voltr/vault-sdk";

// Harvest: mints accrued fees as LP into manager / admin / protocol accounts.
// Ensure those three LP ATAs exist first (idempotent create).
const harvestIx = await getHarvestFeeInstructionAsync({
  harvester: adminSigner,            // signs + pays
  vaultManager: vaultManagerAddress, // receives manager share
  vaultAdmin: vaultAdminAddress,     // receives admin share
  protocolAdmin: "vxyzZyfd6nJ3v82fTSmuRiKF4owWF9sAXqneu9mne9n", // protocol cut
  vault: vaultAddress,
});

const calibrateIx = await getCalibrateHighWaterMarkInstructionAsync({
  admin: adminSigner,
  vault: vaultAddress,
});
```

Read accrued fees / HWM with `getAccumulatedManagerFeesForVault`, `getAccumulatedAdminFeesForVault`, `getHighWaterMarkForVault` (above).

## v1 → v2 migration

The local `voltr-sdk` repo is the **old v1** (`VoltrClient`). Do not use its API. Migrate as:

| v1 (`VoltrClient`) | v2 (`@voltr/vault-sdk` + `@solana/kit`) |
|---|---|
| `new VoltrClient(connection)` | `createSolanaRpc(url)` + direct imports |
| `client.create*Ix(...)` | `get*InstructionAsync(...)` |
| `client.find*...` | `find*Pda(...)` |
| convenience query methods | `fetchVault(...)` + extension helpers |
| `BN` arguments | `bigint` |
| `@solana/web3.js` `PublicKey` / `Connection` | kit `Address` / RPC |

## Reference implementations

The maintained end-to-end consumers of this SDK live in `sdk-scripts` (`github.com/voltrxyz/sdk-scripts`): the **CLI** (`apps/cli`) and the **programmatic examples** (`examples/`). The examples in this skill ([../examples/sdk/](../examples/sdk/)) call the raw SDK builders directly with `@solana/kit`.
