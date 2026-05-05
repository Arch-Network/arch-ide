import { useSyncExternalStore } from 'react';
import {
  ArchWebSocketClient,
  EventTopic,
} from '@arch-network/arch-sdk';

/**
 * Live WebSocket integration for the Program Inspector.
 *
 * One global, lazy-initialized `ArchWebSocketClient` per RPC URL —
 * shared across every component that calls `useArchWebSocket`, so we
 * don't open N redundant sockets when the Inspector mounts the
 * Accounts tab + History tab + header indicator simultaneously.
 *
 * The connection state is exposed via `useSyncExternalStore` so any
 * UI surface can render a "Live"/"Offline" pill that stays in sync
 * with reality.
 *
 * URL derivation
 * --------------
 * The Arch RPC and WebSocket endpoints live on parallel hostnames:
 *   https://rpc.testnet.arch.network → wss://ws.testnet.arch.network
 *   https://rpc.mainnet.arch.network → wss://ws.mainnet.arch.network
 * For RPCs that don't follow the `rpc.` convention (custom dev RPC,
 * proxies, plain IPs) we return `null` and let consumers degrade
 * gracefully — the rest of the app works just fine without WS.
 */

export type WsStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'error'
  | 'unsupported';

interface SocketSlot {
  rpcUrl: string;
  wsUrl: string;
  client: ArchWebSocketClient;
  status: WsStatus;
  /** Last error message we observed, if any. */
  error: string | null;
}

interface StoreSnapshot {
  rpcUrl: string;
  wsUrl: string | null;
  status: WsStatus;
  error: string | null;
  /** Bumps every time the underlying client instance is replaced. */
  generation: number;
}

const listeners = new Set<() => void>();
let slot: SocketSlot | null = null;
let snapshot: StoreSnapshot = {
  rpcUrl: '',
  wsUrl: null,
  status: 'idle',
  error: null,
  generation: 0,
};

const emit = () => {
  for (const l of listeners) l();
};

const setStatus = (status: WsStatus, error: string | null = null) => {
  if (snapshot.status === status && snapshot.error === error) return;
  snapshot = { ...snapshot, status, error };
  if (slot) {
    slot.status = status;
    slot.error = error;
  }
  emit();
};

/**
 * Translate an `https://rpc.<env>.arch.network` URL into its WS
 * counterpart `wss://ws.<env>.arch.network`. Returns null when the
 * URL doesn't fit the convention — consumers should treat null as
 * "WebSocket unavailable for this network" rather than an error.
 */
