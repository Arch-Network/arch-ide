import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  History,
  ExternalLink,
  Repeat2,
  Trash2,
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Activity,
  XCircle,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '../../ui/button';
import { getExplorerUrls } from '../../../utils/explorerLinks';
import {
  fetchProgramTransactions,
  isExplorerApiAvailable,
  type ExplorerTransaction,
  type ExplorerTxStatus,
} from '../../../utils/explorerApi';
import { decodeProgramError } from '../../../utils/idl/decodeError';
import {
  useArchWebSocket,
  type TransactionStreamEvent,
} from '../../../hooks/useArchWebSocket';
import type {
  ArchIdl,
  InvokeHistoryEntry,
  Project,
} from '../../../types';
import type { Config } from '../../../types/config';
import type { ProjectMutations } from '../projectMutations';

interface HistoryTabProps {
  idl: ArchIdl | null;
  project: Project | null;
  config: Config;
  mutations: ProjectMutations;
  /**
   * Replay handler — repopulates the Invoke form with the entry's
   * payload and switches the inspector to the Invoke tab. The
   * inspector owns tab state, so it passes this in.
   */
  onReplay: (entry: InvokeHistoryEntry) => void;
}

/** Cap on the in-memory live feed — old events fall off the bottom. */
const LIVE_FEED_CAP = 25;

/**
 * Per-project transaction history view.
 *
 * Each entry collapses to a one-line summary (icon, instruction
 * name, time, txid stub) and expands to show resolved accounts and
 * the encoded data hex. We keep the rendering deliberately dense —
 * users come here to scan recent attempts, not to browse a long
 * archive — and we cap storage at 50 entries on the persistence
 * side so this list stays scrollable without virtualization.
 */
