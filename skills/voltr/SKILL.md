---
name: voltr
description: "Build on Voltr — the permissionless vault framework for structured yield strategies on Solana. Use for any Voltr task: creating/configuring/operating vaults (vault managers, admin + manager roles), depositing/withdrawing as a user or app/frontend/bot, building custom on-chain adaptors that bridge a vault to a DeFi protocol (yield protocols), or CPI-ing into the vault program from another program (composing protocols). Triggers: voltr, voltr vault, @voltr/vault-sdk, vault-sdk, sdk-scripts, vVoLTRjQmtFpiYoegx285Ze4gsLJ8ZxgFKVcuvmG1a8, create vault, vault manager, allocate to strategy, deposit_vault/withdraw_vault, request withdraw, instant withdraw, LP token, asset-per-LP, high water mark, voltr adaptor, custom adaptor, deposit/withdraw strategy, Kamino/Drift/Spot/Jupiter/Trustful adaptor, CPI into voltr, compose vault LP. Solana + Anchor + @solana/kit."
---

# Voltr

Voltr is a permissionless framework on Solana for building and operating yield-generating **vaults**. A vault custodies **one asset**, mints an **LP token** to depositors, and lets a **manager** route idle assets into DeFi protocols through standardized **adaptor** programs. Two on-chain program types: the single canonical **vault program** (`vVoLTRjQmtFpiYoegx285Ze4gsLJ8ZxgFKVcuvmG1a8`, mainnet) and many **adaptor programs** (one per integration).

**Read [references/architecture.md](references/architecture.md) first** — the shared mental model (programs, fund flow, roles, accounting, PDAs, addresses, errors) that every other file assumes. Then jump to your track below. All references are dense, agent-facing, and cross-linked; load only what the task needs.

## Pick your track

| You are… | Goal | Read | Code |
|---|---|---|---|
| **Vault manager** (admin/manager) | Create, configure, allocate, operate a vault | [vault-manager-cli.md](references/vault-manager-cli.md) (recommended) · [vault-manager-sdk.md](references/vault-manager-sdk.md) | [examples/sdk/](examples/sdk/) |
| **Depositor / app dev** | Deposit & withdraw for users (frontend, bot, service) | [depositor-and-api.md](references/depositor-and-api.md) | [examples/depositor/](examples/depositor/) |
| **Yield protocol** | Build a custom adaptor bridging a vault to your protocol | [adaptor-creation.md](references/adaptor-creation.md) | [examples/adaptor/](examples/adaptor/) |
| **Composing protocol** | CPI into the vault from your own on-chain program | [cpi-integration.md](references/cpi-integration.md) | [examples/cpi/](examples/cpi/) |

## Decision shortcuts

- **On-chain vs off-chain?** Inside a Solana program → CPI ([cpi-integration.md](references/cpi-integration.md)) or build an adaptor ([adaptor-creation.md](references/adaptor-creation.md)). Off-chain (bot/frontend/CLI) → SDK/CLI/REST.
- **Routine vault ops** → the [`sdk-scripts` CLI](references/vault-manager-cli.md) (one `<group>:<action>` command per operation). **Embedding in your own code** → the [v2 SDK](references/vault-manager-sdk.md) directly.
- **Adaptor vs CPI** — an **adaptor** is a program the *vault calls into* to deploy funds to a protocol (you expose `initialize`/`deposit`/`withdraw`). **CPI** is *your* program *calling into the vault* to deposit/withdraw LP. Different directions; don't conflate them.

## Hard rules (verify against the references; do not guess)

- **SDK is v2**: `@voltr/vault-sdk` + `@solana/kit` — compositional `get*InstructionAsync` builders, `find*Pda` helpers, `fetch*` loaders, `get*ForVault` extension helpers. The old `VoltrClient` (v1) API is gone. Amounts are `bigint`, not BN.
- **`maxCap: 0n` means ZERO capacity**, not unlimited. Uncapped = `18_446_744_073_709_551_615n` (u64 max).
- **One vault = one asset.** Separate vaults for separate assets.
- **Role separation**: keep **admin** (structure/config) and **manager** (fund allocation) as separate keypairs (prod: a multisig such as Squads). The UI cannot initialize strategies or allocate funds — CLI/SDK only.
- **Never execute blind**: preview with `--mode print`, confirm with `--mode simulate`, then `--mode execute`.
- **Adaptor `deposit`/`withdraw` MUST return the accurate `u64` position value** (underlying-asset units); the vault reads it via `get_return_data` for accounting. Reload accounts after every CPI before computing it.
- **CPI discriminators**: use the values in [cpi-integration.md](references/cpi-integration.md) / [examples/cpi/](examples/cpi/) — the upstream `voltr-vault-cpi/README.md` has stale/wrong ones. CPI callers pass the vault's internal PDA *addresses* but **never** their signer seeds (the vault `invoke_signed`s them itself).

## Authoritative sources

- Docs: https://docs.voltr.xyz · SDK reference & API overview within. REST API base `https://api.voltr.xyz` (Swagger at `/docs`).
- Repos: `@voltr/vault-sdk`, `github.com/voltrxyz/sdk-scripts` (CLI + programmatic examples), `github.com/voltrxyz/vault-cpi` (CPI reference snippets).
- Deployed program addresses and PDA seeds: [references/architecture.md](references/architecture.md).
