/**
 * add-adaptor-and-init-strategy.ts — register an adaptor (admin) and initialize a
 * strategy (manager) with @voltr/vault-sdk + @solana/kit.
 *
 * add_adaptor is a one-time admin step per adaptor program. initialize_strategy is a
 * manager step that binds a `strategy` (a protocol address) to the adaptor, with the
 * adaptor's 8-byte instruction discriminator and protocol-specific REMAINING ACCOUNTS.
 *
 * The Voltr side is stable; the discriminator + remaining accounts are protocol-specific.
 * For Kamino/Spot/Trustful use the adapter packages (@voltr/scripts-kamino, -spot,
 * -trustful) which derive both for you. This file shows the raw SDK shape for a custom
 * adaptor — the remaining accounts here are an illustrative placeholder.
 *
 * Placeholders: see ./README.md.
 */
import {
  AccountRole,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  type AccountMeta,
  type Address,
} from "@solana/kit";
import {
  findVaultStrategyAuthPda,
  getAddAdaptorInstructionAsync,
  getInitializeStrategyInstructionAsync,
} from "@voltr/vault-sdk";

// --- edit for your run ---
const VAULT = "VAULT_ADDRESS" as Address;
const ADAPTOR_PROGRAM = "to6Eti9CsC5FGkAtqiPphvKD2hiQiLsS8zWiDBqBPKR" as Address; // e.g. Kamino adaptor
const STRATEGY = "STRATEGY_ADDRESS" as Address; // protocol address used as the Voltr strategy id (e.g. a Kamino reserve)
// The adaptor's `initialize` instruction discriminator (8 bytes). Comes from the adaptor.
const INIT_DISCRIMINATOR = new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0]);
// -------------------------

async function main() {
  const rpc = createSolanaRpc(process.env.HELIUS_RPC_URL!);
  void rpc; // a real adapter builder reads chain state here to derive remaining accounts

  const admin = await createKeyPairSignerFromBytes(
    Uint8Array.from(JSON.parse(process.env.ADMIN_SECRET_KEY_JSON!))
  );
  const manager = await createKeyPairSignerFromBytes(
    Uint8Array.from(JSON.parse(process.env.MANAGER_SECRET_KEY_JSON!))
  );

  // 1) Admin: register the adaptor on the vault (one-time per adaptor program).
  const addAdaptorIx = await getAddAdaptorInstructionAsync({
    payer: admin,
    admin,
    vault: VAULT,
    adaptorProgram: ADAPTOR_PROGRAM,
  });

  // 2) Manager: initialize the strategy. The vault signs the adaptor CPI with this PDA;
  //    protocol receipt / collateral ATAs are owned by it.
  const [vaultStrategyAuth] = await findVaultStrategyAuthPda({
    vault: VAULT,
    strategy: STRATEGY,
  });
  void vaultStrategyAuth;

  // Protocol-specific accounts the adaptor's CPI requires, in the adaptor's exact order.
  // PLACEHOLDER — a real adapter package builds this list (often after decoding on-chain state).
  const remainingAccounts: AccountMeta[] = [
    // { address: someProtocolAccount, role: AccountRole.WRITABLE },
    // { address: someConfig, role: AccountRole.READONLY },
  ];

  const initStrategyIx = await getInitializeStrategyInstructionAsync({
    payer: manager,
    manager,
    vault: VAULT,
    strategy: STRATEGY,
    adaptorProgram: ADAPTOR_PROGRAM,
    instructionDiscriminator: INIT_DISCRIMINATOR,
    additionalArgs: null, // extra serialized adaptor args, if any
  });

  // Append the remaining accounts onto the strategy instruction.
  const initStrategyIxWithAccounts = {
    ...initStrategyIx,
    accounts: [...(initStrategyIx.accounts ?? []), ...remainingAccounts],
  };

  console.log("add_adaptor accounts:", addAdaptorIx.accounts?.length);
  console.log(
    "initialize_strategy accounts:",
    initStrategyIxWithAccounts.accounts.length
  );
  // Submit: add-adaptor signed by admin, then initialize-strategy signed by manager
  // (separate transactions — different signers).
  void AccountRole;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
