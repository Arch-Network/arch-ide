import type { ProcessedTransaction, RpcConnection } from '@arch-network/arch-sdk';

export type ProcessedOutcome =
  | { kind: 'confirmed'; logs: string[] }
  | { kind: 'failed'; message: string; logs: string[] }
  | { kind: 'unconfirmed'; message: string };

const POLL_INTERVAL_MS = 1_000;
const TIMEOUT_MS = 30_000;

/**
 * Poll `get_processed_transaction` until the transaction leaves the queue.
 * `sendTransaction` returning a txid only means the node accepted it; the
 * program can still fail when it runs.
 */
export const awaitProcessed = async (
  connection: RpcConnection,
  txid: string,
): Promise<ProcessedOutcome> => {
  const deadline = Date.now() + TIMEOUT_MS;
  let lastError: string | null = null;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    let tx: ProcessedTransaction | undefined;
    try {
      tx = await connection.getProcessedTransaction(txid);
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      continue;
    }
    if (!tx || tx.status.type === 'queued') continue;
    const logs = tx.logs ?? [];
    if (tx.status.type === 'failed') {
      return { kind: 'failed', message: tx.status.message, logs };
    }
    if (tx.rollback_status.type === 'rolledback') {
      return { kind: 'failed', message: `Rolled back: ${tx.rollback_status.message}`, logs };
    }
    return { kind: 'confirmed', logs };
  }
  return {
    kind: 'unconfirmed',
    message:
      `Not processed within ${TIMEOUT_MS / 1000} s; it may still land, check the explorer.` +
      (lastError ? ` Last RPC error: ${lastError}` : ''),
  };
};
