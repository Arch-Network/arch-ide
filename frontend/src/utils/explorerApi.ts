/**
 * Thin client for program transaction history.
 *
 * The browser talks to the IDE rust-server, which proxies to the Arch Explorer
 * indexer (https://explorer.arch.network/docs). Hitting Explorer from the
 * page is blocked by CORS; a Vite-baked API key would be public and would
 * still fail the preflight. The server fetches Explorer; no browser key.
 *
 * Only canonical public networks (testnet/mainnet) are indexed. Local devnet
 * has no indexer, so callers must handle `null`/`ExplorerUnavailableError` and
 * fall back to their existing RPC/WebSocket paths.
 */

export type ExplorerNetwork = 'testnet' | 'mainnet' | 'devnet';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';

/** Whether the indexer REST API is available for `network`. */
export function isExplorerApiAvailable(network: string): boolean {
  return network === 'testnet' || network === 'mainnet';
}

/** Raised when a caller requests indexer data for an unindexed network. */
export class ExplorerUnavailableError extends Error {
  constructor(network: string) {
    super(`Arch Explorer API is not available for network "${network}"`);
    this.name = 'ExplorerUnavailableError';
  }
}

/** Raised when the indexer returns a non-2xx response. */
export class ExplorerApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ExplorerApiError';
  }
}

/**
 * Raised when the request got no response at all. Used when the IDE proxy
 * itself is unreachable (or a leftover direct Explorer call is CORS-blocked).
 */
export class ExplorerUnreachableError extends Error {
  constructor() {
    super(
      'The Arch Explorer API could not be reached from this site: the browser blocked the request or the network is offline.',
    );
    this.name = 'ExplorerUnreachableError';
  }
}

export type ExplorerTxStatus = 'processed' | 'failed' | 'unknown';

export interface ExplorerTransaction {
  txid: string;
  blockHeight: number | null;
  status: ExplorerTxStatus;
  /** Failure detail when `status === 'failed'`, else null. */
  failure: string | null;
  /** ISO-8601 timestamp the indexer recorded the transaction, if present. */
  createdAt: string | null;
}

export interface ProgramTransactionsPage {
  transactions: ExplorerTransaction[];
  /** Total transactions the program has, across all pages (null if unknown). */
  totalCount: number | null;
}

/**
 * The indexer reports status either as the string `"Processed"` or as a
 * tagged object `{ "Failed": "<reason>" }` (mirroring the validator's Rust
 * enum). Anything else is treated as unknown rather than assumed successful.
 */
function normalizeStatus(raw: unknown): { status: ExplorerTxStatus; failure: string | null } {
  if (typeof raw === 'string') {
    return raw === 'Processed'
      ? { status: 'processed', failure: null }
      : { status: 'unknown', failure: null };
  }
  if (raw && typeof raw === 'object' && 'Failed' in raw) {
    const reason = (raw as { Failed: unknown }).Failed;
    return { status: 'failed', failure: reason == null ? 'Failed' : String(reason) };
  }
  return { status: 'unknown', failure: null };
}

function mapTransaction(raw: any): ExplorerTransaction | null {
  const txid: unknown = raw?.txid ?? raw?.data?.id;
  if (typeof txid !== 'string' || txid.length === 0) return null;
  const { status, failure } = normalizeStatus(raw?.status);
  const blockHeight =
    typeof raw?.block_height === 'number' ? raw.block_height : null;
  const createdAt =
    typeof raw?.created_at === 'string'
      ? raw.created_at
      : typeof raw?.confirmed_at === 'string'
        ? raw.confirmed_at
        : null;
  return { txid, blockHeight, status, failure, createdAt };
}

/**
 * Fetch a page of a program's transaction history, newest first. The indexer
 * paginates by `offset` (not page number). `programIdHex` is the 64-char hex
 * program id — the same value the Program Inspector holds as `account.pubkey`.
 *
 * Goes through the IDE rust-server so Explorer CORS never applies.
 */
export async function fetchProgramTransactions(
  network: string,
  programIdHex: string,
  opts: { limit?: number; offset?: number; signal?: AbortSignal } = {},
): Promise<ProgramTransactionsPage> {
  if (!isExplorerApiAvailable(network)) throw new ExplorerUnavailableError(network);

  const limit = opts.limit ?? 25;
  const offset = opts.offset ?? 0;
  const url = `${API_URL}/explorer/${network}/programs/${encodeURIComponent(programIdHex)}/transactions?limit=${limit}&offset=${offset}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: opts.signal,
    });
  } catch (e) {
    if (e instanceof TypeError) throw new ExplorerUnreachableError();
    throw e;
  }

  if (!res.ok) {
    throw new ExplorerApiError(
      res.status,
      `Explorer API returned HTTP ${res.status} for program transactions`,
    );
  }

  const json = await res.json();
  const rawTxs: unknown = json?.transactions;
  const transactions = Array.isArray(rawTxs)
    ? rawTxs.map(mapTransaction).filter((t): t is ExplorerTransaction => t !== null)
    : [];

  return {
    transactions,
    totalCount: typeof json?.total_count === 'number' ? json.total_count : null,
  };
}
