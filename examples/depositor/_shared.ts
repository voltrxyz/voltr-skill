/**
 * _shared.ts — tiny helpers shared by the depositor examples.
 *
 * Loads a @solana/kit signer from a keypair JSON and builds/signs/sends a
 * v0 versioned transaction. Mirrors the @solana/kit flow used by the basic-ui
 * template and voltr-integration-scripts.
 */
import {
  appendTransactionMessageInstructions,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  createTransactionMessage,
  getSignatureFromTransaction,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type IInstruction,
  type KeyPairSigner,
} from "@solana/kit";
import { readFileSync } from "node:fs";

export const RPC_URL = process.env.RPC_URL ?? "https://api.mainnet-beta.solana.com";
export const RPC_WS_URL = RPC_URL.replace(/^http/, "ws");

export function getRpc() {
  return {
    rpc: createSolanaRpc(RPC_URL),
    rpcSubscriptions: createSolanaRpcSubscriptions(RPC_WS_URL),
  };
}

export async function loadUser(): Promise<KeyPairSigner> {
  const path = process.env.USER_KEYPAIR;
  if (!path) throw new Error("Set USER_KEYPAIR to a keypair JSON path.");
  return createKeyPairSignerFromBytes(
    Uint8Array.from(JSON.parse(readFileSync(path, "utf8")))
  );
}

export async function buildSignSend(
  rpc: ReturnType<typeof createSolanaRpc>,
  rpcSubscriptions: ReturnType<typeof createSolanaRpcSubscriptions>,
  feePayer: KeyPairSigner,
  instructions: IInstruction[]
): Promise<string> {
  const { value: latestBlockhash } = await rpc.getLatestBlockhash().send();
  const message = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayerSigner(feePayer, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstructions(instructions, m)
  );
  const signed = await signTransactionMessageWithSigners(message);
  const signature = getSignatureFromTransaction(signed);
  const send = sendAndConfirmTransactionFactory({ rpc, rpcSubscriptions });
  await send(signed, { commitment: "confirmed" });
  return signature;
}
