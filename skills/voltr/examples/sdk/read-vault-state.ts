/**
 * read-vault-state.ts — read a Voltr vault's state: total value, per-strategy
 * positions, asset-per-LP, high water mark, accrued fees, and a user's withdrawable
 * amount. Read-only — no keypair, no transaction. @voltr/vault-sdk + @solana/kit.
 *
 * Placeholders: HELIUS_RPC_URL, VAULT_ADDRESS, USER_ADDRESS. See ./README.md.
 */
import {
  createSolanaRpc,
  type Address,
} from "@solana/kit";
import {
  fetchMaybeToken,
  fetchMint,
  findAssociatedTokenPda,
  TOKEN_PROGRAM_ADDRESS,
} from "@solana-program/token";
import {
  calculateAssetsForWithdraw,
  fetchVault,
  findVaultLpMintPda,
  getAccumulatedAdminFeesForVault,
  getAccumulatedManagerFeesForVault,
  getCurrentAssetPerLpForVault,
  getHighWaterMarkForVault,
  getPositionAndTotalValuesForVault,
  getVaultLpSupplyBreakdown,
} from "@voltr/vault-sdk";

// --- edit for your run ---
const VAULT = "VAULT_ADDRESS" as Address;
const USER = "USER_ADDRESS" as Address; // address to read a position for
// -------------------------

async function main() {
  const rpc = createSolanaRpc(process.env.HELIUS_RPC_URL!);

  // Vault account + total asset value (idle + all strategies).
  const vault = await fetchVault(rpc, VAULT);
  const totalValue = vault.data.asset.totalValue; // bigint, asset base units

  // Per-strategy position breakdown.
  const positions = await getPositionAndTotalValuesForVault(rpc, VAULT);

  // NAV-per-share economics.
  const assetPerLp = await getCurrentAssetPerLpForVault(rpc, VAULT);
  const hwm = await getHighWaterMarkForVault(rpc, VAULT);
  const lpBreakdown = await getVaultLpSupplyBreakdown(rpc, VAULT);

  // Accrued (unharvested) fees per bucket.
  const managerFees = await getAccumulatedManagerFeesForVault(rpc, VAULT);
  const adminFees = await getAccumulatedAdminFeesForVault(rpc, VAULT);

  // A user's withdrawable amount (authoritative — after redemption fee + locked-profit).
  const [vaultLpMint] = await findVaultLpMintPda({ vault: VAULT });
  const [userLpAta] = await findAssociatedTokenPda({
    owner: USER,
    mint: vaultLpMint,
    tokenProgram: TOKEN_PROGRAM_ADDRESS,
  });
  const userLpAccount = await fetchMaybeToken(rpc, userLpAta);
  const userLpAmount = userLpAccount.exists ? userLpAccount.data.amount : 0n;
  const lpMint = await fetchMint(rpc, vaultLpMint);
  const totalLpSupply = lpMint.data.supply;
  const userWithdrawable = await calculateAssetsForWithdraw(
    rpc,
    VAULT,
    userLpAmount
  );

  const out = {
    vault: VAULT,
    totalValue: totalValue.toString(),
    assetPerLp: assetPerLp.toString(),
    highWaterMark: hwm.toString(),
    totalLpSupply: totalLpSupply.toString(),
    lpSupplyBreakdown: JSON.parse(
      JSON.stringify(lpBreakdown, (_k, v) =>
        typeof v === "bigint" ? v.toString() : v
      )
    ),
    accruedFees: {
      manager: managerFees.toString(),
      admin: adminFees.toString(),
    },
    strategies: positions.strategies.map((s) => ({
      strategyId: s.strategyId,
      amount: s.amount.toString(),
    })),
    user: {
      address: USER,
      lpAmount: userLpAmount.toString(),
      withdrawableAfterFees: userWithdrawable.toString(),
    },
  };

  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
