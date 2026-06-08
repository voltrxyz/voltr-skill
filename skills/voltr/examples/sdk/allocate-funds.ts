/**
 * allocate-funds.ts — manager allocation: move idle assets INTO a strategy
 * (deposit_strategy) and pull them back OUT (withdraw_strategy), with
 * @voltr/vault-sdk + @solana/kit.
 *
 * deposit_strategy: vault CPIs the adaptor, which CPIs the target protocol; the adaptor
 * returns the new u64 position value. withdraw_strategy reverses it (pass a large amount
 * to withdraw all). Both are signed by the MANAGER and carry the adaptor's discriminator
 * plus protocol-specific remaining accounts (derived by the adapter packages for
 * Kamino/Spot/Trustful — illustrative placeholder here).
 *
 * Placeholders: see ./README.md.
 */
import {
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  type AccountMeta,
  type Address,
} from "@solana/kit";
import {
  findVaultStrategyAuthPda,
  getDepositStrategyInstructionAsync,
  getWithdrawStrategyInstructionAsync,
} from "@voltr/vault-sdk";

// --- edit for your run ---
const VAULT = "VAULT_ADDRESS" as Address;
const STRATEGY = "STRATEGY_ADDRESS" as Address; // protocol address used as the Voltr strategy id
const ASSET_MINT = "ASSET_MINT_ADDRESS" as Address;
const ASSET_TOKEN_PROGRAM = "TOKEN_PROGRAM_ADDRESS" as Address;
const ADAPTOR_PROGRAM = "to6Eti9CsC5FGkAtqiPphvKD2hiQiLsS8zWiDBqBPKR" as Address;
const DEPOSIT_AMOUNT = 1_000_000n; // raw asset units to allocate into the strategy
const WITHDRAW_AMOUNT = 1_000_000n; // raw asset units to pull back (large = all)
// The adaptor's deposit / withdraw instruction discriminators (8 bytes each).
const DEPOSIT_DISCRIMINATOR = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]);
const WITHDRAW_DISCRIMINATOR = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]);
// -------------------------

async function main() {
  const rpc = createSolanaRpc(process.env.HELIUS_RPC_URL!);
  void rpc; // a real adapter builder reads chain state here to derive remaining accounts

  const manager = await createKeyPairSignerFromBytes(
    Uint8Array.from(JSON.parse(process.env.MANAGER_SECRET_KEY_JSON!))
  );

  const [vaultStrategyAuth] = await findVaultStrategyAuthPda({
    vault: VAULT,
    strategy: STRATEGY,
  });
  void vaultStrategyAuth;

  // Protocol-specific accounts in the adaptor's exact CPI order. PLACEHOLDER.
  const depositRemaining: AccountMeta[] = [];
  const withdrawRemaining: AccountMeta[] = [];

  // --- deposit idle -> strategy ---
  const depositIx = await getDepositStrategyInstructionAsync({
    manager,
    vault: VAULT,
    strategy: STRATEGY,
    vaultAssetMint: ASSET_MINT,
    assetTokenProgram: ASSET_TOKEN_PROGRAM,
    adaptorProgram: ADAPTOR_PROGRAM,
    amount: DEPOSIT_AMOUNT,
    instructionDiscriminator: DEPOSIT_DISCRIMINATOR,
    additionalArgs: null,
  });
  const depositTxIx = {
    ...depositIx,
    accounts: [...(depositIx.accounts ?? []), ...depositRemaining],
  };

  // --- withdraw strategy -> idle ---
  const withdrawIx = await getWithdrawStrategyInstructionAsync({
    manager,
    vault: VAULT,
    strategy: STRATEGY,
    vaultAssetMint: ASSET_MINT,
    assetTokenProgram: ASSET_TOKEN_PROGRAM,
    adaptorProgram: ADAPTOR_PROGRAM,
    amount: WITHDRAW_AMOUNT,
    instructionDiscriminator: WITHDRAW_DISCRIMINATOR,
    additionalArgs: null,
  });
  const withdrawTxIx = {
    ...withdrawIx,
    accounts: [...(withdrawIx.accounts ?? []), ...withdrawRemaining],
  };

  console.log("deposit_strategy accounts:", depositTxIx.accounts.length);
  console.log("withdraw_strategy accounts:", withdrawTxIx.accounts.length);
  // Submit each as its own manager-signed transaction (one builder = one operation).
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
