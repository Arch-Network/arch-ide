// arch-satellite-lang's declare_id! accepts only 64 hex chars, optionally 0x-prefixed
// (lang/attribute/account/src/id.rs). arch_program's declare_id! is base58, so this never matches it.
const SATELLITE_DECLARE_ID = /declare_id!\(\s*"(?:0x)?[0-9a-fA-F]{64}"\s*\)/g;

/** Points every Satellite `declare_id!` in `source` at `programIdHex`, the key the program deploys to. */
export const setDeclaredId = (source: string, programIdHex: string): string =>
  source.replace(SATELLITE_DECLARE_ID, `declare_id!("${programIdHex}")`);

// The program id rides along as a data URL media type parameter (RFC 2397); every reader takes the
// payload after the comma, so it survives wherever the binary is stored without changing them.
export const programBinaryDataUrl = (base64: string, programIdHex?: string): string =>
  `data:application/octet-stream${programIdHex ? `;program-id=${programIdHex}` : ''};base64,${base64}`;

/** The program id compiled into a binary built here, or null when unknown (imported .so, native build). */
export const builtProgramId = (binary: string): string | null =>
  binary.match(/^data:[^,]*;program-id=([0-9a-f]{64})[;,]/)?.[1] ?? null;
