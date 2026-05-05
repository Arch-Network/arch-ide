import { ConnectionStatus } from './ConnectionStatus';
import { Config } from '../types/config';
import { ChevronDown, ChevronUp, Terminal, WifiOff, Wifi } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { FileChange } from '../types/types';
import { WalletButton } from './BitcoinWallet';

interface StatusBarProps {
  config: Config;
  isConnected: boolean;
  onConnectionStatusChange: (connected: boolean) => void;
  pendingChanges: Map<string, FileChange>;
  isSaving: boolean;
  children?: React.ReactNode;
  mobileConsole?: React.ReactNode;
  mobileConsoleBadgeCount?: number;
  onOpenSettings?: () => void;
}

// Map config network to wallet network
const mapConfigNetwork = (network: string): 'mainnet' | 'testnet' | 'regtest' => {
  if (network === 'testnet') return 'testnet';
  if (network === 'mainnet' || network === 'mainnet-beta') return 'mainnet';
  if (network === 'devnet') return 'regtest';
  return 'mainnet';
};

export const StatusBar = ({
  config,
  isConnected,
  onConnectionStatusChange,
  pendingChanges,
  isSaving,
  children,
  mobileConsole,
  mobileConsoleBadgeCount,
  onOpenSettings,
}: StatusBarProps) => {
  const [lastPingTime, setLastPingTime] = useState<Date | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isAutoConnecting, setIsAutoConnecting] = useState(false);
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);
  const [mobileActiveTab, setMobileActiveTab] = useState<'status' | 'console'>('status');

  useEffect(() => {
    // Only attempt auto-connect on initial mount or when explicitly triggered
    const attemptConnect = () => {
      if (!isConnected && !isAutoConnecting) {
        setIsAutoConnecting(true);
        onConnectionStatusChange(true);
      }
    };

    // Clear any existing timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    // Only attempt reconnect if we were previously connected and lost connection
    if (!isConnected && lastPingTime) {
      reconnectTimeoutRef.current = setTimeout(attemptConnect, 5000);
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [isConnected, onConnectionStatusChange, lastPingTime]);

  const handlePingUpdate = (time: Date | null) => {
    setLastPingTime(time);
    setIsAutoConnecting(false);
  };

  // Keep console badge stable even if caller passes undefined or negative.
  const safeConsoleBadgeCount = Math.max(0, mobileConsoleBadgeCount ?? 0);
  const hasMobileConsole = !!mobileConsole;

  // Concise label that won't blow out the status bar on narrow screens. The
  // verbose URL stays in the title attribute (revealed on hover).
  const networkLabel = `${config.network}`;
  const fullStatusTitle = isConnected && lastPingTime
    ? `Connected to ${config.network} (${config.rpcUrl})`
    : 'Not connected to network';

  return (
    <>
      {/* Desktop / tablet status bar */}
      <div className="hidden sm:flex h-6 bg-surface-1 border-t border-border px-4 items-center justify-between text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-muted-foreground flex-shrink-0">Network: {networkLabel}</span>
          <span title={fullStatusTitle} className="flex-shrink-0">
            {isConnected && lastPingTime ? (
              <Wifi className="h-3 w-3 text-success" aria-label="Connected" />
            ) : (
              <WifiOff className="h-3 w-3 text-danger" aria-label="Disconnected" />
            )}
          </span>
          {children && <div className="min-w-0 flex-1 overflow-hidden">{children}</div>}
        </div>

        <div className="flex items-center gap-4">
          {lastPingTime && (
            <span className="text-muted-foreground">
              Last ping: {lastPingTime.toLocaleTimeString()}
            </span>
          )}
          <WalletButton network={mapConfigNetwork(config.network)} />
          <ConnectionStatus
            rpcUrl={config.rpcUrl}
            network={config.network}
            isConnected={isConnected}
            onConnect={() => onConnectionStatusChange(true)}
            onDisconnect={() => onConnectionStatusChange(false)}
            onPingUpdate={handlePingUpdate}
            onOpenSettings={onOpenSettings}
          />
        </div>
      </div>

      {/* Mobile compact bar */}
      <div
        className="sm:hidden bg-surface-1/95 backdrop-blur border-t border-border px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)] text-sm"
      >
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            className="flex-1 flex items-center justify-between gap-3"
            onClick={() => {
              setMobileActiveTab('status');
              setIsMobileExpanded((v) => !v);
            }}
            aria-expanded={isMobileExpanded && mobileActiveTab === 'status'}
            aria-label={fullStatusTitle}
          >
            <div className="flex items-center gap-2 min-w-0">
              {isConnected && lastPingTime ? (
                <Wifi className="h-5 w-5 text-success flex-shrink-0" aria-hidden="true" />
              ) : (
                <WifiOff className="h-5 w-5 text-danger flex-shrink-0" aria-hidden="true" />
              )}
              <span className="text-foreground/90 font-medium truncate">Network: {networkLabel}</span>
            </div>
            {isMobileExpanded ? (
              <ChevronUp className="h-5 w-5 text-muted-foreground flex-shrink-0" aria-hidden="true" />
            ) : (
              <ChevronDown className="h-5 w-5 text-muted-foreground flex-shrink-0" aria-hidden="true" />
            )}
          </button>

          {hasMobileConsole && (
            <button
              type="button"
              className="relative inline-flex items-center gap-2 rounded-md bg-accent px-3 py-2 text-foreground/90 hover:bg-surface-3 transition-colors"
              onClick={() => {
                setMobileActiveTab('console');
                setIsMobileExpanded(true);
              }}
              aria-label="Open console"
            >
              <Terminal className="h-4 w-4" aria-hidden="true" />
              <span className="text-sm font-medium">Console</span>
              {safeConsoleBadgeCount > 0 && (
                <span className="ml-1 inline-flex min-w-5 justify-center rounded-full bg-danger px-1.5 py-0.5 text-[10px] leading-none text-danger-foreground">
                  {safeConsoleBadgeCount > 99 ? '99+' : safeConsoleBadgeCount}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Mobile expanded sheet */}
      {isMobileExpanded && (
        <div className="fixed inset-0 z-sheet sm:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            aria-hidden="true"
            onClick={() => setIsMobileExpanded(false)}
          />
          <div className="absolute inset-x-0 bottom-0 bg-surface-1 border-t border-border rounded-t-lg p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {mobileActiveTab === 'console' ? (
                  <Terminal className="h-4 w-4 text-foreground/90" aria-hidden="true" />
                ) : isConnected && lastPingTime ? (
                  <Wifi className="h-4 w-4 text-success" aria-hidden="true" />
                ) : (
                  <WifiOff className="h-4 w-4 text-danger" aria-hidden="true" />
                )}
                <span className="text-foreground/90 text-sm font-medium">
                  {mobileActiveTab === 'console' ? 'Console' : 'Status'}
                </span>
              </div>
              <button
                type="button"
                className="text-muted-foreground text-sm hover:text-foreground transition-colors"
                onClick={() => setIsMobileExpanded(false)}
              >
                Close
              </button>
            </div>

            {hasMobileConsole && (
              <div className="mb-3 inline-flex rounded-md bg-accent p-1">
                <button
                  type="button"
                  className={
                    mobileActiveTab === 'status'
                      ? 'rounded px-3 py-1 text-sm text-foreground bg-surface-3'
                      : 'rounded px-3 py-1 text-sm text-muted-foreground'
                  }
                  onClick={() => setMobileActiveTab('status')}
                >
                  Status
                </button>
                <button
                  type="button"
                  className={
                    mobileActiveTab === 'console'
                      ? 'rounded px-3 py-1 text-sm text-foreground bg-surface-3'
                      : 'rounded px-3 py-1 text-sm text-muted-foreground'
                  }
                  onClick={() => setMobileActiveTab('console')}
                >
                  Console
                </button>
              </div>
            )}

            {mobileActiveTab === 'console' && hasMobileConsole ? (
              <div className="h-[55vh] min-h-0 overflow-hidden rounded-md border border-border bg-background">
                {mobileConsole}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-foreground/80 text-sm">
                  Network: <span className="font-mono">{config.network}</span>
                </div>
                {lastPingTime && (
                  <div className="text-muted-foreground text-sm">
                    Last ping: {lastPingTime.toLocaleTimeString()}
                  </div>
                )}
                {children && <div className="text-foreground/80 text-sm">{children}</div>}
                <div className="flex items-center justify-between">
                  <WalletButton network={mapConfigNetwork(config.network)} />
                </div>
                <ConnectionStatus
                  rpcUrl={config.rpcUrl}
                  network={config.network}
                  isConnected={isConnected}
                  onConnect={() => onConnectionStatusChange(true)}
                  onDisconnect={() => onConnectionStatusChange(false)}
                  onPingUpdate={handlePingUpdate}
                  onOpenSettings={onOpenSettings}
                />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};