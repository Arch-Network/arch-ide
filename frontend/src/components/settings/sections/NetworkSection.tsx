import React, { useState, type Dispatch, type SetStateAction } from 'react';
import { Globe, Server, Wifi, Loader2, HelpCircle } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { Input } from '../../ui/input';
import { Button } from '../../ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../ui/tooltip';
import { SettingRow, SettingGroup } from '../SettingRow';
import { getSmartRpcUrl } from '../../../utils/smartRpcConnection';
import { RpcConnection } from '@arch-network/arch-sdk';
import type { Config } from '../../../types';

interface NetworkSectionProps {
  config: Config;
  onConfigChange: Dispatch<SetStateAction<Config>>;
}

const PRESET_RPC_URLS = {
  mainnet: 'https://rpc.mainnet.arch.network',
  testnet: 'https://rpc.testnet.arch.network',
  devnet: 'http://localhost:9002',
  custom: '',
};

type PresetKey = keyof typeof PRESET_RPC_URLS;

const computePreset = (rpcUrl: string): PresetKey => {
  const match = (Object.entries(PRESET_RPC_URLS) as [PresetKey, string][]).find(
    ([, url]) => url === rpcUrl,
  );
  return match ? match[0] : 'custom';
};

export const NetworkSection: React.FC<NetworkSectionProps> = ({ config, onConfigChange }) => {
  const [rpcPreset, setRpcPreset] = useState<PresetKey>(() => computePreset(config.rpcUrl));
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const smartUrl = getSmartRpcUrl(config.rpcUrl);
      const connection = new RpcConnection(smartUrl);
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Connection timeout after 8 seconds')), 8000),
      );
      const blockCount = (await Promise.race([connection.getBlockCount(), timeout])) as number;
      if (typeof blockCount !== 'number' || Number.isNaN(blockCount)) {
        throw new Error('Invalid block count response');
      }
      setTestResult({ success: true, message: `Connected — block height: ${blockCount}` });
    } catch (err) {
      setTestResult({
        success: false,
        message: `Failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div>
      <SettingGroup
        title="Network"
        description="Choose the Arch Network you want to build, deploy, and test against."
      >
        <SettingRow
          label="Network"
          description="Mainnet for production, testnet for staging, devnet for local."
          htmlFor="network-select"
        >
          <Select
            value={config.network}
            onValueChange={(value) => onConfigChange((c) => ({ ...c, network: value as Config['network'] }))}
          >
            <SelectTrigger id="network-select" className="h-8 w-44 text-xs bg-background/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mainnet">Mainnet</SelectItem>
              <SelectItem value="testnet">Testnet</SelectItem>
              <SelectItem value="devnet">Devnet</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="RPC Server" description="Endpoint used by the editor for build, deploy, and reads.">
        <SettingRow
          label={
            <span className="inline-flex items-center gap-1.5">
              RPC preset
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="text-muted-foreground/70 hover:text-muted-foreground"
                      aria-label="RPC server help"
                    >
                      <HelpCircle className="h-3 w-3" aria-hidden="true" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs text-xs">
                    Mainnet: production · Testnet: staging · Devnet: localhost:9002 · Custom: your own.
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </span>
          }
          description="Switching a preset auto-fills the RPC URL and matching network."
        >
          <Select
            value={rpcPreset}
            onValueChange={(value) => {
              const preset = value as PresetKey;
              setRpcPreset(preset);
              if (preset !== 'custom') {
                onConfigChange((c) => ({
                  ...c,
                  rpcUrl: PRESET_RPC_URLS[preset],
                  network: preset as 'mainnet' | 'testnet' | 'devnet',
                }));
              }
            }}
          >
            <SelectTrigger className="h-8 w-44 text-xs bg-background/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="mainnet">Mainnet</SelectItem>
              <SelectItem value="testnet">Testnet</SelectItem>
              <SelectItem value="devnet">Local (localhost:9002)</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
        </SettingRow>

        <SettingRow
          label="RPC URL"
          description="Editable directly when 'Custom' is selected."
          htmlFor="rpc-url-input"
          vertical
        >
          <Input
            id="rpc-url-input"
            value={config.rpcUrl}
            onChange={(e) => {
              onConfigChange((c) => ({ ...c, rpcUrl: e.target.value }));
              setRpcPreset(computePreset(e.target.value));
            }}
            placeholder="https://your-rpc-server.com"
            className="h-8 text-xs"
            spellCheck={false}
          />
        </SettingRow>

        <div className="pt-2 space-y-2">
          <Button
            type="button"
            onClick={testConnection}
            disabled={testing || !config.rpcUrl}
            variant="outline"
            size="sm"
            className="h-8 text-xs"
          >
            {testing ? (
              <>
                <Loader2 className="mr-1.5 h-3 w-3 animate-spin" aria-hidden="true" />
                Testing connection…
              </>
            ) : (
              <>
                <Wifi className="mr-1.5 h-3 w-3" aria-hidden="true" />
                Test connection
              </>
            )}
          </Button>
          {testResult && (
            <div
              role="status"
              aria-live="polite"
              className={`flex items-start gap-2 px-2.5 py-1.5 rounded-md text-[11px] border ${
                testResult.success
                  ? 'bg-success/10 text-success border-success/30'
                  : 'bg-danger/10 text-danger border-danger/30'
              }`}
            >
              {testResult.success ? (
                <Globe className="h-3 w-3 mt-0.5" aria-hidden="true" />
              ) : (
                <Server className="h-3 w-3 mt-0.5" aria-hidden="true" />
              )}
              <span className="break-words">{testResult.message}</span>
            </div>
          )}
        </div>
      </SettingGroup>
    </div>
  );
};

export default NetworkSection;
