import type { ArchIdl } from '../../types';
import { normalizeToLegacyIdl } from './normalize';

export interface IdlValidationResult {
  ok: boolean;
  /** When `ok === false`, a human-readable reason. */
  reason?: string;
  /** When `ok === true`, the (possibly normalized) IDL. */
  idl?: ArchIdl;
}

/**
 * Best-effort runtime validator for an `ArchIdl` payload.
 *
 * We accept both the legacy Anchor IDL shape (top-level `name`/`version`)
 * and the modern spec-0.1.0 shape (nested under `metadata`). The
 * normalizer in `normalize.ts` handles the structural differences;
 * this function focuses on surfacing friendly errors for malformed
 * payloads.
 */
export const validateIdl = (raw: unknown): IdlValidationResult => {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, reason: 'IDL must be a JSON object.' };
  }

  const idl = normalizeToLegacyIdl(raw);
  if (!idl) {
    // We couldn't even extract a name + version. Distinguish between the
    // two formats so the user knows which knob to check.
    const obj = raw as Record<string, unknown>;
    if (obj.metadata && typeof obj.metadata === 'object') {
      const m = obj.metadata as Record<string, unknown>;
      if (typeof m.name !== 'string') {
        return { ok: false, reason: 'Missing "metadata.name" in IDL.' };
      }
      if (typeof m.version !== 'string') {
        return { ok: false, reason: 'Missing "metadata.version" in IDL.' };
      }
    }
    if (typeof obj.name !== 'string' || obj.name.length === 0) {
      return { ok: false, reason: 'Missing required field: "name" (string).' };
    }
    if (typeof obj.version !== 'string') {
      return { ok: false, reason: 'Missing required field: "version" (string).' };
    }
    return { ok: false, reason: 'IDL is malformed (could not be normalized).' };
  }

  return { ok: true, idl };
};

/**
 * Parse + validate a raw JSON string. Returns either the IDL or a friendly
 * reason string suitable for inline error display.
 */
export const parseIdlJson = (text: string): IdlValidationResult => {
  if (!text.trim()) {
    return { ok: false, reason: 'IDL JSON is empty.' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    return {
      ok: false,
      reason: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  return validateIdl(parsed);
};
