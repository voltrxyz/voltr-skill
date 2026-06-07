/**
 * request-withdraw.ts — step 1 of the two-step withdrawal.
 *
 * Escrows the user's LP into the request-withdraw receipt PDA and starts the
 * vault's withdrawal_waiting_period. Claim later with withdraw.ts once
 * `now >= withdrawableFromTs`. Only ONE active request per user per vault.
 *
 * Single transaction:
 *   1. create the receipt PDA's LP ATA (idempotent)
 *   2. getRequestWithdrawVaultInstructionAsync
 *
 * Uses @voltr/vault-sdk v2 + @solana/kit. Grounded in voltr-api's
 * buildRequestWithdrawalTransaction and voltr-integration-scripts vault/request-withdraw.ts.
 *
 * Run: npx tsx request-withdraw.ts
 * Env: RPC_URL, USER_KEYPAIR.
 */
import {
  getCreateAssociatedTokenIdempotentInstructionAsync,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import {
  findRequestWithdrawVaultReceiptPda,
  findVaultLpMintPda,
  getRequestWithdrawVaultInstructionAsync,
} from "@voltr/vault-sdk";
import { buildSignSend, getRpc, loadUser } from "./_shared.js";

// --- edit for your run (PLACEHOLDERS) ---
const VAULT = "VAULT_ADDRESS" as const;
const AMOUNT = 1_000_000n; // raw amount to request (LP units when IS_AMOUNT_IN_LP is true)
const IS_AMOUNT_IN_LP = false; // false = AMOUNT is underlying asset units; true = LP units
const IS_WITHDRAW_ALL = false; // true = request the entire LP balance (AMOUNT ignored)
// ----------------------------------------

async function main() {
  const { rpc, rpcSubscriptions } = getRpc();
  const user = await loadUser();

  const [vaultLpMint] = await findVaultLpMintPda({ vault: VAULT });
  const [requestWithdrawVaultReceipt] = await findRequestWithdrawVaultReceiptPda({
    vault: VAULT,
    userTransferAuthority: user.address,
  });

  // 1. the receipt PDA needs an LP ATA to hold the escrowed LP tokens
  const createReceiptLpAtaIx =
    await getCreateAssociatedTokenIdempotentInstructionAsync({
      payer: user,
      owner: requestWithdrawVaultReceipt,
      mint: vaultLpMint,
      tokenProgram: TOKEN_PROGRAM_ADDRESS,
    });

  // 2. open the withdrawal request (escrows LP, records withdrawableFromTs)
  const requestIx = await getRequestWithdrawVaultInstructionAsync({
    payer: user,
    userTransferAuthority: user,
    vault: VAULT,
    amount: AMOUNT,
    isAmountInLp: IS_AMOUNT_IN_LP,
    isWithdrawAll: IS_WITHDRAW_ALL,
  });

  const sig = await buildSignSend(rpc, rpcSubscriptions, user, [
    createReceiptLpAtaIx,
    requestIx,
  ]);
  console.log(`Requested withdrawal from ${VAULT}. Signature: ${sig}`);
  console.log("Claim it with withdraw.ts after the waiting period elapses.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
