/**
 * rest-api-deposit.ts — deposit via the public Voltr REST API.
 *
 * The API BUILDS and returns an unsigned, base58-serialized versioned
 * transaction (private keys never touch the backend). The client:
 *   1. POST /vault/{pubkey}/deposit  ->  { success, transaction: "<base58>" }
 *   2. base58-decode -> decode to a Transaction
 *   3. sign with the user's @solana/kit signer
 *   4. broadcast via RPC
 *
 * The same pattern applies to /request-withdrawal, /withdraw,
 * /cancel-withdrawal, and /direct-withdraw — only the path and body change.
 *
 * Run: npx tsx rest-api-deposit.ts
 * Env: RPC_URL, USER_KEYPAIR.
 */
import {
  getBase58Encoder,
  getTransactionDecoder,
  signTransaction,
  getSignatureFromTransaction,
  sendAndConfirmTransactionFactory,
} from "@solana/kit";
import { getRpc, loadUser } from "./_shared.js";

const API_BASE = "https://api.voltr.xyz";

// --- edit for your run (PLACEHOLDERS) ---
const VAULT = "VAULT_ADDRESS" as const;
const LAMPORT_AMOUNT = "1000000"; // raw asset units as a STRING (USDC: "1000000" = 1 USDC)
// ----------------------------------------

async function main() {
  const { rpc, rpcSubscriptions } = getRpc();
  const user = await loadUser();

  // 1. ask the API to build the (unsigned) deposit transaction
  const res = await fetch(`${API_BASE}/vault/${VAULT}/deposit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      userPubkey: user.address,
      lamportAmount: LAMPORT_AMOUNT,
      // assetMint / assetTokenProgram are optional (default to the vault asset)
    }),
  });
  const json = (await res.json()) as { success: boolean; transaction?: string; error?: string };
  if (!json.success || !json.transaction) {
    throw new Error(`API error: ${json.error ?? res.statusText}`);
  }

  // 2. base58 -> bytes -> Transaction (signature slots are zero-filled)
  const wireBytes = new Uint8Array(getBase58Encoder().encode(json.transaction));
  const unsignedTx = getTransactionDecoder().decode(wireBytes);

  // 3. sign with the user's keypair
  const signedTx = await signTransaction([user.keyPair], unsignedTx);

  // 4. broadcast and confirm
  const signature = getSignatureFromTransaction(signedTx);
  const send = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
  await send(signedTx, { commitment: "confirmed" });

  console.log(`Deposited via REST API into ${VAULT}. Signature: ${signature}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
