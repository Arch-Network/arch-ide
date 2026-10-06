export interface BinaryOrigin {
  source: 'built' | 'uploaded';
  fileName: string;
  at: Date;
  /** The program binary this origin describes; it no longer applies once the binary changes. */
  binary: string;
}

const ELF_MAGIC = [0x7f, 0x45, 0x4c, 0x46];

export function hasElfMagic(header: Uint8Array): boolean {
  return ELF_MAGIC.every((byte, i) => header[i] === byte);
}

export function decodeProgramBinary(binary: string): Uint8Array {
  const base64 = binary.startsWith('data:') ? binary.split(',')[1] : binary;
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

export async function shortSha256(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return Array.from(digest.slice(0, 6), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function describeOrigin(origin: BinaryOrigin | null | undefined, binary: string): string {
  if (!origin || origin.binary !== binary) return 'restored from last session';
  const time = origin.at.toLocaleTimeString();
  return origin.source === 'built' ? `built ${time}` : `uploaded ${origin.fileName} ${time}`;
}
