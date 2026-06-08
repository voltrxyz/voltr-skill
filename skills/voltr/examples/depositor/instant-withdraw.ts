/**
 * instant-withdraw.ts — redeem LP for assets in a SINGLE transaction.
 *
 * No request/claim cycle. Works ONLY when the vault's withdrawal_waiting_period
 * == 0; otherwise the program reverts with InstantWithdrawNotAllowed (use the
 * two-step request-withdraw.ts + withdraw.ts path instead).
 *
 * Single transaction:
 *   1. create the user's asset ATA (idempotent)
 *   2. getInstantWithdrawVaultInstructionAsync
 *
 * Uses @voltr/vault-sdk v2 + @solana/kit. Grounded in voltr-integration-scripts
 * vault/instant-withdraw.ts. (The REST API exposes this as POST
 * /vault/{pubkey}/direct-withdraw.)
 *
 * Run: npx tsx instant-withdraw.ts
 * Env: RPC_URL, USER_KEYPAIR.
 */
import {
  getCreateAssociatedTokenIdempotentInstructionAsync,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import {
  getInstantWithdrawVaultInstructionAsync,
} from "@voltr/vault-sdk";
import { buildSignSend, getRpc, loadUser } from "./_shared.js";

// --- edit for your run (PLACEHOLDERS) ---
const VAULT = "VAULT_ADDRESS" as const;
const ASSET_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" as const; // USDC mint
const ASSET_TOKEN_PROGRAM = TOKEN_PROGRAM_ADDRESS;
const AMOUNT = 1_000_000n; // raw amount (LP units when IS_AMOUNT_IN_LP is true)
const IS_AMOUNT_IN_LP = false; // false = AMOUNT is underlying asset units; true = LP units
const IS_WITHDRAW_ALL = false; // true = withdraw the entire LP balance (AMOUNT ignored)
// ----------------------------------------

async function main() {
  const { rpc, rpcSubscriptions } = getRpc();
  const user = await loadUser();

  // 1. ensure the user has an ATA for the asset being withdrawn
  const createAssetAtaIx =
    await getCreateAssociatedTokenIdempotentInstructionAsync({
      payer: user,
      owner: user.address,
      mint: ASSET_MINT,
      tokenProgram: ASSET_TOKEN_PROGRAM,
    });

  // 2. instant redeem: burn LP, receive asset in one tx (waiting period must be 0)
  const instantWithdrawIx = await getInstantWithdrawVaultInstructionAsync({
    userTransferAuthority: user,
    vault: VAULT,
    vaultAssetMint: ASSET_MINT,
    assetTokenProgram: ASSET_TOKEN_PROGRAM,
    amount: AMOUNT,
    isAmountInLp: IS_AMOUNT_IN_LP,
    isWithdrawAll: IS_WITHDRAW_ALL,
  });

  const sig = await buildSignSend(rpc, rpcSubscriptions, user, [
    createAssetAtaIx,
    instantWithdrawIx,
  ]);
  console.log(`Instant-withdrew from ${VAULT}. Signature: ${sig}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
