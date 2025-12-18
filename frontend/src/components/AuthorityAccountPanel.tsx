import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';
import { Copy, Download, Key, RefreshCw, AlertCircle, CheckCircle2, Wallet, RotateCcw, ExternalLink, Droplets, MoreVertical, History } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { ProjectAccount, Project } from '../types';
import { generateArchKeypair, downloadKeypairJSON, formatAddress, formatPubkey } from '../utils/keypairGenerator';
import { RpcConnection } from '@saturnbtcio/arch-sdk';
import { getSmartRpcUrl } from '../utils/smartRpcConnection';
import { getExplorerUrls } from '../utils/explorerLinks';
import { hexToBase58 } from '../utils/base58';
// Identicon removed per design update
import { requestFaucetFunds } from '../utils/faucet';
import { useToast } from './ui/use-toast';
import HistoricalKeysModal from './HistoricalKeysModal';

interface AuthorityAccountPanelProps {
  project: Project | null;
  onAuthorityAccountChange: (account: ProjectAccount | null) => void;
  onSaveToHistory?: (account: ProjectAccount) => Promise<void>;
  onRestoreFromHistory?: (index: number) => Promise<void>;
  onDeleteFromHistory?: (index: number) => Promise<void>;
  config: {
    network: 'mainnet-beta' | 'devnet' | 'testnet';
    rpcUrl: string;
  };
  isConnected: boolean;
}

