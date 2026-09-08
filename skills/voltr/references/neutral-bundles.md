# Neutral bundle operations

Use the `neutral:bundle:*` commands in `voltrxyz/sdk-scripts` (local checkout commonly named
`voltr-integration-scripts`). For flags and runnable examples, consult that checkout's
`docs/neutral.md`, `--help` and `examples/src/neutral`.

Mainnet adaptor: `WpFotU6LNA9Rdk9rm1ZYNcaPCRXHZGRLVwxHXqcaRJG`.
Neutral program: `BUNDDh4P5XviMm1f3gCvnq2qKx6TGosAGnoUK12e7cXU`.
This is the Neutral bundle integration; a Neutral-managed Kamino vault uses the Kamino integration.

## Prepare

1. Set the profile's vault address, bundle asset mint, Classic Token Program and
   `integrations.neutral.bundleAddress`. The bundle address is the strategy address.
2. Run `neutral:bundle:query:status`. It requires RPC and a profile, but no signer.
   Confirm the asset and inspect permissioned status and receipt version.
3. Have the vault admin run `vault:add-adaptor --adaptor-program WpFotU6LNA9Rdk9rm1ZYNcaPCRXHZGRLVwxHXqcaRJG`.
   The deployed vault whitelist accepts this ID with `allow_any_adaptor = 0`.
4. If permissioned and unregistered, the Neutral bundle manager runs
   `neutral:bundle:register-depositor --manager-keypair <BUNDLE_MANAGER_KEYPAIR>`.
   The key must match the bundle's manager, which may differ from the vault manager.
5. The vault manager runs `neutral:bundle:init`. It creates the strategy asset ATA and
   initializes the Neutral depositor. Completion: status shows registered depositor and a version-2 receipt.

The Neutral depositor is the vault strategy authority. Its user bundle account is derived from
`["USER_BUNDLE", vault_strategy_auth, bundle]` under the Neutral program.
All strategy operations require receipt version 2; arrange legacy migration before any settlement.
The tools deliberately reject legacy receipts rather than guessing an accounting baseline.

## Allocate and redeem

- `neutral:bundle:deposit --amount <ASSET_MINOR_UNITS>` requests a positive deposit.
  Completion: transaction confirmed; pending deposit is visible until Neutral's keeper issues shares.
- `neutral:bundle:refresh` invokes a zero deposit to refresh vault accounting.
- `neutral:bundle:request-withdraw --amount <GROSS_ASSET_MINOR_UNITS>` or `--all` requests redemption.
  The options are mutually exclusive. Amounts are before withdrawal fees; `--all` uses u64 max.
  Pending deposit, withdrawal and switch restrictions must clear before a new request.
- Query status while waiting for the keeper. A passed cooldown timestamp is eligibility, not settlement.
  Completion: inspect `pendingShares` and the positive `strategyAtaAmount`; the ATA balance may also contain refunds.
- `neutral:bundle:claim` sweeps the entire available strategy ATA balance into vault idle.
  It has no amount flag. Completion: confirmed claim and a subsequent status query showing the resulting balance.
  If another keeper payment arrives, claim again as authorized.

Keep the request and claim as separate operations with a keeper settlement between them. Neutral shares
are not instant liquidity. The tooling does not implement a user direct-withdraw route or operate the keeper.

Use the shared print, simulate, execute and multisig modes. For multisig, the address is the authority
for that command; permissioned registration needs the Neutral manager's authority. Simulation changes no
onchain state, so execute and confirm prerequisites before simulating dependent operations.

## Interpret status

`pendingDeposit`, `pendingShares` and `estimatedPendingWithdrawalValue` describe Neutral requests.
`strategyAtaAmount` is current available tokens, while `lastAccountedStrategyAtaAmount` is the vault's cached
balance. `storedPositionValue` is the saved position at `lastAccountingTimestamp`, not a live NAV estimate.
Token amounts and timestamps in JSON are decimal strings. Reads are confirmed and may span slots.

The adaptor returns shares net of accrued management/performance fees plus pending deposits, excluding the
strategy ATA. The vault accounts for the ATA separately. Both refresh-then-claim and claim-first book the
actual withdrawal fee. Do not add ATA tokens to the returned position value.

For programmatic usage, import the public builders from `@voltr/scripts-neutral` in the sdk-scripts workspace
and pass the returned `BuiltOperation` to the shared processor. See the runnable examples there rather than
copying account lists or private package paths into another script.
