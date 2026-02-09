import React, { useState, Dispatch, SetStateAction, useCallback, useEffect } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./ui/select";
import { Switch } from "./ui/switch";
import { Label } from "./ui/label";
import { X, Globe, Server, Key, Lock, Eye, AlertTriangle, Coins, Loader2, Wifi, HelpCircle } from 'lucide-react';
import { Button } from './ui/button';
import { Input } from './ui/input';
import type { Config } from '../types';
import { bitcoinRpcRequest } from '../api/bitcoin/rpc';
import { getSmartRpcUrl } from '../utils/smartRpcConnection';
import { RpcConnection } from '@saturnbtcio/arch-sdk';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

interface ConfigPanelProps {
  isOpen: boolean;
  onClose: () => void;
  config: Config;
  onConfigChange: Dispatch<SetStateAction<Config>>;
}

const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): {
  (...args: Parameters<T>): void;
  cancel: () => void;
} => {
  let timeout: NodeJS.Timeout | null = null;

  const debounced = (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };

  debounced.cancel = () => {
    if (timeout) {
      clearTimeout(timeout);
      timeout = null;
    }
  };

  return debounced;
};

const PRESET_RPC_URLS = {
  'mainnet': 'https://rpc.mainnet.arch.network',
  'testnet': 'https://rpc.testnet.arch.network',
  'devnet': 'http://localhost:9002',
  'custom': ''
};

// ── Sub-components ──────────────────────────────────────────

const SectionLabel: React.FC<{ icon: React.ReactNode; children: React.ReactNode }> = ({ icon, children }) => (
  <div className="flex items-center gap-2 mb-4">
    <span className="text-gray-500">{icon}</span>
    <h4 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{children}</h4>
  </div>
);

const FieldLabel: React.FC<{ icon?: React.ReactNode; children: React.ReactNode; extra?: React.ReactNode }> = ({ icon, children, extra }) => (
  <div className="flex items-center justify-between">
    <Label className="flex items-center gap-2 text-xs text-gray-400">
      {icon && <span className="text-gray-500">{icon}</span>}
      {children}
    </Label>
    {extra}
  </div>
);

const SettingRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}> = ({ icon, label, description, checked, onCheckedChange }) => (
  <div className="flex items-center justify-between py-3 px-3.5 rounded-lg bg-gray-900/40 border border-gray-800/60 hover:border-gray-700/60 transition-colors">
    <div className="flex items-center gap-3 min-w-0">
      <span className="text-gray-500 shrink-0">{icon}</span>
      <div className="min-w-0">
        <Label className="text-[13px] text-gray-200">{label}</Label>
        <p className="text-[11px] text-gray-500 mt-0.5">{description}</p>
      </div>
    </div>
    <Switch
      checked={checked}
      onCheckedChange={onCheckedChange}
      className="shrink-0 ml-3"
    />
  </div>
);

// ── Main component ──────────────────────────────────────────

