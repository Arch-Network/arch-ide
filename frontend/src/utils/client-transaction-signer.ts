/**
 * Client-side Transaction Signing Utilities
 *
 * Provides reusable functions for signing and sending transactions from the browser
 * Used by client.ts templates in user projects
 */

/**
 * Setup an account - tries wallet first, falls back to creating new account
 *
 * @param conn - RpcConnection instance
 * @returns Object with accountPubkey, accountAddress, and useWallet flag
 */
export async function setupAccount(conn: any): Promise<{
  accountPubkey: Uint8Array;
  accountAddress: string;
  useWallet: boolean;
  privkey?: string;
}> {
  try {
    let accountPubkey: Uint8Array;
    let accountAddress: string;
    let useWallet = false;
    let privkey: string | undefined;

    // Get references from window/global scope (they're injected by archPgClient)
    const PubkeyUtil = (typeof window !== 'undefined' ? (window as any).PubkeyUtil : (globalThis as any).PubkeyUtil);
    const ArchConnection = (typeof window !== 'undefined' ? (window as any).ArchConnection : (globalThis as any).ArchConnection);
    const toBase58 = (typeof window !== 'undefined' ? (window as any).toBase58 : (globalThis as any).toBase58);
    const walletProxy = (typeof window !== 'undefined' ? (window as any).walletProxy : (globalThis as any).walletProxy);

  // Check if a Bitcoin wallet is available via walletProxy
  if (typeof walletProxy !== 'undefined') {
    console.log("Checking for wallet extensions...");

    try {
      const walletAvailable = await walletProxy.isAvailable();

      if (walletAvailable) {
        const walletType = await walletProxy.getWalletType();
        console.log("✓ " + (walletType || 'Bitcoin') + " wallet detected");

        const accounts = await walletProxy.getAccounts();

        if (accounts && accounts.length > 0) {
          accountAddress = accounts[0];
          let pubkey = await walletProxy.getPublicKey();

          // Bitcoin wallets return 33-byte compressed keys (66 hex chars)
          // Arch Network needs 32-byte x-only keys (64 hex chars)
          if (pubkey.length === 66) {
            pubkey = pubkey.slice(2);
            console.log("✓ Converted compressed pubkey to x-only format");
          }

          accountPubkey = PubkeyUtil.fromHex(pubkey);
          useWallet = true;
          console.log("✓ Using wallet account");
          console.log("  Address:", accountAddress);

          // Fund the account on testnet
          console.log("\n--- Funding Account ---");
          try {
            console.log("Requesting funds from faucet...");
            await conn.requestAirdrop(accountPubkey);
            console.log("✓ Airdrop requested!");

            await new Promise(resolve => setTimeout(resolve, 3000));
            console.log("✓ Account funded!");
          } catch (error: any) {
            console.log("⚠️  Airdrop failed:", error.message);
            console.log("  (Account may already have funds)");
          }

          return { accountPubkey, accountAddress, useWallet };
        }
      }
    } catch (e: any) {
      console.log("⚠️  Could not connect to wallet:", e.message || e);
    }
  }

    // Fallback: create a new account if no wallet
    console.log("Creating new account...");
    const archConn = ArchConnection(conn);
    const newAccount = await archConn.createNewAccount();

    accountPubkey = PubkeyUtil.fromHex(newAccount.pubkey);
    accountAddress = newAccount.address;
    privkey = newAccount.privkey;

    console.log("✓ Account Created:");
    console.log("  Address:", accountAddress);
    console.log("  Pubkey:", toBase58(accountPubkey));

    try {
      await conn.requestAirdrop(accountPubkey);
      console.log("✓ Airdrop requested successfully!");
    } catch(e: any) {
      console.log("✗ Airdrop error:", e.error ? e.error.message : e.message);
    }

    return { accountPubkey, accountAddress, useWallet, privkey };
  } catch (error: any) {
    console.error("[setupAccount] Error occurred:", error);
    console.error("[setupAccount] Error message:", error?.message);
    console.error("[setupAccount] Error stack:", error?.stack);
    throw new Error(`setupAccount failed: ${error?.message || JSON.stringify(error)}`);
  }
}

/**
 * Sign and send a transaction using wallet
 *
 * @param conn - RpcConnection instance
 * @param message - Unsanitized message with signers and instructions
 * @param useWallet - Whether to use wallet for signing
 * @returns Transaction ID or undefined if no wallet
 */
