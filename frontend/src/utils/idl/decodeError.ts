import type { ArchError, ArchIdl } from '../../types';

/**
 * Parsed program-error result.
 *
 * `code` is set whenever we extracted a numeric error code from the
 * RPC message, regardless of whether the IDL knew about it. `match`
 * is set only when the IDL explicitly declared that code, so the UI
 * can decide how loudly to surface a "name + message" vs "raw code"
 * presentation.
 */
export interface DecodedProgramError {
  /** The numeric code we pulled from the RPC error. */
  code?: number;
  /** The IDL entry matching `code`, when one exists. */
  match?: ArchError;
  /**
   * Human-readable summary. If we matched the IDL, this includes the
   * error name + msg; otherwise it falls back to a "Program error N"
   * line so users still see the code, or the raw RPC text when no
   * code could be extracted (e.g. signing or RPC-transport errors).
   */
  pretty: string;
  /** The original (unmodified) RPC error message. */
  raw: string;
  /** True when we both extracted a code and found it in the IDL. */
  matched: boolean;
}

/**
 * Best-effort decoder for program-emitted error codes embedded in an
 * RPC error message.
 *
 * We don't get a structured error object back from `sendTransaction`
 * — the SDK throws an `Error` whose `.message` carries the JSON-RPC
 * payload. This helper sniffs the most common formats:
 *
 *   - "Custom program error: 0x1770"           (hex)
 *   - "Custom(6000)"                            (decimal)
 *   - "Error Code: 6000"                        (Anchor pretty)
 *   - "InstructionError([0, Custom(6000)])"
 *   - structured `"code": 6000`                 (raw JSON-RPC `data`)
 *
 * If multiple patterns match, the *first* hit wins: when an
 * instruction error wraps a program error, the program error is the
 * one the user authored, and it's the one the IDL knows about.
 * Solana / Arch / Anchor all wrap in this order.
 *
 * The decoder is pure and synchronous so it can run inside a memo
 * without surprising effects.
 */
export const decodeProgramError = (
  raw: string,
  idl: ArchIdl | null,
): DecodedProgramError => {
  const code = extractCode(raw);
  if (code === undefined) {
    return { pretty: raw, raw, matched: false };
  }

  const match = idl?.errors.find((e) => e.code === code);
  if (match) {
    return {
      code,
      match,
      pretty: `${match.name} (${code}): ${match.msg}`,
      raw,
      matched: true,
    };
  }
  return {
    code,
    pretty: `Program error ${code} — no matching entry in IDL`,
    raw,
    matched: false,
  };
};

/**
 * Extract the *first* numeric error code found in `text`.
 *
 * Each pattern returns either a hex or decimal capture group; we
 * normalize to a base-10 number. A return of `undefined` means the
 * message doesn't look like a program error (e.g. signing failed,
 * RPC unreachable, validation rejected for non-program reasons).
 *
 * Patterns are ordered most-specific → least-specific so generic
 * "program error: …" doesn't preempt the more diagnostic
 * "Custom program error: 0x…" when both appear.
 */
const extractCode = (text: string): number | undefined => {
  // Each entry: [regex, isHex] — `isHex` decides how to parse the
  // capture group, since some patterns wrap a hex literal and others
  // a decimal one.
  const patterns: Array<[RegExp, boolean]> = [
    [/Custom program error[: ]+0x([0-9a-fA-F]+)/, true],
    [/Custom\((\d+)\)/, false],
    [/Error\s+Code:\s*(\d+)/i, false],
    [/program error[: ]+0x([0-9a-fA-F]+)/i, true],
    [/program error[: ]+(\d+)/i, false],
    [/"code"\s*:\s*(\d+)/, false],
  ];

  for (const [re, isHex] of patterns) {
    const m = text.match(re);
    if (!m) continue;
    const captured = m[1];
    const n = isHex ? parseInt(captured, 16) : parseInt(captured, 10);
    if (Number.isFinite(n) && n >= 0 && n <= 0xffff_ffff) return n;
  }
  return undefined;
};
