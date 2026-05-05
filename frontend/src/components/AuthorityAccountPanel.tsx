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
import { RpcConnection } from '@arch-network/arch-sdk';
import { getSmartRpcUrl } from '../utils/smartRpcConnection';
import { getExplorerUrls } from '../utils/explorerLinks';
import { hexToBase58 } from '../utils/base58';
// Identicon removed per design update
import { requestFaucetFunds } from '../utils/faucet';
import { formatArchFromLamports, lamportsToArch } from '../utils/archUnits';
import { useToast } from './ui/use-toast';
import HistoricalKeysModal from './HistoricalKeysModal';

interface AuthorityAccountPanelProps {
  project: Project | null;
  onAuthorityAccountChange: (account: ProjectAccount | null) => void;
  onSaveToHistory?: (account: ProjectAccount) => Promise<void>;
  onRestoreFromHistory?: (index: number) => Promise<void>;
  onDeleteFromHistory?: (index: number) => Promise<void>;
  config: {
    network: 'mainnet' | 'devnet' | 'testnet';
    rpcUrl: string;
  };
  isConnected: boolean;
  /** Render prop: called with action buttons for the parent StepCard header */
  onRenderActions?: (actions: React.ReactNode) => void;
}

export const AuthorityAccountPanel: React.FC<AuthorityAccountPanelProps> = ({
  project,
  onAuthorityAccountChange,
  onSaveToHistory,
  onRestoreFromHistory,
  onDeleteFromHistory,
  config,
  isConnected,
  onRenderActions,
}) => {
  const [balance, setBalance] = useState<number | null>(null);
  const [isLoadingBalance, setIsLoadingBalance] = useState(false);
  const [balanceError, setBalanceError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isRequestingFunds, setIsRequestingFunds] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);

  const { toast } = useToast();
  const authority = project?.authorityAccount;
  const networkDisplay = config.network === 'mainnet' ? 'mainnet' : config.network;
  const isFaucetNetwork = config.network === 'mainnet' || config.network === 'testnet' || config.network === 'devnet';
  const explorerUrls = getExplorerUrls(config.network as 'testnet' | 'mainnet' | 'devnet');
  const authorityBase58 = authority ? hexToBase58(authority.pubkey) : null;

  // Push header actions to parent StepCard
  useEffect(() => {
    if (!onRenderActions) return;
    if (!authority) {
      onRenderActions(null);
      return;
    }
    onRenderActions(
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground hover:bg-accent rounded-lg"
            aria-label="Authority account actions"
            title="Authority account actions"
          >
            <MoreVertical className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="bg-popover border-border">
          {isFaucetNetwork && (
            <DropdownMenuItem
              onClick={handleRequestFunds}
              disabled={!isConnected || isRequestingFunds}
              className="text-foreground/80 hover:bg-accent hover:text-foreground cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Droplets className="h-3.5 w-3.5 mr-2" aria-hidden="true" />
              {isRequestingFunds ? `Requesting ${networkDisplay} funds...` : `Get ${networkDisplay} faucet funds`}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => setIsHistoryModalOpen(true)}
            className="text-foreground/80 hover:bg-accent hover:text-foreground cursor-pointer"
          >
            <History className="h-3.5 w-3.5 mr-2" aria-hidden="true" />
            View History
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={handleExport}
            className="text-foreground/80 hover:bg-accent hover:text-foreground cursor-pointer"
          >
            <Download className="h-3.5 w-3.5 mr-2" aria-hidden="true" />
            Export Keypair
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={handleGenerate}
            className="text-foreground/80 hover:bg-accent hover:text-foreground cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5 mr-2" aria-hidden="true" />
            Regenerate Keypair
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }, [authority, isConnected, isRequestingFunds, onRenderActions]);

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
    
    const networkType = config.network === 'mainnet' ? 'mainnet' :
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
      const network = config.network as 'mainnet' | 'testnet' | 'devnet';

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

  const formatBalance = (lamports: number): string => formatArchFromLamports(lamports);

  // Don't render if no project is loaded
  if (!project) {
    return (
      <div className="text-center py-2">
        <p className="text-xs text-muted-foreground">No project loaded</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {!authority ? (
        /* Empty state — inviting prompt */
        <div className="text-center py-2">
          <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-brand/10 mb-3">
            <Key className="h-5 w-5 text-brand" aria-hidden="true" />
          </div>
          <p className="text-xs text-muted-foreground mb-3 leading-relaxed">
            Generate a keypair to sign transactions and deploy your program.
          </p>
          <Button
            onClick={handleGenerate}
            size="sm"
            className="w-full h-9 bg-brand hover:bg-brand-hover text-brand-foreground font-medium rounded-lg transition-colors"
          >
            Generate Keypair
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Balance display — clean single row */}
          <div className="flex items-center justify-between rounded-lg bg-background/60 px-3 py-2.5">
            <div className="flex items-center gap-2 min-w-0">
              {isLoadingBalance ? (
                <span className="text-xs text-muted-foreground">Loading...</span>
              ) : balance !== null ? (
                <div className="flex items-center gap-1.5" role="status">
                  <span className="text-sm font-mono font-semibold text-foreground">
                    {(() => {
                      const arch = formatBalance(balance);
                      if (window && window.innerWidth < 360) {
                        const short = lamportsToArch(balance).toFixed(2);
                        return `${short} ARCH`;
                      }
                      return `${arch} ARCH`;
                    })()}
                  </span>
                  {hasSufficientFunds ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-label="Sufficient funds" />
                  ) : needsFunding ? (
                    <AlertCircle className="h-3.5 w-3.5 text-warning" aria-label="Needs funding" />
                  ) : null}
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">--</span>
              )}
            </div>
            {isConnected && (
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchBalance}
                disabled={isLoadingBalance}
                className="h-6 w-6 p-0 hover:bg-accent"
                title="Refresh balance"
                aria-label="Refresh balance"
              >
                <RefreshCw className={`h-3 w-3 text-muted-foreground ${isLoadingBalance ? 'animate-spin' : ''}`} aria-hidden="true" />
              </Button>
            )}
          </div>

          {/* Funding prompt */}
          {(needsFunding || isLowFunds) && isFaucetNetwork && (
            <div className="rounded-lg bg-warning/5 border border-warning/20 p-3 space-y-2" role="status">
              <p className="text-xs text-warning/90 leading-relaxed">
                {needsFunding ? 'Fund this account to enable transactions.' : 'Balance is low — consider topping up.'}
              </p>
              <Button
                onClick={handleRequestFunds}
                disabled={!isConnected || isRequestingFunds}
                size="sm"
                className="w-full h-8 bg-warning/20 hover:bg-warning/30 text-warning border border-warning/30 rounded-lg transition-colors"
              >
                <Droplets className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
                {isRequestingFunds ? 'Requesting...' : `Request ${networkDisplay} funds`}
              </Button>
            </div>
          )}

          {/* Pubkey */}
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Pubkey</label>
            <div className="flex items-center gap-1.5">
              <div className="flex-1 min-w-0 h-8 text-xs font-mono bg-background/60 border border-border rounded-lg px-2.5 flex items-center">
                <span className="truncate text-foreground/80" title={authorityBase58 || ''}>{authorityBase58 || '-'}</span>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => authorityBase58 && handleCopy(authorityBase58, 'pubkey')}
                className="h-8 w-8 p-0 hover:bg-accent rounded-lg"
                title="Copy pubkey"
                aria-label="Copy pubkey"
                disabled={!authorityBase58}
              >
                {copiedField === 'pubkey' ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                )}
              </Button>
              {explorerUrls && authorityBase58 && (
                <a
                  href={explorerUrls.account(authorityBase58)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-8 w-8 p-0 inline-flex items-center justify-center hover:bg-accent rounded-lg transition-colors"
                  title="View on Explorer"
                  aria-label="View account on Explorer"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                </a>
              )}
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
