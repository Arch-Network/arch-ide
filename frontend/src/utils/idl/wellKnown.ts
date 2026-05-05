/**
 * Registry of Arch programs that the form should auto-fill silently.
 *
 * The Anchor / arch-satellite-lang IDL emits an `address: "..."` constraint
 * on accounts that point at fixed programs (e.g. `system_program` for
 * `#[account(init, ...)]` patterns). When that field is present we always
 * trust the IDL — this registry only exists for two side cases:
 *
 *   1. Friendly labels in tooltips ("Arch System Program" beats `1111…1`).
 *   2. Detecting when a free-text input *happens* to be a known program,
 *      so we can render it as read-only / auto-recognized rather than
 *      treating it like a user-supplied address.
 *
 * Keep this list small. It's not a complete on-chain registry — that's
 * the explorer's job. We only add programs that show up in the
 * auto-generated client templates and IDL outputs.
 */

export interface WellKnownProgram {
  /** Canonical base58 pubkey of the program. */
  base58: string;
  /** Human-readable label for tooltips and pills. */
  label: string;
  /**
   * Whether the form should hide accounts whose `address` resolves to
   * this program. System-level programs are noise in the UI; user-facing
   * programs (like SPL Token's analog) stay visible so devs can sanity
   * check what they're calling into.
   */
  hideInForm: boolean;
}

/**
 * The Arch System Program is the all-zeros pubkey (32 zero bytes), same
 * convention as Solana. It serves as the default `program_id` for native
 * accounts and is implicit in `init`-style account constraints.
 */
export const SYSTEM_PROGRAM_BASE58 = '11111111111111111111111111111111';

const REGISTRY: Record<string, WellKnownProgram> = {
  [SYSTEM_PROGRAM_BASE58]: {
    base58: SYSTEM_PROGRAM_BASE58,
    label: 'Arch System Program',
    hideInForm: true,
  },
};

/**
 * Look up a well-known program by its base58 address. Returns `null` for
 * unknown addresses — callers should treat that as "render normally."
 */
export const lookupWellKnown = (base58: string | undefined): WellKnownProgram | null => {
  if (!base58) return null;
  return REGISTRY[base58] ?? null;
};

/**
 * Convenience: should this account be hidden from the rendered form?
 *
 * We hide an account if it has a fixed `address` that matches an entry
 * with `hideInForm: true`. The encoder still includes it in the built
 * transaction — the user just doesn't see a noise field for it.
 */
export const shouldHideFromForm = (address: string | undefined): boolean => {
  const wk = lookupWellKnown(address);
  return wk !== null && wk.hideInForm;
};
