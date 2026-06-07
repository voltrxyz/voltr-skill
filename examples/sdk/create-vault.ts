/**
 * create-vault.ts — initialize a new Voltr vault with @voltr/vault-sdk + @solana/kit.
 *
 * The admin signs and pays; the manager is just an address (it does NOT sign init).
 * A fresh keypair becomes the vault account and must co-sign initialization, so this
 * flow can never be a multisig payload — print/simulate/execute only.
 *
 * Placeholders: ADMIN_SECRET_KEY_JSON, HELIUS_RPC_URL, MANAGER_ADDRESS, ASSET_MINT,
 * ASSET_TOKEN_PROGRAM. See ./README.md. Run after wiring real values + a sender.
 */
import {
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  generateKeyPairSigner,
  pipe,
  setTransactionMessageFeePayerSigner,
  type Address,
} from "@solana/kit";
import { findAssociatedTokenPda } from "@solana-program/token";
import {
  findLpMetadataPda,
  findVaultAssetIdleAuthPda,
  getCreateLpMetadataInstructionAsync,
  getInitializeVaultInstructionAsync,
} from "@voltr/vault-sdk";

// --- edit for your run ---
const MANAGER = "MANAGER_ADDRESS" as Address; // strategy-allocation authority (separate keypair!)
const ASSET_MINT = "ASSET_MINT_ADDRESS" as Address;
const ASSET_TOKEN_PROGRAM = "TOKEN_PROGRAM_ADDRESS" as Address; // Token or Token-2022 program id
const VAULT_NAME = "My Voltr Vault";
const VAULT_DESCRIPTION = "Short vault strategy description";
// maxCap: 0n means ZERO capacity. Uncapped = u64 max.
const MAX_CAP = 18_446_744_073_709_551_615n;
const WITH_LP_METADATA = true; // also create Metaplex LP-token metadata in the same tx
const LP_METADATA = {
  name: "My Vault Token",
  symbol: "MYVLT",
  uri: "https://example.com/metadata.json",
};
// -------------------------

async function main() {
  const rpc = createSolanaRpc(process.env.HELIUS_RPC_URL!);

  const admin = await createKeyPairSignerFromBytes(
    Uint8Array.from(JSON.parse(process.env.ADMIN_SECRET_KEY_JSON!))
  );
  // The vault account is a fresh keypair the caller owns; it must sign init.
  const vault = await generateKeyPairSigner();

  // The idle assets live in the ATA owned by the vault's idle-auth PDA.
  const [vaultAssetIdleAuth] = await findVaultAssetIdleAuthPda({
    vault: vault.address,
  });
  const [vaultAssetIdleAta] = await findAssociatedTokenPda({
    owner: vaultAssetIdleAuth,
    mint: ASSET_MINT,
    tokenProgram: ASSET_TOKEN_PROGRAM,
  });

  const initializeVaultIx = await getInitializeVaultInstructionAsync({
    payer: admin,
    admin: admin.address,
    manager: MANAGER,
    vault,
    vaultAssetMint: ASSET_MINT,
    vaultAssetIdleAta,
    assetTokenProgram: ASSET_TOKEN_PROGRAM,
    maxCap: MAX_CAP,
    startAtTs: 0n, // unix ts deposits open at; 0 = immediately
    lockedProfitDegradationDuration: 86_400n, // seconds
    managerPerformanceFee: 1_000, // bps
    adminPerformanceFee: 500,
    managerManagementFee: 50,
    adminManagementFee: 25,
    redemptionFee: 10,
    issuanceFee: 10,
    withdrawalWaitingPeriod: 0n, // seconds
    name: VAULT_NAME,
    description: VAULT_DESCRIPTION,
  });

  const instructions = [initializeVaultIx];

  if (WITH_LP_METADATA) {
    const [metadataAccount] = await findLpMetadataPda({ vault: vault.address });
    instructions.push(
      await getCreateLpMetadataInstructionAsync({
        payer: admin,
        admin,
        vault: vault.address,
        metadataAccount,
        name: LP_METADATA.name,
        symbol: LP_METADATA.symbol,
        uri: LP_METADATA.uri,
      })
    );
  }

  // Assemble a kit transaction message. Add a recent blockhash + sign/send with your
  // sender of choice (sendAndConfirmTransactionFactory), signing with BOTH admin and vault.
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(admin, m),
    (m) => appendTransactionMessageInstructions(instructions, m)
  );

  console.log("Generated vault address:", vault.address);
  console.log("instructionCount:", instructions.length);
  console.log("blockhash:", latestBlockhash.blockhash);
  console.log(
    "Record the vault address in your profile/config after a successful send."
  );
  // void message — sign with [admin, vault] and submit when ready.
  void message;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
