import React, { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { Server, Key, Lock, Loader2, Wifi, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Input } from '../../ui/input';
import { Button } from '../../ui/button';
import { SettingRow, SettingGroup } from '../SettingRow';
import { bitcoinRpcRequest } from '../../../api/bitcoin/rpc';
import type { Config } from '../../../types';

interface BitcoinSectionProps {
  config: Config;
  onConfigChange: Dispatch<SetStateAction<Config>>;
}

const debounce = <T extends (...args: any[]) => any>(fn: T, wait: number) => {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const debounced = (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), wait);
  };
  debounced.cancel = () => {
    if (timeout) clearTimeout(timeout);
    timeout = null;
  };
  return debounced;
};

export const BitcoinSection: React.FC<BitcoinSectionProps> = ({ config, onConfigChange }) => {
  const isDevnet = config.network === 'devnet';
  const [status, setStatus] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [statusMessage, setStatusMessage] = useState<string>('');

  const probe = useCallback(async () => {
    setStatus('testing');
    setStatusMessage('');
    try {
      const response = await bitcoinRpcRequest(config.regtestConfig, 'getblockcount');
      if (response.result !== undefined) {
        setStatus('success');
        setStatusMessage(`Block count: ${response.result}`);
      } else {
        setStatus('error');
        setStatusMessage(response.error?.message || 'Empty response from Bitcoin node.');
      }
    } catch (err) {
      setStatus('error');
      setStatusMessage(err instanceof Error ? err.message : String(err));
    }
  }, [config.regtestConfig]);

  const debouncedProbe = useCallback(debounce(probe, 800), [probe]);

  useEffect(() => () => debouncedProbe.cancel?.(), [debouncedProbe]);

  const updateField = (field: 'url' | 'username' | 'password', value: string) => {
    onConfigChange((c) => ({
      ...c,
      regtestConfig: { ...c.regtestConfig, [field]: value },
    }));
    debouncedProbe();
  };

  if (!isDevnet) {
    return (
      <div className="rounded-lg bg-warning/10 border border-warning/30 p-4 flex items-start gap-3">
        <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0 mt-0.5" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Bitcoin RPC is only available on Devnet.</p>
          <p className="text-[11px] text-muted-foreground">
            Switch the network to <strong>Devnet</strong> in the Network tab to configure a regtest Bitcoin node.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <SettingGroup
        title="Bitcoin Regtest"
        description="Direct Bitcoin node interaction used for local development and tests."
      >
        <SettingRow
          label="Bitcoin RPC URL"
          description="HTTP(S) endpoint of your Bitcoin Core node."
          htmlFor="btc-rpc-url"
          vertical
        >
          <Input
            id="btc-rpc-url"
            value={config.regtestConfig?.url || ''}
            onChange={(e) => updateField('url', e.target.value)}
            placeholder="http://bitcoin-node.dev.aws.archnetwork.xyz:18443"
            className="h-8 text-xs"
            spellCheck={false}
          />
        </SettingRow>

        <SettingRow label="RPC username" htmlFor="btc-rpc-user" vertical>
          <div className="relative">
            <Key
              className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none"
              aria-hidden="true"
            />
            <Input
              id="btc-rpc-user"
              value={config.regtestConfig?.username || ''}
              onChange={(e) => updateField('username', e.target.value)}
              placeholder="bitcoin"
              className="h-8 text-xs pl-7"
              autoComplete="off"
              spellCheck={false}
            />
          </div>
        </SettingRow>

        <SettingRow label="RPC password" htmlFor="btc-rpc-pass" vertical>
          <div className="relative">
            <Lock
              className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none"
              aria-hidden="true"
            />
            <Input
              id="btc-rpc-pass"
              type="password"
              value={config.regtestConfig?.password || ''}
              onChange={(e) => updateField('password', e.target.value)}
              placeholder="••••••••"
              className="h-8 text-xs pl-7"
              autoComplete="off"
            />
          </div>
        </SettingRow>

        <div className="pt-3 space-y-2">
          <Button
            type="button"
            onClick={probe}
            disabled={status === 'testing'}
            variant="outline"
            size="sm"
            className="h-8 text-xs"
          >
            {status === 'testing' ? (
              <>
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" aria-hidden="true" />
                Testing…
              </>
            ) : (
              <>
                <Wifi className="mr-1.5 h-3 w-3" aria-hidden="true" />
                Test connection
              </>
            )}
          </Button>

          {status === 'success' && (
            <div className="flex items-center gap-2 text-[11px] text-success" role="status" aria-live="polite">
              <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
              <span>{statusMessage || 'Connection OK'}</span>
            </div>
          )}
          {status === 'error' && (
            <div
              className="flex items-start gap-2 text-[11px] text-danger"
              role="status"
              aria-live="polite"
            >
              <Server className="h-3 w-3 mt-0.5" aria-hidden="true" />
              <span className="break-words">{statusMessage}</span>
            </div>
          )}
        </div>
      </SettingGroup>
    </div>
  );
};

export default BitcoinSection;
