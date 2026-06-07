# SDK examples (vault manager / app developer)

Runnable TypeScript using the raw v2 SDK (`@voltr/vault-sdk` + `@solana/kit`) — the lower-level path the CLI and `sdk-scripts/examples` wrap. Read [../../references/vault-manager-sdk.md](../../references/vault-manager-sdk.md) for the full surface and [../../references/architecture.md](../../references/architecture.md) for the model. For routine operations the [CLI](../../references/vault-manager-cli.md) is the recommended interface; reach for these only when embedding Voltr in your own code.

| File | Role | What it does |
|---|---|---|
| `create-vault.ts` | admin | `getInitializeVaultInstructionAsync` — create a vault (one asset, fees, caps). Admin signs + pays; a fresh keypair co-signs as the vault account. |
| `add-adaptor-and-init-strategy.ts` | admin → manager | `getAddAdaptorInstructionAsync` (one-time per adaptor) then `getInitializeStrategyInstructionAsync` (bind a strategy + discriminator + remaining accounts). |
| `allocate-funds.ts` | manager | `getDepositStrategyInstructionAsync` / `getWithdrawStrategyInstructionAsync` — move idle assets into / out of a strategy. |
| `read-vault-state.ts` | none (read-only) | `fetchVault` + extension helpers: total value, per-strategy positions, asset-per-LP, HWM, accrued fees, a user's withdrawable amount. |

## Running

```bash
npm install @voltr/vault-sdk @solana/kit @solana-program/token
npx tsx examples/sdk/create-vault.ts
```

These files build instructions and (where applicable) a transaction message; wire your own RPC and signers via the env placeholders before sending. **Always preview** (build → simulate) before executing on mainnet.

## Placeholders

Replace these before running (most are read from env):

- `HELIUS_RPC_URL` — a reliable Solana RPC endpoint.
- `ADMIN_SECRET_KEY_JSON` / `MANAGER_SECRET_KEY_JSON` — JSON byte arrays for the admin/manager keypairs (keep separate; see role separation in the architecture doc).
- `MANAGER_ADDRESS`, `VAULT_ADDRESS`, `USER_ADDRESS`, `ASSET_MINT`, `ASSET_TOKEN_PROGRAM`, `ADAPTOR_PROGRAM`, `STRATEGY_ADDRESS` — addresses for your deployment.
- The adaptor **instruction discriminator** and **remaining accounts** in the strategy/allocation examples are illustrative placeholders. For the core adaptors (Kamino, Spot/Jupiter, Trustful) use the adapter packages (`@voltr/scripts-kamino`, `-spot`, `-trustful`), which derive both. For a custom adaptor, supply your own (see [../../references/adaptor-creation.md](../../references/adaptor-creation.md)).

> `maxCap: 0n` means **zero** capacity, not unlimited — use `18_446_744_073_709_551_615n` (u64 max) for uncapped. Amounts are `bigint` (not BN) in raw token units.
