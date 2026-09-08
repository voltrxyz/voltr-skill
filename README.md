# Voltr Dev Skill

An [Agent Skill](https://docs.claude.com/en/docs/agents-and-tools/agent-skills) that turns your coding agent into a Voltr expert. **Voltr** is the permissionless vault framework for structured yield strategies on Solana. This skill activates automatically when you ask for help with Voltr vaults, adaptors, CPI, or the `@voltr/vault-sdk` — covering all four audiences: **vault managers**, **depositors / app developers**, **yield protocols building adaptors**, and **composing protocols integrating via CPI**.

## Quick Install

Using the [`skills`](https://github.com/vercel-labs/skills) CLI (the open agent-skills installer):

```bash
npx skills add https://github.com/voltrxyz/voltr-skill
```

Target specific agents or install globally, e.g. `npx skills add https://github.com/voltrxyz/voltr-skill -a claude-code -g`. Prefer a self-contained install with no third-party CLI? Use the manual path below.

## Manual Install

```bash
git clone https://github.com/voltrxyz/voltr-skill
cd voltr-skill
./install.sh
```

With no flags, `./install.sh` installs a per-user folder skill to `~/.claude/skills/voltr`.

### Installation flags

Per-user folder skills:

```bash
./install.sh --claude     # ~/.claude/skills/voltr  (default)
./install.sh --codex      # ${CODEX_HOME:-~/.codex}/skills/voltr
```

Project-scoped single-file rules (flattened into the current repo):

```bash
./install.sh --cursor     # .cursor/rules/voltr.mdc
./install.sh --windsurf   # .windsurf/rules/voltr.md
./install.sh --cline      # .clinerules/voltr.md
./install.sh --continue   # .continue/rules/voltr.md
./install.sh --agents-md  # AGENTS.md (appended)
```

Modifiers:

```bash
./install.sh --all                    # --claude and --codex
./install.sh --project                # put --claude/--codex under ./.claude or ./.codex
./install.sh --path /custom/dir/voltr # copy the full skill folder anywhere
```

To update an installed copy: `git -C ~/.claude/skills/voltr pull`.

## How it activates

- **Automatically** when your request matches Voltr topics (vaults, adaptors, CPI, `@voltr/vault-sdk`, `sdk-scripts`, the vault program `vVoLTRjQmtFpiYoegx285Ze4gsLJ8ZxgFKVcuvmG1a8`, deposit/withdraw, LP tokens, high water mark, …).
- **Explicitly** in Claude Code with `/voltr`.

The agent loads the lightweight [SKILL.md](skills/voltr/SKILL.md) router first, then pulls in only the reference and examples it needs for your task (progressive disclosure).

## Try it — example prompts

**Vault managers**
- "Create a Voltr USDC vault with a 10% performance fee and a 1-day withdrawal period."
- "Allocate 50k USDC from my vault's idle balance into the Kamino strategy, simulate first."
- "Write a script that reads my vault's asset-per-LP, accrued fees, and per-strategy positions."

**Depositors / app developers**
- "Add a deposit + two-step withdraw flow to my frontend using `@voltr/vault-sdk`."
- "Fetch an unsigned deposit transaction from the Voltr REST API and sign it client-side."
- "Explain instant withdraw vs request/withdraw and when each is allowed."

**Yield protocols (adaptors)**
- "Scaffold a custom Voltr adaptor that bridges my lending protocol to a vault."
- "Why does my adaptor's `deposit` return the wrong position value? Here's the code."

**Composing protocols (CPI)**
- "Add a CPI wrapper to my Anchor program that deposits into a Voltr vault on behalf of a user."
- "What accounts and discriminator does `request_withdraw_vault` need for a CPI?"

## What's inside

The skill itself lives in [`skills/voltr/`](skills/voltr/) (standard agent-skills layout):

- **[SKILL.md](skills/voltr/SKILL.md)** — entry point: orientation, track picker, and the hard rules.
- **[references/](skills/voltr/references/)** — dense, agent-facing technical references:
  - [architecture.md](skills/voltr/references/architecture.md) — shared mental model: programs, fund flow, roles, accounting (LP / asset-per-LP / locked profit / HWM / fees), PDAs, deployed addresses, instruction & error lists. **Read first.**
  - [vault-manager-cli.md](skills/voltr/references/vault-manager-cli.md) — the `sdk-scripts` operator CLI (profiles, roles, transaction modes, every command group).
  - [vault-manager-sdk.md](skills/voltr/references/vault-manager-sdk.md) — the `@voltr/vault-sdk` v2 surface (`@solana/kit`).
  - [depositor-and-api.md](skills/voltr/references/depositor-and-api.md) — deposit/withdraw via SDK + the public REST API.
  - [adaptor-creation.md](skills/voltr/references/adaptor-creation.md) — build a custom on-chain adaptor (3-instruction interface, account order, position value, security).
  - [cpi-integration.md](skills/voltr/references/cpi-integration.md) — CPI into the vault program (5 instructions, verified discriminators, accounts, PDAs).
- **[examples/](skills/voltr/examples/)** — runnable, commented code:
  - [examples/sdk/](skills/voltr/examples/sdk/) — TypeScript: create vault, add adaptor + init strategy, allocate, read state.
  - [examples/depositor/](skills/voltr/examples/depositor/) — TypeScript: deposit, request/withdraw, instant withdraw, REST flow.
  - [examples/adaptor/](skills/voltr/examples/adaptor/) — a complete minimal Anchor adaptor program.
  - [examples/cpi/](skills/voltr/examples/cpi/) — drop-in Rust CPI wrapper structs for all five vault instructions.

## Scope & accuracy

Grounded in the official Voltr docs and the on-chain programs. The TypeScript surface targets **v2** (`@voltr/vault-sdk` + `@solana/kit`); the legacy `VoltrClient` (v1) API is out of scope except as a migration source. The skill bakes in the easy-to-get-wrong rules — `maxCap: 0n` means *zero* capacity (use `u64::MAX` for uncapped), admin/manager key separation, the correct CPI discriminators (the upstream `vault-cpi` README has stale ones), and "never execute blind" (preview → simulate → execute). Always verify program addresses and discriminators against [architecture.md](skills/voltr/references/architecture.md) and [cpi-integration.md](skills/voltr/references/cpi-integration.md).

## Links

- Docs: https://docs.voltr.xyz · App: https://voltr.xyz · REST API: https://api.voltr.xyz (Swagger at `/docs`)
- Repos: [`@voltr/vault-sdk`](https://github.com/voltrxyz/vault-sdk) · [`sdk-scripts`](https://github.com/voltrxyz/sdk-scripts) · [`vault-cpi`](https://github.com/voltrxyz/vault-cpi)

## Neutral bundles

The [Neutral reference](skills/voltr/references/neutral-bundles.md) covers permissioned registration,
deposits, status queries and separate request/claim operations. Try: "Allocate USDC to a Neutral bundle,
then show how to request and claim a redemption after keeper settlement."
