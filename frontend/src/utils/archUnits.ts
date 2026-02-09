/**
 * ARCH unit conversions.
 *
 * Arch RPC surfaces balances in **lamports** (smallest unit).
 *
 * IMPORTANT: The correct denomination is:
 *   1 ARCH = 1,000,000,000 lamports
 *
 * A common bug is assuming 1e8 (which would display balances 10× too large).
 */
export const LAMPORTS_PER_ARCH = 1_000_000_000;

export function lamportsToArch(lamports: number): number {
  return lamports / LAMPORTS_PER_ARCH;
}

export function formatArchFromLamports(
  lamports: number,
  options: Intl.NumberFormatOptions = { minimumFractionDigits: 2, maximumFractionDigits: 8 }
): string {
  return lamportsToArch(lamports).toLocaleString(undefined, options);
}
