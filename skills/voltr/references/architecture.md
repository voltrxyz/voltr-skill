# Voltr Architecture

> When to read this: FIRST. The shared mental model — programs, fund flow, roles, accounting, PDAs, addresses, and the vault instruction list — that every other reference and example assumes. Siblings: [vault-manager-sdk.md](./vault-manager-sdk.md), [vault-manager-cli.md](./vault-manager-cli.md), and the runnable [../examples/sdk/](../examples/sdk/).

Voltr is a permissionless vault framework on Solana for structured yield strategies. One vault custodies one asset, mints an LP token to depositors, and lets a manager route idle assets into DeFi protocols through standardized adaptor programs.

## Two program types

| | Vault program | Adaptor program |
|---|---|---|
| Count | One, canonical (`vVoLTRjQmtFpiYoegx285Ze4gsLJ8ZxgFKVcuvmG1a8`) | Many, one per integration (Lending, Kamino, Spot/Jupiter, Drift, Raydium, Trustful) |
| Owns | Deposits, LP accounting, fees, allocation authority, withdrawal flows | A CPI translation layer between the vault and one target protocol |
| Interface | Full instruction set (see table below) | Three standardized instructions: **initialize**, **deposit**, **withdraw** |
| Returns | — | A `u64` position value reported back to the vault via `get_return_data` |

### Composing via CPI

```
User deposits → Vault holds idle assets
                  ↓ (manager allocates: deposit_strategy / withdraw_strategy)
              Vault program CPIs the Adaptor program
                  ↓
              Adaptor program CPIs the target protocol (Kamino klend, Jupiter, …)
                  ↓
              Protocol holds assets, issues receipt/collateral tokens
                  ↓
              Adaptor reports the strategy's position value (u64) back to the vault
```

The "Voltr side" is stable; what varies per adaptor is: how the `strategy` address is derived, the 8-byte instruction discriminator, the remaining-accounts list, and any extra serialized args. The adaptor packages (`@voltr/scripts-kamino`, `-spot`, `-trustful`) encapsulate exactly those four things.

## Fund flow & accounting

- **Idle vs deployed.** Idle = assets in the vault's idle token account (no yield). Deployed = assets working in strategies. **Total assets = idle + sum of strategy position values.** Keep some idle to service withdrawals.
- **LP token / asset-per-LP.** Depositors receive LP tokens (9 decimals) from the vault's LP mint. A user's claim ≈ `userLp / totalLpSupply × vaultAssetTotalValue`. `asset-per-LP` rises as strategies earn yield; it is the canonical NAV-per-share. Use `getCurrentAssetPerLpForVault` to read it; use `calculateAssetsForWithdraw` for the authoritative post-fee withdrawable figure (the share ratio is a display-only approximation).
- **Locked profit.** Realized profit is not immediately withdrawable; it decays linearly over `lockedProfitDegradationDuration` (seconds) to deter timing/extraction attacks. During degradation, `asset-per-LP` for withdrawals is discounted.
- **High water mark (HWM).** Performance fees apply only to profit above the historical peak `asset-per-LP`. Below the HWM, no performance fee accrues. Admin can recalibrate via `calibrate_high_water_mark`.

### Fees

Set at `initialize_vault`, updated later one field at a time by the admin via `update_vault_config`. All fees are basis points except durations/caps.

| Fee | Field(s) | Buckets | Notes |
|---|---|---|---|
| Performance | `managerPerformanceFee`, `adminPerformanceFee` | manager + admin (+ protocol cut) | Only on profit above the HWM, after locked-profit degradation. |
| Management | `managerManagementFee`, `adminManagementFee` | manager + admin (+ protocol cut) | Time-based on AUM. Updating these requires the LP mint as an extra account (see SDK ref). |
| Redemption | `redemptionFee` | charged on withdraw | Reduces the user's withdrawable amount. |
| Issuance | `issuanceFee` | charged on deposit | Reduces LP minted on deposit. |

Harvesting (`harvest_fee`) mints accrued fees as LP tokens into three accounts: the **vault manager**, the **vault admin**, and the **protocol admin** (`vxyzZyfd6nJ3v82fTSmuRiKF4owWF9sAXqneu9mne9n`). Read accrued fees with `getAccumulatedManagerFeesForVault` / `getAccumulatedAdminFeesForVault`.

## Roles — keep separate keypairs

Voltr enforces a structural separation; treat these as distinct keypairs (use a multisig such as Squads for admin/manager in production).

| Role | Authority | Signs |
|---|---|---|
| **Protocol admin** | Voltr-level. Receives the protocol cut of fees; governs `init_protocol` / `update_protocol`. | Fixed protocol value, not per-vault. |
| **Vault admin** | Vault *structure*: create vault, LP metadata, fee/config updates, add/remove adaptors, register direct-withdraw, harvest fees, admin transfer. | `vault:init*`, `update-config`, adaptor admin, `harvest-fee`, `accept-admin`. |
| **Vault manager** | Fund *allocation*: initialize strategies, deposit/withdraw between idle and strategies, claim rewards, rebalance. Cannot change vault config. | All strategy operations (`kamino:*`, `spot:*`, `trustful:*`). |
| **User** | Deposit / withdraw, request/cancel/claim, instant-withdraw, direct-withdraw. | `vault:deposit`, the withdrawal flows. |

