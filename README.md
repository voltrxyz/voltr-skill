# Voltr Skill

An [Agent Skill](https://docs.claude.com/en/docs/agents-and-tools/agent-skills) for building on **Voltr** — the permissionless vault framework for structured yield strategies on Solana. It equips a coding agent to help across all four Voltr audiences: **vault managers**, **depositors / app developers**, **yield protocols building adaptors**, and **composing protocols integrating via CPI**.

## What's inside

- **[SKILL.md](SKILL.md)** — the entry point: orientation, a track picker, and the hard rules. An agent loads this first, then pulls in only the references it needs (progressive disclosure).
- **[references/](references/)** — dense, agent-facing technical references:
  - [architecture.md](references/architecture.md) — shared mental model: programs, fund flow, roles, accounting (LP / asset-per-LP / locked profit / HWM / fees), PDAs, deployed addresses, instruction & error lists. **Read first.**
  - [vault-manager-cli.md](references/vault-manager-cli.md) — the `sdk-scripts` operator CLI (profiles, roles, transaction modes, every command group).
  - [vault-manager-sdk.md](references/vault-manager-sdk.md) — the `@voltr/vault-sdk` v2 surface (`@solana/kit`).
  - [depositor-and-api.md](references/depositor-and-api.md) — deposit/withdraw flows via SDK + the public REST API.
  - [adaptor-creation.md](references/adaptor-creation.md) — build a custom on-chain adaptor (the three-instruction interface, account order, position value, security).
  - [cpi-integration.md](references/cpi-integration.md) — CPI into the vault program (5 instructions, verified discriminators, accounts, PDAs).
- **[examples/](examples/)** — runnable, commented code:
  - [examples/sdk/](examples/sdk/) — TypeScript: create vault, add adaptor + init strategy, allocate, read state.
  - [examples/depositor/](examples/depositor/) — TypeScript: deposit, request/withdraw, instant withdraw, REST flow.
  - [examples/adaptor/](examples/adaptor/) — a complete minimal Anchor adaptor program.
  - [examples/cpi/](examples/cpi/) — drop-in Rust CPI wrapper structs for all five vault instructions.

## Install

Copy or symlink this directory into your agent's skills location, e.g. for Claude Code:

```bash
# project-level
mkdir -p .claude/skills && cp -r voltr-skill .claude/skills/voltr
# or user-level
cp -r voltr-skill ~/.claude/skills/voltr
```

The agent activates the skill automatically when a task matches the `description` triggers in `SKILL.md` (Voltr vaults, adaptors, CPI, `@voltr/vault-sdk`, etc.).

## Scope & accuracy

Grounded in the official Voltr docs and the on-chain programs. The TypeScript surface targets **v2** (`@voltr/vault-sdk` + `@solana/kit`); the legacy `VoltrClient` (v1) API is out of scope except as a migration source. Always preview (`print` → `simulate`) before executing on mainnet, and verify program addresses and discriminators against [references/architecture.md](references/architecture.md) and [references/cpi-integration.md](references/cpi-integration.md).