export async function signAndSendTransaction(
  conn: any,
  message: any,
  useWallet: boolean
): Promise<string | undefined> {
  // Get references from window/global scope
  const MessageUtil = (typeof window !== 'undefined' ? (window as any).MessageUtil : (globalThis as any).MessageUtil);
  const walletProxy = (typeof window !== 'undefined' ? (window as any).walletProxy : (globalThis as any).walletProxy);
  const SignatureUtil = (typeof window !== 'undefined' ? (window as any).SignatureUtil : (globalThis as any).SignatureUtil);

  // Hash the message
  const messageHash = MessageUtil.hash(message);
  const hashHex = Array.from(messageHash)
    .map((b: number) => b.toString(16).padStart(2, '0'))
    .join('');

  console.log("✓ Message hash:", hashHex.slice(0, 32) + "...");

  // Check if wallet proxy is available and wallet is connected
  if (typeof walletProxy !== 'undefined' && useWallet) {
    const walletType = await walletProxy.getWalletType();
    console.log("✓ Using " + (walletType || 'wallet') + " for signing");

    try {
      // Use wallet proxy to sign with BIP-322
      console.log("Requesting signature from wallet...");
      console.log("⚠️  Please approve the signature request in your wallet");

      const signatureBase64 = await walletProxy.signMessage(hashHex, 'bip322-simple');

      // Decode base64 signature to bytes
      let signature = Uint8Array.from(atob(signatureBase64), (c: string) => c.charCodeAt(0));
      console.log("✓ Signature received from wallet");
      console.log("  - Raw signature length: " + signature.length + " bytes");

      // BIP322 signatures can be 65 bytes (64-byte sig + 1-byte recovery/sighash)
      // Arch Network expects 64-byte Schnorr signatures
      if (signature.length === 65) {
        console.log("  - Stripping extra byte from BIP322 signature (65 -> 64 bytes)");
        signature = signature.slice(0, 64);
      }

      // Adjust signature using SignatureUtil if available
      if (typeof SignatureUtil !== 'undefined') {
        console.log("  - Adjusting signature for Arch Network...");
        try {
          signature = SignatureUtil.adjustSignature(signature);
          console.log("✓ Signature adjusted for Arch Network");
          console.log("  - Adjusted signature length: " + signature.length + " bytes");
        } catch (e: any) {
          console.log("⚠️  Could not adjust signature:", e.message);
          console.log("  - Using raw signature instead");
        }
      }

      // Validate signature length (should be 64 bytes for Schnorr)
      if (signature.length !== 64) {
        console.log("⚠️  Warning: Signature length is " + signature.length + " bytes (expected 64 for Schnorr)");
      }

      // Get a recent blockhash for the transaction
      const bestBlockHash = await conn.getBestBlockHash();
      console.log("\n✓ Recent blockhash:", bestBlockHash.slice(0, 20) + "...");

      // Convert blockhash from hex string to bytes
      const blockhashBytes = new Uint8Array(32);
      for (let i = 0; i < 32; i++) {
        blockhashBytes[i] = parseInt(bestBlockHash.slice(i * 2, i * 2 + 2), 16);
      }

      // Build sanitized message from the unsanitized one
      const sanitizedMessage = buildSanitizedMessage(message, blockhashBytes);

      // Create the runtime transaction
      const transaction = {
        version: 0,
        signatures: [Array.from(signature)],
        message: sanitizedMessage
      };

      console.log("\n✓ Transaction created");
      console.log("  - Version: " + transaction.version);
      console.log("  - Signatures: " + transaction.signatures.length);
      console.log("  - Signature length: " + signature.length + " bytes");

      // Send the transaction
      console.log("\n--- Sending Transaction ---");
      const txid = await conn.sendTransaction(transaction);
      console.log("✅ Transaction sent!");
      console.log("Transaction ID: " + txid);

      // Wait a bit for the transaction to be processed
      console.log("\n⏳ Waiting for transaction to be processed...");
      await new Promise(resolve => setTimeout(resolve, 3000));

      // Try to get the processed transaction
      try {
        const processedTx = await conn.getProcessedTransaction(txid);
        if (processedTx) {
          console.log("✓ Transaction processed");
          console.log("  - Status:", processedTx.status);
          if (processedTx.bitcoin_txid) {
            console.log("  - Bitcoin TXID:", processedTx.bitcoin_txid);
          }
        }
      } catch (e) {
        console.log("⚠️  Transaction submitted but confirmation pending");
      }

      return txid;

    } catch (error: any) {
      console.error("✗ Error signing/sending transaction:", error.message || error);
      console.log("\n💡 Troubleshooting:");
      console.log("   - Make sure your wallet is unlocked");
      console.log("   - Check that you have sufficient balance");
      console.log("   - Try connecting your wallet to the dApp");
      console.log("   - Approve the signature request in your wallet");
      throw error;
    }

  } else {
    console.log("⚠️  No wallet connected");
    console.log("\n💡 To complete this transaction:");
    console.log("   1. Install Unisat (https://unisat.io) or Xverse wallet");
    console.log("   2. Connect your wallet to this site");
    console.log("   3. Run this script again");
    console.log("\n📝 Transaction was prepared successfully:");
    console.log("   - Message hash: " + hashHex.slice(0, 32) + "...");
    console.log("   - You can sign this manually with BIP-322");
    return undefined;
  }
}

