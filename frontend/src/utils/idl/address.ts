import { Buffer } from 'buffer/';
import bs58 from 'bs58';

export interface ParsedAddress {
  pubkey: Buffer;
  /** The format the user actually entered, for "X format detected" hints. */
  detectedFormat: 'base58' | 'hex';
}

/**
 * Parse a user-supplied account address. We accept both base58 (Arch's
 * default) and hex (32-byte raw) so the panel can be paired with copy
 * buttons from anywhere in the IDE without forcing a format conversion.
 */
export const parseAddress = (raw: string): ParsedAddress | { error: string } => {
  const trimmed = raw.trim();
  if (!trimmed) return { error: 'Address is required.' };

  // Hex with optional 0x prefix.
  const hex = trimmed.startsWith('0x') ? trimmed.slice(2) : trimmed;
  if (/^[0-9a-fA-F]{64}$/.test(hex)) {
    return {
      pubkey: Buffer.from(hex, 'hex'),
      detectedFormat: 'hex',
    };
  }

  // Otherwise try base58.
  try {
    const decoded = bs58.decode(trimmed);
    if (decoded.length !== 32) {
      return {
        error: `Decoded base58 produced ${decoded.length} bytes, expected 32.`,
      };
    }
    return {
      pubkey: Buffer.from(decoded),
      detectedFormat: 'base58',
    };
  } catch {
    return { error: 'Not a valid base58 or 64-character hex string.' };
  }
};