> The UI cannot initialize strategies or allocate funds. Those are CLI/SDK only. The CLI is the recommended default for managers; see [vault-manager-cli.md](./vault-manager-cli.md).

## PDA table

Derive with SDK `find*Pda` helpers (see [vault-manager-sdk.md](./vault-manager-sdk.md)); program = the vault program.

| PDA | Seeds | SDK helper |
|---|---|---|
| Protocol | `["protocol"]` | — |
| Vault asset idle authority | `["vault_asset_idle_auth", vault]` | `findVaultAssetIdleAuthPda({ vault })` |
| Vault LP mint authority | `["vault_lp_mint_auth", vault]` | (mint auth) |
| Vault LP mint | (program-derived from vault) | `findVaultLpMintPda({ vault })` |
| Vault strategy authority | (vault + strategy) | `findVaultStrategyAuthPda({ vault, strategy })` |
| Strategy init receipt | (vault + strategy) | `findStrategyInitReceiptPda({ vault, strategy })` |
| Adaptor add receipt | (vault + adaptor program) | `findAdaptorAddReceiptPda({ vault, adaptorProgram })` |
| Request-withdraw receipt | `["request_withdraw_vault_receipt", vault, user]` | `findRequestWithdrawVaultReceiptPda({ vault, userTransferAuthority })` |
| LP metadata (Metaplex) | (vault) | `findLpMetadataPda({ vault })` |

Notes:
- The **idle ATA** is the associated token account owned by the *idle auth* PDA for the asset mint — that is where idle assets sit.
- The **strategy auth** PDA is the per-strategy signer the vault uses when CPIing the adaptor; protocol receipt/collateral and reward ATAs are owned by it.
- The **request-withdraw receipt** also owns an LP escrow ATA holding the LP being redeemed while a request is pending.

## Deployed programs (mainnet)

| Program | Address |
|---|---|
| Vault | `vVoLTRjQmtFpiYoegx285Ze4gsLJ8ZxgFKVcuvmG1a8` |
| Lending Adaptor | `aVoLTRCRt3NnnchvLYH6rMYehJHwM5m45RmLBZq7PGz` |
| Drift Adaptor | `EBN93eXs5fHGBABuajQqdsKRkCgaqtJa8vEFD6vKXiP` |
| Raydium Adaptor | `A5a3Xo2JaKbXNShSHHP4Fe1LxcxNuCZs97gy3FJMSzkM` |
| Kamino Adaptor | `to6Eti9CsC5FGkAtqiPphvKD2hiQiLsS8zWiDBqBPKR` |
| Jupiter / Spot Adaptor | `EW35URAx3LiM13fFK3QxAXfGemHso9HWPixrv7YDY4AM` |
| Trustful Adaptor | `3pnpK9nrs1R65eMV1wqCXkDkhSgN18xb1G5pgYPwoZjJ` |
| Upgrade authority (multisig) | `7p4d84NuXbuDhaAq9H3Yp3vpBSDLQWousp1a4jBVoBgU` |
| Protocol admin (fee recipient) | `vxyzZyfd6nJ3v82fTSmuRiKF4owWF9sAXqneu9mne9n` |

## Vault program instructions (from IDL)

Grouped by who signs / what they do.

**Protocol lifecycle (protocol admin):** `init_protocol`, `update_protocol`, `accept_protocol_admin`, `update_vault_protocol_fee`.

**Vault lifecycle (admin):** `initialize_vault`, `create_lp_metadata`, `update_vault_config`, `accept_vault_admin`.

**Adaptor / strategy registration (admin):** `add_adaptor`, `remove_adaptor`, `initialize_strategy`, `initialize_direct_withdraw_strategy`, `close_strategy`.

**Allocation (manager):** `deposit_strategy`, `withdraw_strategy`.

**Fees (admin / harvester):** `harvest_fee`, `calibrate_high_water_mark`, `calibrate_high_water_mark_unsafe`.

**User flows:** `deposit_vault`, `request_withdraw_vault`, `cancel_request_withdraw_vault`, `withdraw_vault`, `instant_withdraw_vault`, `direct_withdraw_strategy`, `direct_withdraw_strategy_with_tolerance`, `instant_withdraw_strategy`, `instant_withdraw_strategy_with_tolerance`.

### Program errors (selected)

`InvalidAmount`, `InvalidTokenMint`, `InvalidTokenAccount`, `InvalidAccountInput`, `MathOverflow`, `FeeExceedsTotalAssetValue`, `MaxCapExceeded`, `VaultNotActive`, `ManagerNotAllowed`, `OperationNotAllowed`, `AdaptorEpochInvalid`, `InvalidFeeConfiguration`, `WithdrawalNotYetAvailable`, `InvalidInput`, `DivisionByZero`, `InstantWithdrawNotAllowed`.

## Gotchas

- **`maxCap: 0n` means ZERO capacity** — no deposits accepted. For an uncapped vault use the u64 max: `18_446_744_073_709_551_615n`.
- **One vault = one asset.** No multi-asset vaults.
- **Build phase hits the network.** SDK/CLI operations read chain state to build instructions even when not sending (see the transaction modes in [vault-manager-cli.md](./vault-manager-cli.md)).
- **v2 SDK only.** Use `@voltr/vault-sdk` + `@solana/kit`. The old `VoltrClient` (v1) API is gone; see the migration notes in [vault-manager-sdk.md](./vault-manager-sdk.md).