/**
 * Build a sanitized message from an unsanitized message
 *
 * @param unsanitizedMessage - Message with signers and instructions
 * @param blockhashBytes - Recent blockhash as Uint8Array
 * @returns Sanitized message ready for transaction
 */
function buildSanitizedMessage(unsanitizedMessage: any, blockhashBytes: Uint8Array): any {
  const signers = unsanitizedMessage.signers;
  const instructions = unsanitizedMessage.instructions;

  // Collect all unique accounts
  const accountKeysMap = new Map<string, Uint8Array>();

  // Add signers first
  signers.forEach((signer: Uint8Array) => {
    const signerHex = Array.from(signer).map(b => b.toString(16).padStart(2, '0')).join('');
    accountKeysMap.set(signerHex, signer);
  });

  // Add accounts from instructions
  instructions.forEach((ix: any) => {
    // Add program ID
    const programIdHex = Array.from(ix.program_id).map(b => b.toString(16).padStart(2, '0')).join('');
    if (!accountKeysMap.has(programIdHex)) {
      accountKeysMap.set(programIdHex, ix.program_id);
    }

    // Add instruction accounts
    ix.accounts.forEach((acc: any) => {
      const pubkeyHex = Array.from(acc.pubkey).map(b => b.toString(16).padStart(2, '0')).join('');
      if (!accountKeysMap.has(pubkeyHex)) {
        accountKeysMap.set(pubkeyHex, acc.pubkey);
      }
    });
  });

  const account_keys = Array.from(accountKeysMap.values());

  // Build header
  const num_required_signatures = signers.length;
  const num_readonly_signed_accounts = 0; // All signers are writable by default

  // Count readonly unsigned accounts (programs)
  let num_readonly_unsigned_accounts = 0;
  instructions.forEach((ix: any) => {
    const programIdHex = Array.from(ix.program_id).map(b => b.toString(16).padStart(2, '0')).join('');
    const isSigner = signers.some((s: Uint8Array) => {
      const signerHex = Array.from(s).map(b => b.toString(16).padStart(2, '0')).join('');
      return signerHex === programIdHex;
    });
    if (!isSigner) {
      num_readonly_unsigned_accounts++;
    }
  });

  // Build compiled instructions
  const compiledInstructions = instructions.map((ix: any) => {
    const programIdHex = Array.from(ix.program_id).map(b => b.toString(16).padStart(2, '0')).join('');
    const program_id_index = Array.from(accountKeysMap.keys()).indexOf(programIdHex);

    const accounts = ix.accounts.map((acc: any) => {
      const pubkeyHex = Array.from(acc.pubkey).map(b => b.toString(16).padStart(2, '0')).join('');
      return Array.from(accountKeysMap.keys()).indexOf(pubkeyHex);
    });

    return {
      program_id_index,
      accounts,
      data: Array.from(ix.data)
    };
  });

  return {
    header: {
      num_required_signatures,
      num_readonly_signed_accounts,
      num_readonly_unsigned_accounts
    },
    account_keys: account_keys.map(k => Array.from(k)),
    recent_blockhash: Array.from(blockhashBytes),
    instructions: compiledInstructions
  };
}
