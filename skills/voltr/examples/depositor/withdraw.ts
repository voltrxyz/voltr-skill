/**
 * withdraw.ts — step 2 of the two-step withdrawal: claim the outstanding request.
 *
 * Run request-withdraw.ts first. This instruction takes NO amount params — it
 * claims exactly the requested LP and returns the underlying asset (minus the
 * redemption fee). Reverts with WithdrawalNotYetAvailable if the waiting period
 * has not elapsed; check readiness via getPendingWithdrawalForUser.
 *
 * Single transaction:
 *   1. create the user's asset ATA (idempotent)
 *   2. getWithdrawVaultInstructionAsync
 *
 * Uses @voltr/vault-sdk v2 + @solana/kit. Grounded in voltr-api's
 * buildWithdrawTransaction and voltr-integration-scripts vault/withdraw.ts.
 *
 * Run: npx tsx withdraw.ts
 * Env: RPC_URL, USER_KEYPAIR.
 */
import {
  getCreateAssociatedTokenIdempotentInstructionAsync,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import {
  getPendingWithdrawalForUser,
  getWithdrawVaultInstructionAsync,
} from "@voltr/vault-sdk";
import { buildSignSend, getRpc, loadUser } from "./_shared.js";

// --- edit for your run (PLACEHOLDERS) ---
const VAULT = "VAULT_ADDRESS" as const;
const ASSET_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" as const; // USDC mint
const ASSET_TOKEN_PROGRAM = TOKEN_PROGRAM_ADDRESS;
// ----------------------------------------

async function main() {
  const { rpc, rpcSubscriptions } = getRpc();
  const user = await loadUser();

  // optional readiness check before sending
  const pending = await getPendingWithdrawalForUser(rpc, VAULT, user.address);
  if (pending && Number(pending.withdrawableFromTs) > Math.floor(Date.now() / 1000)) {
    throw new Error(
      `Not yet claimable. withdrawableFromTs=${pending.withdrawableFromTs}`
    );
  }

  // 1. ensure the user has an ATA for the asset being withdrawn
  const createAssetAtaIx =
    await getCreateAssociatedTokenIdempotentInstructionAsync({
      payer: user,
      owner: user.address,
      mint: ASSET_MINT,
      tokenProgram: ASSET_TOKEN_PROGRAM,
    });

  // 2. claim the outstanding request (no amount — burns the escrowed LP)
  const withdrawIx = await getWithdrawVaultInstructionAsync({
    userTransferAuthority: user,
    vault: VAULT,
    vaultAssetMint: ASSET_MINT,
    assetTokenProgram: ASSET_TOKEN_PROGRAM,
  });

  const sig = await buildSignSend(rpc, rpcSubscriptions, user, [
    createAssetAtaIx,
    withdrawIx,
  ]);
  console.log(`Claimed withdrawal from ${VAULT}. Signature: ${sig}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
