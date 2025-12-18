import { RpcConnection, PubkeyUtil } from "@saturnbtcio/arch-sdk";
import { base58 } from "@scure/base";

async function main() {
  // Compressed Bitcoin pubkey (33 bytes, hex) from your UniSat wallet
  const compressedHex =
    "0253653ff3c5b4ddc8d6d48935912f38b17130d677a60f0b7d7afdf691da470a8b";

  // 1) Strip the 0x02 / 0x03 prefix to get the x-only 32-byte pubkey (Arch pubkey)
  const xOnlyHex = compressedHex.slice(2);
  console.log("x-only pubkey (hex):", xOnlyHex);

  // 2) Convert hex -> Uint8Array using Arch SDK helper
  const archPubkey: Uint8Array = PubkeyUtil.fromHex(xOnlyHex);
  console.log("Arch pubkey bytes:", Array.from(archPubkey));
  console.log("Arch pubkey base58:", base58.encode(archPubkey));

  // 3) Connect to Arch beta RPC
  const conn = new RpcConnection("https://rpc.internal.arch.network");

  // 4) Derive the Arch account address the same way the explorer does
  const archAddress = await conn.getAccountAddress(archPubkey);
  console.log("Arch account address:", archAddress);
}

main().catch((err) => {
  console.error("Error deriving Arch address:", err);
  process.exit(1);
});