export const ConfigPanel = ({ isOpen, onClose, config, onConfigChange }: ConfigPanelProps) => {
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{success: boolean, message: string} | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<'none' | 'success' | 'error'>('none');
  const [rpcPreset, setRpcPreset] = useState<string>(() => {
    const currentUrl = config.rpcUrl;
    const preset = Object.entries(PRESET_RPC_URLS).find(([_, url]) => url === currentUrl)?.[0];
    return preset || 'custom';
  });

  const debouncedTestBitcoinConnection = useCallback(
    debounce(async () => {
      setTestingConnection(true);
      setConnectionStatus('none');
      try {
        const response = await bitcoinRpcRequest(config.regtestConfig, 'getblockcount');
        setConnectionStatus(response.result !== undefined ? 'success' : 'error');
      } catch (error) {
        setConnectionStatus('error');
      } finally {
        setTestingConnection(false);
      }
    }, 1000),
    [config.regtestConfig]
  );

  const debouncedTestMainConnection = useCallback(
    debounce(async () => {}, 1000),
    [config.rpcUrl]
  );

  const handleRegtestChange = (field: 'url' | 'username' | 'password', value: string) => {
    onConfigChange(prevConfig => ({
      ...prevConfig,
      regtestConfig: {
        ...prevConfig.regtestConfig,
        [field]: value
      }
    }));
    debouncedTestBitcoinConnection();
  };

  const handleRpcUrlChange = (value: string) => {
    onConfigChange(prevConfig => ({
      ...prevConfig,
      rpcUrl: value
    }));
    debouncedTestMainConnection();
  };

  useEffect(() => {
    return () => {
      debouncedTestBitcoinConnection.cancel?.();
      debouncedTestMainConnection.cancel?.();
    };
  }, [debouncedTestBitcoinConnection, debouncedTestMainConnection]);

  const testConnection = async () => {
    setTestingConnection(true);
    setTestResult(null);

    try {
      const smartUrl = getSmartRpcUrl(config.rpcUrl);
      const connection = new RpcConnection(smartUrl);

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout after 8 seconds')), 8000);
      });

      const blockCount = await Promise.race([
        connection.getBlockCount(),
        timeoutPromise
      ]) as number;

      if (typeof blockCount !== 'number' || isNaN(blockCount)) {
        throw new Error('Invalid block count response');
      }

      setTestResult({
        success: true,
        message: `Connected — Block height: ${blockCount}`
      });
    } catch (error) {
      setTestResult({
        success: false,
        message: `Failed: ${error instanceof Error ? error.message : String(error)}`
      });
    } finally {
      setTestingConnection(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-[#141414] border border-gray-800/60 rounded-xl shadow-2xl w-[520px] max-h-[80vh] overflow-y-auto custom-scrollbar">
        {/* Header */}
        <div className="flex justify-between items-center px-6 py-4 border-b border-gray-800/60">
          <h3 className="text-sm font-semibold text-gray-200 tracking-wide">Settings</h3>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-7 w-7 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800/60"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="p-6 space-y-8">
          {/* ── Network Settings ─────────────────────────── */}
          <div>
            <SectionLabel icon={<Globe className="h-3.5 w-3.5" />}>Network</SectionLabel>

            <div className="space-y-5">
              {/* Network selector */}
              <div className="space-y-2">
                <FieldLabel>Network</FieldLabel>
                <Select
                  value={config.network}
                  onValueChange={(value: any) => onConfigChange({ ...config, network: value })}
                >
                  <SelectTrigger className="h-9 text-xs bg-gray-900/50 border-gray-800/60 rounded-lg">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-800">
                    <SelectItem value="mainnet">Mainnet</SelectItem>
                    <SelectItem value="devnet">Devnet</SelectItem>
                    <SelectItem value="testnet">Testnet</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* RPC server */}
              <div className="space-y-2">
                <FieldLabel
                  icon={<Server className="h-3.5 w-3.5" />}
                  extra={
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button className="text-gray-600 hover:text-gray-400 transition-colors">
                            <HelpCircle className="h-3.5 w-3.5" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs text-xs">
                          <p>Configure which Arch Network RPC server to use.</p>
                          <ul className="list-disc pl-3 mt-1 space-y-0.5 text-[11px] text-gray-400">
                            <li><strong className="text-gray-300">Mainnet:</strong> Production</li>
                            <li><strong className="text-gray-300">Testnet:</strong> Testing</li>
                            <li><strong className="text-gray-300">Local:</strong> localhost:9002</li>
                            <li><strong className="text-gray-300">Custom:</strong> Your own RPC URL</li>
                          </ul>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  }
                >
                  RPC Server
                </FieldLabel>
                <Select
                  value={rpcPreset}
                  onValueChange={(value) => {
                    setRpcPreset(value);
                    if (value !== 'custom') {
                      onConfigChange({
                        ...config,
                        rpcUrl: PRESET_RPC_URLS[value as keyof typeof PRESET_RPC_URLS],
                        network: value as 'mainnet' | 'devnet' | 'testnet'
                      });
                    }
                  }}
                >
                  <SelectTrigger className="h-9 text-xs bg-gray-900/50 border-gray-800/60 rounded-lg">
                    <SelectValue placeholder="Select RPC server" />
                  </SelectTrigger>
                  <SelectContent className="bg-gray-900 border-gray-800">
                    <SelectItem value="mainnet">Mainnet</SelectItem>
                    <SelectItem value="testnet">Testnet</SelectItem>
                    <SelectItem value="devnet">Local (localhost:9002)</SelectItem>
                    <SelectItem value="custom">Custom URL</SelectItem>
                  </SelectContent>
                </Select>

                {/* Custom URL input */}
                {rpcPreset === 'custom' && (
                  <div className="space-y-2 pt-1">
                    <Input
                      value={config.rpcUrl}
                      onChange={(e) => onConfigChange({ ...config, rpcUrl: e.target.value })}
                      placeholder="https://your-rpc-server.com"
                      className="h-9 text-xs bg-gray-900/50 border-gray-800/60 rounded-lg"
                    />
                    <Button
                      onClick={testConnection}
                      disabled={testingConnection}
                      variant="secondary"
                      className="w-full h-9 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-700/50"
                    >
                      {testingConnection ? (
                        <>
                          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                          Testing...
                        </>
                      ) : (
                        <>
                          <Wifi className="mr-2 h-3.5 w-3.5" />
                          Test Connection
                        </>
                      )}
                    </Button>
                    {testResult && (
                      <div className={`p-2.5 rounded-lg text-[11px] ${
                        testResult.success
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-red-500/10 text-red-400 border border-red-500/20'
                      }`}>
                        {testResult.message}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Bitcoin Regtest (devnet only) */}
              {config.network === 'devnet' && (
                <div className="space-y-4 rounded-lg bg-gray-900/30 border border-gray-800/40 p-4">
                  <div>
                    <h4 className="text-xs font-medium text-gray-300">Bitcoin Regtest</h4>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      Direct Bitcoin node interaction for development and testing.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <FieldLabel icon={<Server className="h-3.5 w-3.5" />}>Bitcoin RPC URL</FieldLabel>
                      <Input
                        value={config.regtestConfig?.url || 'http://bitcoin-node.dev.aws.archnetwork.xyz:18443'}
                        onChange={(e) => handleRegtestChange('url', e.target.value)}
                        placeholder="http://bitcoin-node.dev.aws.archnetwork.xyz:18443"
                        className="h-9 text-xs bg-gray-900/50 border-gray-800/60 rounded-lg"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <FieldLabel icon={<Key className="h-3.5 w-3.5" />}>RPC Username</FieldLabel>
                      <Input
                        value={config.regtestConfig?.username || 'bitcoin'}
                        onChange={(e) => handleRegtestChange('username', e.target.value)}
                        placeholder="bitcoin"
                        className="h-9 text-xs bg-gray-900/50 border-gray-800/60 rounded-lg"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <FieldLabel icon={<Lock className="h-3.5 w-3.5" />}>RPC Password</FieldLabel>
                      <Input
                        type="password"
                        value={config.regtestConfig?.password || '428bae8f3c94f8c39c50757fc89c39bc7e6ebc70ebf8f618'}
                        onChange={(e) => handleRegtestChange('password', e.target.value)}
                        placeholder="••••••••"
                        className="h-9 text-xs bg-gray-900/50 border-gray-800/60 rounded-lg"
                      />
                    </div>

                    <Button
                      onClick={testConnection}
                      disabled={testingConnection}
                      variant="secondary"
                      className="w-full h-9 text-xs bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-700/50"
                    >
                      {testingConnection ? (
                        <>
                          <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                          Testing...
                        </>
                      ) : (
                        <>
                          <Wifi className="mr-2 h-3.5 w-3.5" />
                          Test Connection
                        </>
                      )}
                    </Button>
                    {testResult && (
                      <div className={`p-2.5 rounded-lg text-[11px] ${
                        testResult.success
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : 'bg-red-500/10 text-red-400 border border-red-500/20'
                      }`}>
                        {testResult.message}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Development Settings ─────────────────────── */}
          <div>
            <SectionLabel icon={<AlertTriangle className="h-3.5 w-3.5" />}>Development</SectionLabel>

            <div className="space-y-2.5">
              <SettingRow
                icon={<Eye className="h-4 w-4" />}
                label="Show Transaction Details"
                description="Display detailed transaction information"
                checked={config.showTransactionDetails}
                onCheckedChange={(checked) => onConfigChange({ ...config, showTransactionDetails: checked })}
              />
              <SettingRow
                icon={<Coins className="h-4 w-4" />}
                label="Improve Build Errors"
                description="Show enhanced error messages"
                checked={config.improveErrors}
                onCheckedChange={(checked) => onConfigChange({ ...config, improveErrors: checked })}
              />
              <SettingRow
                icon={<Coins className="h-4 w-4" />}
                label="Automatic Airdrop"
                description="Request airdrop when balance is low"
                checked={config.automaticAirdrop}
                onCheckedChange={(checked) => onConfigChange({ ...config, automaticAirdrop: checked })}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
