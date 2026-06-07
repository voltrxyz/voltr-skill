/**
 * deposit.ts — deposit the vault's underlying asset and receive LP tokens.
 *
 * Single transaction:
 *   1. create the user's LP ATA (idempotent)
 *   2. getDepositVaultInstructionAsync (deducts issuance fee, mints LP)
 *
 * Uses @voltr/vault-sdk v2 + @solana/kit. Grounded in voltr-api's
 * buildDepositTransaction and voltr-integration-scripts vault/deposit.ts.
 *
 * Run: npx tsx deposit.ts
 * Env: RPC_URL, USER_KEYPAIR (path to a Solana keypair JSON).
 */
import {
  getCreateAssociatedTokenIdempotentInstructionAsync,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import {
  findVaultLpMintPda,
  getDepositVaultInstructionAsync,
} from "@voltr/vault-sdk";
import { buildSignSend, getRpc, loadUser } from "./_shared.js";

// --- edit for your run (PLACEHOLDERS) ---
const VAULT = "VAULT_ADDRESS" as const; // the Voltr vault pubkey
const ASSET_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" as const; // USDC mint
const ASSET_TOKEN_PROGRAM = TOKEN_PROGRAM_ADDRESS; // use the Token-2022 program addr for Token-2022 assets
const AMOUNT = 1_000_000n; // raw asset units (USDC: 1_000_000 = 1 USDC)
// ----------------------------------------

async function main() {
  const { rpc, rpcSubscriptions } = getRpc();
  const user = await loadUser();

  const [vaultLpMint] = await findVaultLpMintPda({ vault: VAULT });

  // 1. ensure the user has an ATA for the vault LP mint
  const createLpAtaIx = await getCreateAssociatedTokenIdempotentInstructionAsync({
    payer: user,
    owner: user.address,
    mint: vaultLpMint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });

  // 2. deposit: asset -> LP (issuance fee deducted, then LP minted)
  const depositIx = await getDepositVaultInstructionAsync({
    userTransferAuthority: user,
    vault: VAULT,
    vaultAssetMint: ASSET_MINT,
    assetTokenProgram: ASSET_TOKEN_PROGRAM,
    amount: AMOUNT,
  });

  // Tip: preview LP minted with GET /vault/{VAULT}/simulate-deposit?amount=AMOUNT
  const sig = await buildSignSend(rpc, rpcSubscriptions, user, [
    createLpAtaIx,
    depositIx,
  ]);
  console.log(`Deposited ${AMOUNT} asset units into ${VAULT}. Signature: ${sig}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
