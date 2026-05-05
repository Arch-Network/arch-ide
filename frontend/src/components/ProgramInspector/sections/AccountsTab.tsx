import React, { useEffect, useMemo, useState } from 'react';
import { Buffer } from 'buffer/';
import {
  Search,
  Loader2,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  Database,
  Hash,
  CircleDollarSign,
  Wallet,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '../../ui/button';
import { Input } from '../../ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { RpcConnection } from '../../../utils/RpcConnection';
import { getSmartRpcUrl } from '../../../utils/smartRpcConnection';
import { parseAddress } from '../../../utils/idl/address';
import {
  decodeAccountData,
  type DecodedAccount,
  type DecodedValue,
} from '../../../utils/idl/decode';
import { hexToBase58 } from '../../../utils/base58';
import type { ArchIdl } from '../../../types';
import type { Config } from '../../../types/config';

interface AccountsTabProps {
  idl: ArchIdl | null;
  config: Config;
  /** Pre-fill suggestions: program ID + authority pubkey + connected wallet, etc. */
  suggestions?: { label: string; address: string }[];
}

interface FetchedAccount {
  pubkey: Buffer;
  /** lamports / on-chain balance. */
  lamports: number;
  /** owner program pubkey. */
  owner: Buffer;
  /** raw account data (post any discriminator). */
  data: Buffer;
  /** is the account itself a deployed program? */
  isExecutable: boolean;
  /** Bitcoin UTXO ref (Arch-specific). */
  utxo: string;
}

type FetchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; account: FetchedAccount; decoded: DecodedAccount | null };

/**
 * Account Inspector.
 *
 * Lifecycle:
 *   1. User pastes / picks an address.
 *   2. We resolve it to a 32-byte pubkey via `parseAddress` (handles both
 *      base58 and hex with auto-detection).
 *   3. `read_account_info` RPC fetches the on-chain state.
 *   4. If an IDL is loaded, we attempt a best-effort scalar decode of the
 *      account data using the chosen account schema.
 *   5. Raw bytes are always shown for verification.
 */