export const HistoryTab: React.FC<HistoryTabProps> = ({
  idl,
  project,
  config,
  mutations,
  onReplay,
}) => {
  const history = project?.invokeHistory ?? [];
  const programIdHex = project?.account?.pubkey ?? null;
  const liveFeed = useProgramTxStream(config.rpcUrl, programIdHex);

  if (!project) {
    return (
      <div className="px-4 py-6 text-center text-xs text-muted-foreground">
        Open a project to see invocation history.
      </div>
    );
  }

  return (
    <div className="space-y-3 px-3 py-3">
      <LiveFeedPanel
        status={liveFeed.status}
        events={liveFeed.events}
        network={config.network}
        hasProgram={!!programIdHex}
      />

      <OnChainHistoryPanel network={config.network} programIdHex={programIdHex} />

      {history.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
          <History className="h-5 w-5 text-muted-foreground/50" aria-hidden="true" />
          <p className="text-xs text-muted-foreground">
            No local history yet. Submit an instruction from the Invoke tab to track your own attempts here.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              {history.length} local {history.length === 1 ? 'entry' : 'entries'}
            </span>
            <button
              type="button"
              onClick={() => mutations.clearInvokeHistory()}
              className="text-[10px] text-muted-foreground hover:text-danger transition-colors"
              aria-label="Clear all history entries"
            >
              Clear all
            </button>
          </div>

          <ul className="space-y-1.5" role="list">
            {history.map((entry) => (
              <HistoryRow
                key={entry.id}
                entry={entry}
                idl={idl}
                onReplay={() => onReplay(entry)}
                onRemove={() => mutations.removeInvokeHistoryEntry(entry.id)}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

/**
 * Owns a tiny ring buffer of `TransactionEvent`s observed for the
 * given program. Events come from any source (this client or
 * anyone else hitting the network), so the panel doubles as a
 * "live program activity" tail that's especially useful when
 * watching a program respond to external traffic.
 *
 * - Buffer is in-memory only; this is intentional, since the
 *   persisted history already records *our* submissions and we
 *   don't want to spam IndexedDB with every observed tx.
 * - Cancels and re-subscribes when the program ID or the WS
 *   client itself changes (e.g. RPC switch).
 */
const useProgramTxStream = (
  rpcUrl: string,
  programIdHex: string | null,
): {
  status: ReturnType<typeof useArchWebSocket>['status'];
  events: TransactionStreamEvent[];
} => {
  const ws = useArchWebSocket(rpcUrl);
  const [events, setEvents] = useState<TransactionStreamEvent[]>([]);

  useEffect(() => {
    if (!programIdHex) return;
    let unsubscribe: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      const dispose = await ws.subscribeProgramTransactions(programIdHex, (evt) => {
        setEvents((prev) => {
          // Dedupe by hash — the validator can publish the same tx
          // through multiple confirmation paths under load.
          if (prev.some((p) => p.hash === evt.hash)) return prev;
          const next = [evt, ...prev];
          return next.length > LIVE_FEED_CAP ? next.slice(0, LIVE_FEED_CAP) : next;
        });
      });
      if (cancelled) {
        dispose();
        return;
      }
      unsubscribe = dispose;
    })();

    return () => {
      cancelled = true;
      if (unsubscribe) unsubscribe();
    };
    // Reset on program change so an old program's tail doesn't
    // bleed into the new one's panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [programIdHex, ws.generation]);

  // Clear the feed when the program switches, so users don't see
  // stale events attributed to the new program.
  useEffect(() => {
    setEvents([]);
  }, [programIdHex, ws.generation]);

  return { status: ws.status, events };
};

/** How many indexed transactions to pull per page from the Explorer API. */
const ONCHAIN_PAGE_SIZE = 25;

/**
 * Loads a program's real transaction history from the Arch Explorer indexer.
 *
 * Unlike the live feed (in-memory, from the moment the tab opens) and the
 * persisted local history (only *our own* submissions), this is the program's
 * full on-chain record from Postgres — including transactions from other
 * clients and from before this IDE session existed.
 *
 * The indexer only covers canonical networks; on devnet (`available === false`)
 * the hook stays inert and the panel hides itself.
 */
const useProgramOnChainHistory = (
  network: string,
  programIdHex: string | null,
) => {
  const available = isExplorerApiAvailable(network);
  const [transactions, setTransactions] = useState<ExplorerTransaction[]>([]);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offsetRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(
    async (append: boolean) => {
      if (!programIdHex || !available) return;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      setError(null);

      try {
        const offset = append ? offsetRef.current : 0;
        const page = await fetchProgramTransactions(network, programIdHex, {
          limit: ONCHAIN_PAGE_SIZE,
          offset,
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;

        offsetRef.current = offset + page.transactions.length;
        setTotalCount(page.totalCount);
        setTransactions((prev) => {
          if (!append) return page.transactions;
          // Guard against overlap if new txs arrived between pages.
          const seen = new Set(prev.map((t) => t.txid));
          return [...prev, ...page.transactions.filter((t) => !seen.has(t.txid))];
        });
      } catch (e) {
        if (
          controller.signal.aborted ||
          (e instanceof DOMException && e.name === 'AbortError')
        ) {
          return;
        }
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [network, programIdHex, available],
  );

  // Reset and reload whenever the program or network changes.
  useEffect(() => {
    offsetRef.current = 0;
    setTransactions([]);
    setTotalCount(null);
    setError(null);
    if (programIdHex && available) {
      void load(false);
    }
    return () => abortRef.current?.abort();
  }, [programIdHex, network, available, load]);

  const hasMore =
    totalCount != null ? transactions.length < totalCount : false;

  return {
    available,
    transactions,
    totalCount,
    loading,
    error,
    hasMore,
    loadMore: () => load(true),
    refresh: () => load(false),
  };
};

interface OnChainHistoryPanelProps {
  network: Config['network'];
  programIdHex: string | null;
}

/**
 * Collapsible panel showing the deployed program's indexed transaction
 * history from the Arch Explorer. Hidden entirely when there's no deployed
 * program or the network isn't indexed, so it never adds noise on devnet.
 */
const OnChainHistoryPanel: React.FC<OnChainHistoryPanelProps> = ({
  network,
  programIdHex,
}) => {
  const {
    available,
    transactions,
    totalCount,
    loading,
    error,
    hasMore,
    loadMore,
    refresh,
  } = useProgramOnChainHistory(network, programIdHex);

  if (!programIdHex || !available) return null;

  const explorerUrls = getExplorerUrls(network);

  return (
    <section className="rounded-lg border border-border bg-surface-2/30">
      <header className="flex items-center justify-between gap-2 px-2.5 py-1.5 border-b border-border/60">
        <div className="flex items-center gap-2 min-w-0">
          <History className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            On-chain history
          </span>
          {totalCount != null && (
            <span className="text-[10px] text-muted-foreground/70 tabular-nums">
              {totalCount.toLocaleString()}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          aria-label="Refresh on-chain history"
          title="Refresh from Arch Explorer"
        >
          <RefreshCw
            className={cn('h-3 w-3', loading && 'animate-spin')}
            aria-hidden="true"
          />
        </button>
      </header>

      {error ? (
        <div className="px-3 py-3 text-[11px] text-danger">
          Couldn{'\u2019'}t load on-chain history: {error}
        </div>
      ) : transactions.length === 0 ? (
        <div className="px-3 py-3 text-[11px] text-muted-foreground italic">
          {loading
            ? 'Loading indexed transactions\u2026'
            : 'No indexed transactions for this program yet.'}
        </div>
      ) : (
        <>
          <ul role="list" className="divide-y divide-border/40">
            {transactions.map((tx) => (
              <li
                key={tx.txid}
                className="px-2.5 py-1.5 flex items-center gap-2 text-[11px]"
              >
                <OnChainStatusGlyph status={tx.status} />
                <code
                  className="flex-1 font-mono text-foreground/85 truncate"
                  title={tx.failure ?? tx.txid}
                >
                  {tx.txid}
                </code>
                {tx.blockHeight != null && (
                  <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                    #{tx.blockHeight}
                  </span>
                )}
                {tx.createdAt && (
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {formatRelativeIso(tx.createdAt)}
                  </span>
                )}
                {explorerUrls && (
                  <a
                    href={explorerUrls.tx(tx.txid)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand hover:text-brand-hover shrink-0"
                    aria-label="Open transaction in explorer"
                  >
                    <ExternalLink className="h-3 w-3" aria-hidden="true" />
                  </a>
                )}
              </li>
            ))}
          </ul>
          {hasMore && (
            <div className="border-t border-border/40 px-2.5 py-1.5">
              <button
                type="button"
                onClick={loadMore}
                disabled={loading}
                className="w-full text-[11px] text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
              >
                {loading ? 'Loading\u2026' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
};

const OnChainStatusGlyph: React.FC<{ status: ExplorerTxStatus }> = ({
  status,
}) => {
  switch (status) {
    case 'processed':
      return <CheckCircle2 className="h-3 w-3 text-success shrink-0" aria-hidden="true" />;
    case 'failed':
      return <XCircle className="h-3 w-3 text-danger shrink-0" aria-hidden="true" />;
    case 'unknown':
    default:
      return <Clock className="h-3 w-3 text-muted-foreground shrink-0" aria-hidden="true" />;
  }
};

interface LiveFeedPanelProps {
  status: ReturnType<typeof useArchWebSocket>['status'];
  events: TransactionStreamEvent[];
  network: Config['network'];
  hasProgram: boolean;
}

/**
 * Live feed of transactions observed touching the open program.
 *
 * Always visible (so the user knows the feed exists), but renders
 * different states depending on what the WS layer is doing:
 *
 *   - `connected` + events → list rolls in real time.
 *   - `connected` + empty   → "watching" with an explainer.
 *   - `connecting`/`disconnected`/`error` → status chip; we still
 *     show any historical events we already received before the
 *     drop, since they're useful to scroll back through.
 *   - `unsupported`         → quiet hint that this network's RPC
 *     doesn't expose a known WS endpoint, no error tone.
 *
 * The panel is intentionally separate from the persisted history
 * list below it: this is a live tail (in-memory, not stored), and
 * we don't want to mix authored vs observed entries.
 */
const LiveFeedPanel: React.FC<LiveFeedPanelProps> = ({
  status,
  events,
  network,
  hasProgram,
}) => {
  if (!hasProgram) return null;
  const explorerUrls = getExplorerUrls(network);

  return (
    <section className="rounded-lg border border-border bg-surface-2/30">
      <header className="flex items-center justify-between gap-2 px-2.5 py-1.5 border-b border-border/60">
        <div className="flex items-center gap-2 min-w-0">
          <Activity className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Live program activity
          </span>
        </div>
        <ConnectionPill status={status} />
      </header>

      {events.length === 0 ? (
        <div className="px-3 py-3 text-[11px] text-muted-foreground italic">
          {liveEmptyMessage(status)}
        </div>
      ) : (
        <ul role="list" className="divide-y divide-border/40">
          {events.map((evt) => (
            <li
              key={evt.hash}
              className="px-2.5 py-1.5 flex items-center gap-2 text-[11px]"
            >
              <StatusGlyph status={evt.status} />
              <code
                className="flex-1 font-mono text-foreground/85 truncate"
                title={evt.hash}
              >
                {evt.hash}
              </code>
              <span className="text-[10px] text-muted-foreground shrink-0 tabular-nums">
                #{evt.blockHeight}
              </span>
              <span className="text-[10px] text-muted-foreground shrink-0">
                {formatRelativeTime(evt.observedAt)}
              </span>
              {explorerUrls && (
                <a
                  href={explorerUrls.tx(evt.hash)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand hover:text-brand-hover shrink-0"
                  aria-label="Open transaction in explorer"
                >
                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

const liveEmptyMessage = (
  status: ReturnType<typeof useArchWebSocket>['status'],
): string => {
  switch (status) {
    case 'connected':
      return 'Watching for incoming transactions. None yet — invoke an instruction or have someone hit your program.';
    case 'connecting':
      return 'Connecting to the live event stream\u2026';
    case 'disconnected':
      return 'Live stream disconnected. Reconnecting automatically\u2026';
    case 'error':
      return 'Couldn\u2019t connect to the live event stream. Will retry in the background.';
    case 'unsupported':
      return 'Live updates aren\u2019t available on this RPC endpoint.';
    case 'idle':
    default:
      return 'Live event stream is starting\u2026';
  }
};

const ConnectionPill: React.FC<{
  status: ReturnType<typeof useArchWebSocket>['status'];
}> = ({ status }) => {
  const tone = pillTone(status);
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-wider',
        tone.cls,
      )}
      title={tone.title}
    >
      <span
        className={cn('h-1.5 w-1.5 rounded-full', tone.dot)}
        aria-hidden="true"
      />
      {tone.label}
    </span>
  );
};

const pillTone = (
  status: ReturnType<typeof useArchWebSocket>['status'],
): { label: string; cls: string; dot: string; title: string } => {
  switch (status) {
    case 'connected':
      return {
        label: 'live',
        cls: 'border-success/40 bg-success/10 text-success',
        dot: 'bg-success animate-pulse',
        title: 'Connected to the validator event stream',
      };
    case 'connecting':
      return {
        label: 'connecting',
        cls: 'border-warning/40 bg-warning/10 text-warning',
        dot: 'bg-warning animate-pulse',
        title: 'Establishing WebSocket connection',
      };
    case 'disconnected':
      return {
        label: 'reconnecting',
        cls: 'border-warning/40 bg-warning/10 text-warning',
        dot: 'bg-warning',
        title: 'Lost connection — automatic retry in progress',
      };
    case 'error':
      return {
        label: 'offline',
        cls: 'border-danger/40 bg-danger/10 text-danger',
        dot: 'bg-danger',
        title: 'Failed to connect to the event stream',
      };
    case 'unsupported':
      return {
        label: 'unavailable',
        cls: 'border-border bg-surface-1 text-muted-foreground',
        dot: 'bg-muted-foreground/40',
        title: 'No known WebSocket endpoint for this RPC',
      };
    case 'idle':
    default:
      return {
        label: 'idle',
        cls: 'border-border bg-surface-1 text-muted-foreground',
        dot: 'bg-muted-foreground/40',
        title: 'Live stream not yet started',
      };
  }
};

const StatusGlyph: React.FC<{ status: TransactionStreamEvent['status'] }> = ({
  status,
}) => {
  switch (status) {
    case 'processed':
      return <CheckCircle2 className="h-3 w-3 text-success shrink-0" aria-hidden="true" />;
    case 'failed':
      return <XCircle className="h-3 w-3 text-danger shrink-0" aria-hidden="true" />;
    case 'queued':
    default:
      return <Clock className="h-3 w-3 text-muted-foreground shrink-0" aria-hidden="true" />;
  }
};

interface HistoryRowProps {
  entry: InvokeHistoryEntry;
  idl: ArchIdl | null;
  onReplay: () => void;
  onRemove: () => void;
}

const HistoryRow: React.FC<HistoryRowProps> = ({ entry, idl, onReplay, onRemove }) => {
  const [expanded, setExpanded] = useState(false);
  const isSuccess = entry.outcome.kind === 'success';
  const explorerUrls = getExplorerUrls(entry.network);
  const explorerTxUrl =
    isSuccess && explorerUrls
      ? explorerUrls.tx(entry.outcome.txid)
      : null;

  const knownInstruction = !!idl?.instructions.some((i) => i.name === entry.instruction);

  return (
    <li
      className={cn(
        'rounded-md border bg-surface-2/30',
        isSuccess ? 'border-border' : 'border-danger/40',
      )}
    >
      <header className="flex items-center gap-2 px-2 py-1.5">
        <button
          type="button"
          onClick={() => setExpanded((s) => !s)}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label={expanded ? 'Collapse entry' : 'Expand entry'}
          aria-expanded={expanded}
        >
          {expanded ? (
            <ChevronDown className="h-3 w-3" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
          )}
        </button>

        {isSuccess ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" />
        ) : (
          <AlertCircle className="h-3.5 w-3.5 text-danger" aria-hidden="true" />
        )}

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-mono text-foreground/90 truncate" title={entry.instruction}>
              {entry.instruction}
            </span>
            <span className="text-[10px] text-muted-foreground shrink-0">
              {formatRelativeTime(entry.submittedAt)}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70 shrink-0">
              {entry.network}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-1.5 text-[10px]"
            onClick={onReplay}
            disabled={!knownInstruction}
            title={
              knownInstruction
                ? 'Repopulate the Invoke form with these values'
                : 'Instruction no longer in IDL — cannot replay'
            }
          >
            <Repeat2 className="h-3 w-3 mr-1" aria-hidden="true" />
            Re-run
          </Button>
          <button
            type="button"
            onClick={onRemove}
            className="p-1 text-muted-foreground hover:text-danger transition-colors"
            aria-label="Remove entry"
          >
            <Trash2 className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      </header>

      {expanded && (
        <div className="border-t border-border/40 px-2 py-1.5 space-y-1.5">
          {isSuccess ? (
            <SuccessDetails entry={entry} explorerTxUrl={explorerTxUrl} />
          ) : (
            <ErrorDetails message={entry.outcome.message} idl={idl} />
          )}
          {entry.accounts && entry.accounts.length > 0 && (
            <div className="space-y-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Accounts
              </span>
              <ul className="space-y-0.5 list-none">
                {entry.accounts.map((a) => (
                  <li key={a.name} className="grid grid-cols-[auto_1fr] gap-2 text-[10px] font-mono">
                    <span className="text-muted-foreground/80 truncate" title={a.name}>
                      {a.name}
                    </span>
                    <span
                      className="text-foreground/80 break-all truncate"
                      title={a.pubkey}
                    >
                      {a.pubkey}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {entry.encodedDataHex && (
            <div className="space-y-0.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Encoded data
              </span>
              <code className="block text-[10px] font-mono text-foreground/70 break-all">
                {entry.encodedDataHex}
              </code>
            </div>
          )}
        </div>
      )}
    </li>
  );
};

const SuccessDetails: React.FC<{
  entry: InvokeHistoryEntry;
  explorerTxUrl: string | null;
}> = ({ entry, explorerTxUrl }) => {
  if (entry.outcome.kind !== 'success') return null;
  return (
    <div className="space-y-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        Tx
      </span>
      <div className="flex items-center gap-2 text-[10px] font-mono">
        <span className="text-foreground/80 break-all flex-1 truncate" title={entry.outcome.txid}>
          {entry.outcome.txid}
        </span>
        {explorerTxUrl && (
          <a
            href={explorerTxUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand hover:text-brand-hover shrink-0 inline-flex items-center gap-0.5"
            aria-label="Open transaction in explorer"
          >
            <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </a>
        )}
      </div>
    </div>
  );
};

/**
 * Renders the failure outcome of a history entry.
 *
 * The submit pipeline joins multiple errors with " • " before
 * persisting (see `InvokeTab.SubmitPanel.handleSubmit`), so we split
 * them back out and decode each independently against the IDL. A
 * matched program error gets a structured row (name, code, msg),
 * while plain errors render as-is. This mirrors the live submission
 * panel so re-runs and historical entries read consistently.
 */
const ErrorDetails: React.FC<{
  message: string;
  idl: ArchIdl | null;
}> = ({ message, idl }) => {
  const lines = message
    .split(' • ')
    .map((s) => s.trim())
    .filter(Boolean);
  const decoded = lines.map((line) => decodeProgramError(line, idl));
  return (
    <div className="space-y-0.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-danger/80">
        Error
      </span>
      <ul className="space-y-1">
        {decoded.map((d, i) => (
          <li key={i} className="text-[11px] text-danger flex items-start gap-1">
            <span aria-hidden="true">•</span>
            {d.matched && d.match ? (
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-1.5 flex-wrap">
                  <span className="font-mono font-semibold">{d.match.name}</span>
                  <span className="text-danger/70">code {d.code}</span>
                </div>
                <p className="text-foreground/85 break-words">{d.match.msg}</p>
                {d.raw !== d.pretty && (
                  <details className="mt-0.5">
                    <summary className="cursor-pointer text-[10px] text-muted-foreground hover:text-foreground">
                      raw
                    </summary>
                    <pre className="mt-0.5 text-[10px] text-muted-foreground font-mono whitespace-pre-wrap break-all">
                      {d.raw}
                    </pre>
                  </details>
                )}
              </div>
            ) : (
              <span className="break-words">{d.pretty}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
};

/**
 * Lightweight relative-time formatter for entry timestamps. We avoid
 * pulling in a full i18n library — the inspector only needs three
 * granularities ("now", "Xm/Xh/Xd ago", absolute date for >=7d).
 */
const formatRelativeTime = (ts: number): string => {
  const delta = Date.now() - ts;
  const sec = Math.floor(delta / 1000);
  if (sec < 30) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
};

/** Same relative formatter, but for the indexer's ISO-8601 timestamps. */
const formatRelativeIso = (iso: string): string => {
  const ms = Date.parse(iso);
  return Number.isNaN(ms) ? '' : formatRelativeTime(ms);
};

export default HistoryTab;