export const deriveWsUrl = (rpcUrl: string): string | null => {
  if (!rpcUrl) return null;
  let url: URL;
  try {
    url = new URL(rpcUrl);
  } catch {
    return null;
  }
  // We only know how to map the canonical `rpc.<env>` pattern.
  // Anything else (custom RPC, IP, localhost) returns null so the
  // UI can show "Live unavailable" instead of pointing at a port
  // we have no way of knowing.
  if (!url.hostname.startsWith('rpc.')) return null;
  const wsHost = `ws.${url.hostname.slice('rpc.'.length)}`;
  const proto = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${wsHost}`;
};

/**
 * Tear down the current socket (if any) and clear the slot. Called
 * when the RPC URL changes or when the consumer unmounts the last
 * subscriber. We swallow disconnect errors — the socket may already
 * be closed mid-handshake.
 */
const disposeSlot = () => {
  if (!slot) return;
  const client = slot.client;
  slot = null;
  client.disconnect().catch(() => {
    /* socket may already be closed; nothing to do */
  });
};

/**
 * Lazily create (or reuse) the singleton client for `rpcUrl`. We
 * trigger `connect()` synchronously and let the promise resolve in
 * the background — consumers observe the result via `status`.
 */
const ensureSlot = (rpcUrl: string): SocketSlot | null => {
  // Reuse the existing slot when the URL is unchanged.
  if (slot && slot.rpcUrl === rpcUrl) return slot;

  // RPC URL changed: tear down old client first.
  if (slot) disposeSlot();

  const wsUrl = deriveWsUrl(rpcUrl);
  if (!wsUrl) {
    snapshot = {
      rpcUrl,
      wsUrl: null,
      status: 'unsupported',
      error: null,
      generation: snapshot.generation + 1,
    };
    emit();
    return null;
  }

  const client = new ArchWebSocketClient({
    url: wsUrl,
    autoReconnect: true,
    maxReconnectAttempts: 10,
    // The SDK declares `BackoffStrategyType` as an enum in its `.d.ts`
    // but the published `.mjs` build doesn't actually export it at
    // runtime (it was a const enum that TypeScript inlined). Using
    // the string literal matches what the SDK compares against
    // internally and avoids the TDZ-style "Cannot read properties of
    // undefined (reading 'Exponential')" crash.
    backoffStrategy: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      type: 'exponential' as any,
      initial: 500,
      factor: 2,
      maxDelay: 15_000,
      jitter: 0.25,
    },
  });

  const newSlot: SocketSlot = {
    rpcUrl,
    wsUrl,
    client,
    status: 'connecting',
    error: null,
  };
  slot = newSlot;
  snapshot = {
    rpcUrl,
    wsUrl,
    status: 'connecting',
    error: null,
    generation: snapshot.generation + 1,
  };
  emit();

  // Wire transport-level events to status updates. The SDK emits
  // 'connect' / 'disconnect' on the client itself; we register
  // them as no-arg async callbacks (signature required by the SDK).
  client.on('connect', async () => {
    if (slot !== newSlot) return;
    setStatus('connected');
  });
  client.on('disconnect', async () => {
    if (slot !== newSlot) return;
    setStatus('disconnected');
  });

  client.connect().catch((err) => {
    if (slot !== newSlot) return;
    setStatus('error', err instanceof Error ? err.message : String(err));
  });

  return newSlot;
};

const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};

const getSnapshot = () => snapshot;

/**
 * React hook: open (or reuse) the live socket for `rpcUrl` and
 * expose its status. Each component that calls this hook is
 * counted as a subscriber, so the socket only stays open while at
 * least one consumer is mounted.
 *
 * Returns helpers for subscribing to specific event types — the
 * subscription tracks its own subscription_id and tears down on
 * unsubscribe, so callers don't need to thread IDs around.
 */
export function useArchWebSocket(rpcUrl: string) {
  // Ensure the slot exists / matches before reading the snapshot,
  // so the very first render of a new RPC sees `connecting` rather
  // than the stale `connected` state of the previous URL.
  ensureSlot(rpcUrl);

  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  /**
   * Subscribe to AccountUpdate events for a specific account.
   *
   * The validator filters server-side using the `account` filter
   * key (snake_case — matches the Rust `EventFilter` schema),
   * but we also re-check client-side as a defensive measure in
   * case a future server build changes the filter semantics.
   *
   * Returns an unsubscribe function. Callers should invoke it on
   * cleanup; calling it after the socket has dropped is safe.
   */
  const subscribeAccount = async (
    pubkeyHex: string,
    handler: (event: AccountUpdatePayload) => void,
  ): Promise<() => void> => {
    const current = slot;
    if (!current) return () => {};
    const lower = pubkeyHex.toLowerCase();
    let subId: string | null = null;
    let cancelled = false;

    const callback = async (event: any) => {
      if (cancelled) return;
      const evtAccount: string | undefined = event?.account;
      if (typeof evtAccount === 'string' && evtAccount.toLowerCase() !== lower) {
        return;
      }
      handler({
        account: evtAccount ?? lower,
        transactionHash: event?.transaction_hash ?? '',
        blockHeight: typeof event?.block_height === 'number' ? event.block_height : 0,
      });
    };

    try {
      subId = await current.client.subscribe(
        EventTopic.AccountUpdate,
        callback,
        { account: lower },
      );
    } catch (err) {
      console.warn('[ws] account subscribe failed', err);
      return () => {
        cancelled = true;
      };
    }

    return () => {
      cancelled = true;
      if (subId && slot === current) {
        current.client.unsubscribeById(subId).catch(() => {
          /* ignore — socket may already be torn down */
        });
      }
    };
  };

  /**
   * Subscribe to Transaction events whose `program_ids` array
   * contains the given program. Same client/server-side filter
   * dance as account subscriptions.
   */
  const subscribeProgramTransactions = async (
    programIdHex: string,
    handler: (event: TransactionStreamEvent) => void,
  ): Promise<() => void> => {
    const current = slot;
    if (!current) return () => {};
    const lower = programIdHex.toLowerCase();
    let subId: string | null = null;
    let cancelled = false;

    const callback = async (event: any) => {
      if (cancelled) return;
      const ids: string[] = Array.isArray(event?.program_ids) ? event.program_ids : [];
      const matches = ids.some((id) =>
        typeof id === 'string' && id.toLowerCase() === lower,
      );
      if (!matches) return;
      const status = event?.status;
      const isFailed =
        status && typeof status === 'object' && 'Failed' in status;
      handler({
        hash: event?.hash ?? '',
        status: isFailed ? 'failed' : status === 'Processed' ? 'processed' : 'queued',
        failure: isFailed ? String((status as { Failed: string }).Failed) : null,
        programIds: ids,
        blockHeight: typeof event?.block_height === 'number' ? event.block_height : 0,
        observedAt: Date.now(),
      });
    };

    try {
      subId = await current.client.subscribe(
        EventTopic.Transaction,
        callback,
        // The validator filter key is `program_ids` (snake_case);
        // the SDK passes our object straight through to the wire.
        { program_ids: [lower] },
      );
    } catch (err) {
      console.warn('[ws] transaction subscribe failed', err);
      return () => {
        cancelled = true;
      };
    }

    return () => {
      cancelled = true;
      if (subId && slot === current) {
        current.client.unsubscribeById(subId).catch(() => {
          /* ignore */
        });
      }
    };
  };

  return {
    status: snap.status,
    wsUrl: snap.wsUrl,
    error: snap.error,
    /** Bumps when the RPC URL switches, so consumers can reset state. */
    generation: snap.generation,
    subscribeAccount,
    subscribeProgramTransactions,
  };
}

export interface AccountUpdatePayload {
  account: string;
  transactionHash: string;
  blockHeight: number;
}

export interface TransactionStreamEvent {
  hash: string;
  status: 'queued' | 'processed' | 'failed';
  failure: string | null;
  programIds: string[];
  blockHeight: number;
  observedAt: number;
}