export const AccountsTab: React.FC<AccountsTabProps> = ({ idl, config, suggestions }) => {
  const [address, setAddress] = useState('');
  const [accountTypeName, setAccountTypeName] = useState<string>('auto');
  const [state, setState] = useState<FetchState>({ status: 'idle' });

  const accountTypeOptions = useMemo(() => {
    if (!idl) return [] as string[];
    return idl.accounts.map((a) => a.name);
  }, [idl]);

  const fetchAccount = async () => {
    const parsed = parseAddress(address);
    if ('error' in parsed) {
      setState({ status: 'error', message: parsed.error });
      return;
    }
    setState({ status: 'loading' });

    try {
      // Direct JSON-RPC because the SDK's `readAccountInfo` occasionally returns
      // empty data for accounts whose contents come through the alternate
      // serialization path; the raw RPC response is the source of truth.
      const rpc = new RpcConnection(getSmartRpcUrl(config.rpcUrl));
      const raw = await rpc.request('read_account_info', Array.from(parsed.pubkey));
      if (!raw) {
        setState({ status: 'error', message: 'Account not found on this network.' });
        return;
      }

      const dataBuf = decodeAccountDataField(raw.data);
      const ownerBuf = Buffer.from(raw.owner ?? []);

      const account: FetchedAccount = {
        pubkey: parsed.pubkey,
        lamports: raw.lamports ?? 0,
        owner: ownerBuf,
        data: dataBuf,
        isExecutable: Boolean(raw.is_executable),
        utxo: raw.utxo ?? '',
      };

      const decoded = idl
        ? decodeAccountData(dataBuf, idl, {
            accountName: accountTypeName === 'auto' ? undefined : accountTypeName,
          })
        : null;

      setState({ status: 'success', account, decoded });
    } catch (err) {
      setState({
        status: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  // Re-decode when the user changes the IDL account type without re-fetching.
  useEffect(() => {
    setState((current) => {
      if (current.status !== 'success' || !idl) return current;
      const decoded = decodeAccountData(current.account.data, idl, {
        accountName: accountTypeName === 'auto' ? undefined : accountTypeName,
      });
      return { ...current, decoded };
    });
  }, [accountTypeName, idl]);

  return (
    <div className="space-y-3 px-3 py-3">
      <div className="space-y-2">
        <div className="flex items-center gap-2 bg-background/60 border border-border rounded-lg px-2.5 py-1.5 focus-within:ring-1 focus-within:ring-brand/50">
          <Search className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" aria-hidden="true" />
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (address.trim()) fetchAccount();
              }
            }}
            placeholder="Account address (base58 or hex)"
            aria-label="Account address"
            className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground outline-none font-mono"
            spellCheck={false}
          />
          <Button
            size="sm"
            className="h-6 text-[11px] px-2 bg-brand hover:bg-brand-hover text-brand-foreground"
            onClick={fetchAccount}
            disabled={state.status === 'loading' || !address.trim()}
          >
            {state.status === 'loading' ? (
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
            ) : (
              'Fetch'
            )}
          </Button>
        </div>

        {suggestions && suggestions.length > 0 && (
          <div className="flex flex-wrap items-center gap-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground/80 mr-1">
              Quick:
            </span>
            {suggestions.map((s) => (
              <button
                key={s.label}
                type="button"
                onClick={() => setAddress(s.address)}
                className="text-[10px] px-1.5 py-0.5 rounded bg-accent/60 hover:bg-accent text-foreground/80 hover:text-foreground transition-colors"
                title={s.address}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}

        {idl && accountTypeOptions.length > 1 && (
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted-foreground">Decode as</span>
            <Select value={accountTypeName} onValueChange={setAccountTypeName}>
              <SelectTrigger className="h-7 text-[11px] w-44 bg-background/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto</SelectItem>
                {accountTypeOptions.map((name) => (
                  <SelectItem key={name} value={name}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {state.status === 'error' && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-danger/30 bg-danger/10 px-3 py-2"
        >
          <AlertCircle className="h-3.5 w-3.5 text-danger flex-shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-[11px] text-danger break-words">{state.message}</p>
        </div>
      )}

      {state.status === 'success' && (
        <ResultPanel
          account={state.account}
          decoded={state.decoded}
          onRefetch={fetchAccount}
        />
      )}

      {state.status === 'idle' && (
        <p className="text-[11px] text-muted-foreground italic px-1">
          Paste an account address above and press Fetch (or Enter) to inspect on-chain state.
        </p>
      )}
    </div>
  );
};

interface ResultPanelProps {
  account: FetchedAccount;
  decoded: DecodedAccount | null;
  onRefetch: () => void;
}

const ResultPanel: React.FC<ResultPanelProps> = ({ account, decoded, onRefetch }) => {
  const ownerHex = account.owner.toString('hex');
  const ownerBase58 = hexToBase58(ownerHex);
  const dataHex = account.data.toString('hex');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          On-chain state
        </h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-[11px] px-2 text-muted-foreground hover:text-foreground"
          onClick={onRefetch}
        >
          <RefreshCw className="mr-1 h-3 w-3" aria-hidden="true" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <HeaderTile
          icon={<CircleDollarSign className="h-3 w-3" aria-hidden="true" />}
          label="Lamports"
          value={account.lamports.toLocaleString()}
        />
        <HeaderTile
          icon={<Wallet className="h-3 w-3" aria-hidden="true" />}
          label="Executable"
          value={account.isExecutable ? 'Yes' : 'No'}
          tone={account.isExecutable ? 'brand' : 'muted'}
        />
        <HeaderTile
          icon={<Database className="h-3 w-3" aria-hidden="true" />}
          label="Data size"
          value={`${account.data.length} B`}
        />
        <HeaderTile
          icon={<Hash className="h-3 w-3" aria-hidden="true" />}
          label="UTXO"
          value={account.utxo || '—'}
          mono
        />
      </div>

      <CopyableField label="Owner" value={ownerBase58} hint={ownerHex} />

      {decoded && decoded.account ? (
        <DecodedFields decoded={decoded} />
      ) : (
        <div className="rounded-lg border border-dashed border-border bg-surface-2/40 px-3 py-2.5">
          <p className="text-[11px] text-muted-foreground">
            {decoded
              ? 'No matching IDL account schema. Choose one in the "Decode as" picker.'
              : 'Import an IDL to decode account fields.'}
          </p>
        </div>
      )}

      <RawBytes data={dataHex} length={account.data.length} />
    </div>
  );
};

const DecodedFields: React.FC<{ decoded: DecodedAccount }> = ({ decoded }) => {
  return (
    <div className="rounded-lg border border-border bg-surface-2/40">
      <header className="flex items-center justify-between px-3 py-1.5 border-b border-border/60">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {decoded.account?.name} fields
        </span>
        {decoded.discriminatorLength > 0 && (
          <span className="text-[10px] text-muted-foreground/70">
            disc: {decoded.discriminatorLength}B skipped
          </span>
        )}
      </header>
      <ul role="list" className="divide-y divide-border/40">
        {decoded.fields.map((field) => (
          <li
            key={`${field.name}-${field.offset}`}
            className="px-3 py-1.5 text-xs"
          >
            <div className="grid grid-cols-[1fr_auto] gap-2 items-start">
              <div className="min-w-0">
                <div className="font-mono text-foreground/90 truncate">{field.name}</div>
                <div className="text-[10px] text-muted-foreground font-mono">
                  {field.type}
                  <span className="ml-2 text-muted-foreground/70">@ {field.offset}</span>
                </div>
              </div>
              <div className="font-mono text-[11px] text-foreground/90 text-right break-all max-w-[260px]">
                {isInlineValue(field.value) ? (
                  <ValueNode value={field.value} />
                ) : null}
              </div>
            </div>
            {!isInlineValue(field.value) && (
              <div className="mt-1.5 pl-2 border-l border-border/60">
                <ValueNode value={field.value} />
              </div>
            )}
          </li>
        ))}
      </ul>
      {decoded.truncated && (
        <p className="px-3 py-1.5 text-[10px] text-muted-foreground border-t border-border/60">
          Decoder stopped at the first unsupported type. Remaining{' '}
          {decoded.remainder.length} bytes shown below.
        </p>
      )}
    </div>
  );
};

/**
 * Compact one-line values render inline in the right column. Anything
 * that's a container (struct/vec/array/tuple/option-with-payload) gets
 * pushed onto its own indented block so we never have a single grid
 * cell trying to render a tree.
 */
const isInlineValue = (v: DecodedValue): boolean => {
  switch (v.kind) {
    case 'scalar':
    case 'string':
    case 'bytes':
    case 'unsupported':
      return true;
    case 'option':
      return !v.present;
    case 'enum':
      return !v.data;
    case 'vec':
      return v.length === 0;
    case 'array':
      return v.length === 0;
    case 'struct':
      return v.fields.length === 0;
    case 'tuple':
      return v.items.length === 0;
  }
};

/**
 * Recursive renderer for a `DecodedValue`. Containers indent with a
 * left border so nested structs read like a tree without tipping into
 * full-blown JSON syntax (which would visually clash with the rest of
 * the inspector).
 */
const ValueNode: React.FC<{ value: DecodedValue }> = ({ value }) => {
  switch (value.kind) {
    case 'scalar':
      return <span>{value.value}</span>;
    case 'string':
      return (
        <span title={value.value}>
          "{truncate(value.value, 64)}"
          <span className="ml-1 text-[10px] text-muted-foreground">({value.bytes}B)</span>
        </span>
      );
    case 'bytes':
      return (
        <span>
          {value.preview}
          <span className="ml-1 text-[10px] text-muted-foreground">({value.length}B)</span>
        </span>
      );
    case 'unsupported':
      return <span className="text-muted-foreground italic">{value.reason}</span>;
    case 'option':
      if (!value.present) {
        return <span className="text-muted-foreground italic">None</span>;
      }
      return (
        <div className="space-y-0.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Some</span>
          <div className="pl-2 border-l border-border/60">
            <ValueNode value={value.inner!} />
          </div>
        </div>
      );
    case 'enum':
      return (
        <div className="space-y-0.5">
          <span className="text-foreground/90">{value.variant}</span>
          {value.data && (
            <div className="pl-2 border-l border-border/60">
              <ValueNode value={value.data} />
            </div>
          )}
        </div>
      );
    case 'vec':
    case 'array': {
      if (value.length === 0) {
        return <span className="text-muted-foreground">[] ({value.itemType})</span>;
      }
      return (
        <ol
          className="space-y-0.5 list-none"
          aria-label={`${value.length} items`}
        >
          {value.items.map((item, i) => (
            <li key={i} className="grid grid-cols-[2.25rem_1fr] gap-2">
              <span className="text-[10px] text-muted-foreground tabular-nums">[{i}]</span>
              <ValueNode value={item} />
            </li>
          ))}
        </ol>
      );
    }
    case 'tuple':
      if (value.items.length === 0) {
        return <span className="text-muted-foreground">()</span>;
      }
      return (
        <ol className="space-y-0.5 list-none">
          {value.items.map((item, i) => (
            <li key={i} className="grid grid-cols-[2.25rem_1fr] gap-2">
              <span className="text-[10px] text-muted-foreground tabular-nums">.{i}</span>
              <ValueNode value={item} />
            </li>
          ))}
        </ol>
      );
    case 'struct':
      if (value.fields.length === 0) {
        return <span className="text-muted-foreground">{value.name} {'{}'}</span>;
      }
      return (
        <dl className="space-y-0.5 list-none">
          {value.fields.map((f) => (
            <div key={f.name} className="grid grid-cols-[1fr_auto] gap-2">
              <dt className="text-foreground/85 truncate" title={`${f.name}: ${f.type}`}>
                {f.name}
              </dt>
              <dd className="text-right break-all max-w-[180px]">
                {isInlineValue(f.value) ? (
                  <ValueNode value={f.value} />
                ) : (
                  <details className="text-left">
                    <summary className="cursor-pointer text-muted-foreground hover:text-foreground text-[10px]">
                      expand
                    </summary>
                    <div className="mt-1 pl-2 border-l border-border/60">
                      <ValueNode value={f.value} />
                    </div>
                  </details>
                )}
              </dd>
            </div>
          ))}
        </dl>
      );
  }
};

const truncate = (s: string, n: number): string =>
  s.length > n ? s.slice(0, n) + '…' : s;

const HeaderTile: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: 'brand' | 'muted';
  mono?: boolean;
}> = ({ icon, label, value, tone, mono }) => (
  <div className="rounded-lg border border-border bg-surface-2/30 px-2.5 py-1.5">
    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
      {icon}
      {label}
    </div>
    <div
      className={cn(
        'text-xs mt-0.5 truncate',
        mono && 'font-mono',
        tone === 'brand' && 'text-brand',
        tone === 'muted' && 'text-muted-foreground',
        !tone && 'text-foreground/90',
      )}
      title={value}
    >
      {value}
    </div>
  </div>
);

const CopyableField: React.FC<{ label: string; value: string; hint?: string }> = ({
  label,
  value,
  hint,
}) => {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <div className="rounded-lg border border-border bg-surface-2/30 px-3 py-2 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
        <button
          type="button"
          onClick={copy}
          className="hover:bg-accent rounded p-1 transition-colors"
          aria-label={`Copy ${label.toLowerCase()}`}
        >
          {copied ? (
            <Check className="h-3 w-3 text-success" aria-hidden="true" />
          ) : (
            <Copy className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
          )}
        </button>
      </div>
      <div className="font-mono text-[11px] text-foreground/90 break-all">{value}</div>
      {hint && (
        <div className="font-mono text-[10px] text-muted-foreground/70 break-all">{hint}</div>
      )}
    </div>
  );
};

const RawBytes: React.FC<{ data: string; length: number }> = ({ data, length }) => {
  const [open, setOpen] = useState(false);
  const formatted = useMemo(() => formatHexDump(data), [data]);
  return (
    <div className="rounded-lg border border-border bg-surface-2/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-accent/30 rounded-t-lg transition-colors text-left"
      >
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Raw bytes ({length})
        </span>
        <span className="text-[10px] text-muted-foreground">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open && (
        <pre className="px-3 py-2 border-t border-border/60 text-[10px] font-mono text-muted-foreground whitespace-pre-wrap break-all max-h-64 overflow-y-auto custom-scrollbar">
          {formatted || '(empty)'}
        </pre>
      )}
    </div>
  );
};

/**
 * Account data on the wire can come in several shapes: a raw `number[]`,
 * an object with a `data` field, or already a Buffer. Normalize to a Buffer.
 */
const decodeAccountDataField = (raw: unknown): Buffer => {
  if (!raw) return Buffer.alloc(0);
  if (Buffer.isBuffer(raw)) return raw;
  if (Array.isArray(raw)) return Buffer.from(raw as number[]);
  if (typeof raw === 'object') {
    const inner = (raw as { data?: unknown; value?: unknown }).data
      ?? (raw as { data?: unknown; value?: unknown }).value;
    if (Array.isArray(inner)) return Buffer.from(inner as number[]);
  }
  return Buffer.alloc(0);
};

/**
 * Simple 16-byte / line hex dump. We intentionally don't render an ASCII
 * column — it tends to be noise for compiled program data.
 */
const formatHexDump = (hex: string): string => {
  if (!hex) return '';
  const bytes = hex.match(/.{1,2}/g) ?? [];
  const lines: string[] = [];
  for (let i = 0; i < bytes.length; i += 16) {
    const chunk = bytes.slice(i, i + 16);
    const offset = i.toString(16).padStart(6, '0');
    lines.push(`${offset}  ${chunk.join(' ')}`);
  }
  return lines.join('\n');
};

export default AccountsTab;