export const AuthorityAccountPanel: React.FC<AuthorityAccountPanelProps> = ({
  project,
  onAuthorityAccountChange,
  onSaveToHistory,
  onRestoreFromHistory,
  onDeleteFromHistory,
  config,
  isConnected
}) => {
  const [balance, setBalance] = useState<number | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isRequestingFunds, setIsRequestingFunds] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

  const { toast } = useToast();
  const authority = project?.authorityAccount;
  const networkDisplay = config.network === 'mainnet-beta' ? 'mainnet' : config.network;
  const isFaucetNetwork = config.network === 'testnet' || config.network === 'devnet';
  const explorerUrls = getExplorerUrls(config.network as 'testnet' | 'mainnet-beta' | 'devnet');
  const authorityBase58 = authority ? hexToBase58(authority.pubkey) : null;

  // Fetch balance when authority account changes or component mounts
  useEffect(() => {
    if (authority && isConnected) {
      fetchBalance();
    } else {
      setBalance(null);
      setBalanceError(null);
    }
  }, [authority?.pubkey, isConnected]);

  const readBalanceLamports = async (pubkeyHex: string): Promise<number | null> => {
    try {
      const smartRpcUrl = getSmartRpcUrl(config.rpcUrl);
      const connection = new RpcConnection(smartRpcUrl);
      const pubkeyBuffer = Buffer.from(pubkeyHex, 'hex');
      const accountInfo = await connection.readAccountInfo(pubkeyBuffer);
      return accountInfo ? accountInfo.lamports : 0;
    } catch (error: any) {
      console.log('Authority balance fetch error:', error?.message || error);
      // If account doesn't exist yet (not funded), treat as 0 balance
      if (error?.message?.includes('account is not in database') ||
          error?.message?.includes('not found')) {
        return 0;
      }
      throw error;
    }
  };

  const fetchBalanceForPubkey = async (pubkeyHex: string): Promise<number | null> => {
    if (!isConnected) return null;

    setIsLoadingBalance(true);
    setBalanceError(null);

    try {
      const lamports = await readBalanceLamports(pubkeyHex);
      setBalance(lamports);
      return lamports;
    } catch (error: any) {
      console.error('Failed to fetch authority balance:', error);
      setBalanceError('Failed to fetch balance');
      setBalance(null);
      return null;
    } finally {
      setIsLoadingBalance(false);
    }
  };

  const fetchBalance = async (): Promise<number | null> => {
    if (!authority || !isConnected) return null;
    return fetchBalanceForPubkey(authority.pubkey);
  };

  const pollForBalanceIncrease = async (pubkeyHex: string, startingLamports: number, timeoutMs = 20000) => {
    const startedAt = Date.now();
    // Poll quickly at first; most faucet txs land within a few seconds.
    while (Date.now() - startedAt < timeoutMs) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 1500));
      // eslint-disable-next-line no-await-in-loop
      const latest = await fetchBalanceForPubkey(pubkeyHex);
      if (latest !== null && latest > startingLamports) {
        return;
      }
    }
  };

  const handleGenerate = async () => {
    // Save current authority account to history before generating new one
    if (authority && onSaveToHistory) {
      try {
        await onSaveToHistory(authority);
      } catch (error) {
        console.error('Failed to save to history:', error);
        // Continue with generation even if history save fails
      }
    }
    
    const networkType = config.network === 'mainnet-beta' ? 'mainnet' :
                       config.network === 'testnet' ? 'testnet' : 'devnet';
    const newAuthority = generateArchKeypair(networkType);
    onAuthorityAccountChange(newAuthority);
  };

  const handleExport = () => {
    if (!authority || !project) return;
    downloadKeypairJSON(authority, `${project.name}-authority.json`);
  };

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleRequestFunds = async () => {
    if (!authority || !isConnected || !isFaucetNetwork) return;

    setIsRequestingFunds(true);

    try {
      // Refresh immediately so the UI reflects the current state before/while funding.
      const startingLamports = (await fetchBalance()) ?? (balance ?? 0);

      const smartRpcUrl = getSmartRpcUrl(config.rpcUrl);
      const network = config.network as 'testnet' | 'devnet';

      toast({
        title: "Funding Account",
        description: `Requesting ${networkDisplay} faucet funds...`,
      });

      const result = await requestFaucetFunds({
        pubkey: authority.pubkey,
        privkey: authority.privkey, // Pass private key to complete the transaction
        rpcUrl: smartRpcUrl,
        network,
      });

      if (result.success) {
        toast({
          title: "Faucet Request Sent",
          description: result.message || "Faucet request submitted. Refreshing balance...",
        });

        // Poll until we see the balance increase (or timeout) to cover first-time account creation too.
        await pollForBalanceIncrease(authority.pubkey, startingLamports, 30000);
      } else {
        throw new Error(result.error || 'Faucet request failed');
      }
    } catch (error: any) {
      console.error('Faucet request error:', error);
      toast({
        title: "Faucet Request Failed",
        description: error.message || "Failed to request funds from faucet",
        variant: "destructive",
      });
      // Still refresh balance on failure; the request may have partially succeeded.
      await fetchBalance();
    } finally {
      setIsRequestingFunds(false);
    }
  };

  const needsFunding = balance !== null && balance === 0;
  const hasSufficientFunds = balance !== null && balance > 5000; // Minimum for deployment
  const isLowFunds = balance !== null && balance > 0 && !hasSufficientFunds;

  // Convert lamports to ARCH (1 ARCH = 100,000,000 lamports)
  const formatBalance = (lamports: number): string => {
    const arch = lamports / 100_000_000;
    return arch.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 8
    });
  };

  // Don't render if no project is loaded
  if (!project) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold">Authority Account</h3>
        </div>
        <div className="bg-gray-50 border border-gray-200 rounded-md p-4">
          <p className="text-xs text-gray-500">No project loaded</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-200 tracking-wide uppercase">Authority Account</h3>
        {authority && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 text-gray-400 hover:text-gray-300"
                aria-label="Authority account actions"
                title="Authority account actions"
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-gray-800 border-gray-700">
              {isFaucetNetwork && (
                <DropdownMenuItem
                  onClick={handleRequestFunds}
                  disabled={!isConnected || isRequestingFunds}
                  className="text-gray-300 hover:bg-gray-700 hover:text-white cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Droplets className="h-3.5 w-3.5 mr-2" />
                  {isRequestingFunds ? `Requesting ${networkDisplay} funds...` : `Get ${networkDisplay} faucet funds`}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => setIsHistoryModalOpen(true)}
                className="text-gray-300 hover:bg-gray-700 hover:text-white cursor-pointer"
              >
                <History className="h-3.5 w-3.5 mr-2" />
                View History
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleExport}
                className="text-gray-300 hover:bg-gray-700 hover:text-white cursor-pointer"
              >
                <Download className="h-3.5 w-3.5 mr-2" />
                Export Keypair
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={handleGenerate}
                className="text-gray-300 hover:bg-gray-700 hover:text-white cursor-pointer"
              >
                <RotateCcw className="h-3.5 w-3.5 mr-2" />
                Regenerate Keypair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {!authority ? (
        <div className="bg-gray-800/40 border border-gray-700 rounded-md p-4">
          <div className="flex items-start gap-2.5 mb-3">
            <AlertCircle className="h-4 w-4 text-orange-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-gray-300 leading-relaxed">
              Required for deployment. Pays transaction fees.
            </p>
          </div>
          <Button
            onClick={handleGenerate}
            size="sm"
            className="w-full h-8 bg-[#E05A1A] hover:bg-[#d14e12] text-white"
          >
            <Key className="h-3.5 w-3.5 mr-2" />
            Generate Keypair
          </Button>
        </div>
      ) : (
        <div className="bg-gray-800/40 border border-gray-700 rounded-md p-4 space-y-4">
          {/* Status Bar - Balance & Network */}
          <div className="bg-gray-900/50 border border-gray-700/50 rounded-md px-3 py-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">Balance:</span>
                {isLoadingBalance ? (
                  <span className="text-xs text-gray-500">Loading...</span>
                ) : balance !== null ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-mono font-semibold text-gray-100">
                      {(() => {
                        const arch = formatBalance(balance);
                        // Show fewer decimals on very narrow sidebars
                        if (window && window.innerWidth < 360) {
                          const short = (balance / 100_000_000).toFixed(2);
                          return `${short} ARCH`;
                        }
                        return `${arch} ARCH`;
                      })()}
                    </span>
                    {hasSufficientFunds ? (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                    ) : needsFunding && (
                      <AlertCircle className="h-3.5 w-3.5 text-orange-500" />
                    )}
                  </div>
                ) : (
                  <span className="text-xs text-gray-400">-</span>
                )}
                {isConnected && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={fetchBalance}
                    disabled={isLoadingBalance}
                    className="h-5 w-5 p-0 ml-1"
                    title="Refresh balance"
                  >
                    <RefreshCw className={`h-3 w-3 text-gray-400 ${isLoadingBalance ? 'animate-spin' : ''}`} />
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-medium px-2 py-1 rounded border border-current ${
                  config.network === 'mainnet-beta'
                    ? 'bg-red-900/40 text-red-300'
                    : config.network === 'testnet'
                      ? 'bg-yellow-900/30 text-yellow-300'
                      : 'bg-blue-900/40 text-blue-300'
                }`}>
                  {networkDisplay.toUpperCase()}
                </span>
              </div>
            </div>
          </div>

          {/* Funding Warning & Action */}
          {(needsFunding || isLowFunds) && isFaucetNetwork && (
            <div className="bg-orange-900/20 border border-orange-800/50 rounded-md p-3 space-y-2.5">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-orange-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-orange-300 leading-relaxed">
                  {needsFunding ? 'Account needs funds for transactions' : 'Low balance — top up recommended'}
                </p>
              </div>
              <Button
                onClick={handleRequestFunds}
                disabled={!isConnected || isRequestingFunds}
                size="sm"
                className="w-full h-8 bg-orange-600/80 hover:bg-orange-600 text-white border border-orange-500/50"
              >
                <Droplets className="h-3.5 w-3.5 mr-1.5" />
                {isRequestingFunds ? 'Requesting...' : `Get ${networkDisplay} faucet funds`}
              </Button>
            </div>
          )}

          {/* Account Details */}
          <div className="space-y-3 pt-1">
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Pubkey</label>
              <div className="flex items-center gap-2">
                <div className="flex-1 min-w-0 h-7 text-xs font-mono bg-gray-900/80 border border-gray-700 rounded px-2.5 flex items-center">
                  <span className="truncate" title={authorityBase58 || ''}>{authorityBase58 || '-'}</span>
                </div>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => authorityBase58 && handleCopy(authorityBase58, 'pubkey')} 
                  className="h-7 px-2.5 hover:bg-gray-700/50"
                  title="Copy pubkey"
                  disabled={!authorityBase58}
                >
                  {copiedField === 'pubkey' ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-gray-400" />
                  )}
                </Button>
                {explorerUrls && authorityBase58 && (
                  <a 
                    href={explorerUrls.account(authorityBase58)} 
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="text-xs text-blue-400 hover:text-blue-300 underline flex items-center gap-1"
                  >
                    <ExternalLink className="h-3 w-3" />
                    <span className="hidden sm:inline">Explorer</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <HistoricalKeysModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        currentAccount={authority}
        historicalKeys={project?.historicalAuthorityAccounts || []}
        onRestore={async (index) => {
          if (onRestoreFromHistory) {
            await onRestoreFromHistory(index);
            // Refresh immediately using the selected historical key (don’t wait for parent re-render)
            const restored = project?.historicalAuthorityAccounts?.[index]?.account;
            if (restored?.pubkey) {
              await fetchBalanceForPubkey(restored.pubkey);
            }
          }
        }}
        onDelete={async (index) => {
          if (onDeleteFromHistory) {
            await onDeleteFromHistory(index);
          }
        }}
        projectName={project?.name}
      />
    </div>
  );
};

export default AuthorityAccountPanel;
