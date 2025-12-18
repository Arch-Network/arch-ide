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
}

// Map config network to wallet network
const mapConfigNetwork = (network: string): 'mainnet' | 'testnet' | 'regtest' => {
  if (network === 'testnet') return 'testnet';
  if (network === 'mainnet-beta') return 'mainnet';
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

  return (
    <>
      {/* Desktop / tablet status bar */}
      <div className="hidden sm:flex h-6 bg-[#1a1b26] border-t border-gray-800 px-4 items-center justify-between text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-gray-400 flex-shrink-0">Network: {config.network}</span>
          {isConnected && lastPingTime ? (
            <Wifi className="h-3 w-3 text-green-500" />
          ) : (
            <WifiOff className="h-3 w-3 text-red-500" />
          )}
          {children && <div className="min-w-0 flex-1 overflow-hidden">{children}</div>}
        </div>

        <div className="flex items-center gap-4">
          {lastPingTime && (
            <span className="text-gray-400">
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
          />
        </div>
      </div>

      {/* Mobile compact bar */}
      <div
        className="sm:hidden bg-[#1a1b26]/95 backdrop-blur border-t border-gray-800 px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)] text-sm"
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
          >
            <div className="flex items-center gap-2 min-w-0">
              {isConnected && lastPingTime ? (
                <Wifi className="h-5 w-5 text-green-500 flex-shrink-0" />
              ) : (
                <WifiOff className="h-5 w-5 text-red-500 flex-shrink-0" />
              )}
              <span className="text-gray-200 font-medium truncate">Network: {config.network}</span>
            </div>
            {isMobileExpanded ? (
              <ChevronUp className="h-5 w-5 text-gray-400 flex-shrink-0" />
            ) : (
              <ChevronDown className="h-5 w-5 text-gray-400 flex-shrink-0" />
            )}
          </button>

          {hasMobileConsole && (
            <button
              type="button"
              className="relative inline-flex items-center gap-2 rounded-md bg-gray-800/60 px-3 py-2 text-gray-200"
              onClick={() => {
                setMobileActiveTab('console');
                setIsMobileExpanded(true);
              }}
              aria-label="Open console"
            >
              <Terminal className="h-4 w-4" />
              <span className="text-sm font-medium">Console</span>
              {safeConsoleBadgeCount > 0 && (
                <span className="ml-1 inline-flex min-w-5 justify-center rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] leading-none text-white">
                  {safeConsoleBadgeCount > 99 ? '99+' : safeConsoleBadgeCount}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Mobile expanded sheet */}
      {isMobileExpanded && (
        <div className="fixed inset-0 z-[60] sm:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            aria-hidden="true"
            onClick={() => setIsMobileExpanded(false)}
          />
          <div className="absolute inset-x-0 bottom-0 bg-[#1a1b26] border-t border-gray-800 rounded-t-lg p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {mobileActiveTab === 'console' ? (
                  <Terminal className="h-4 w-4 text-gray-200" />
                ) : isConnected && lastPingTime ? (
                  <Wifi className="h-4 w-4 text-green-500" />
                ) : (
                  <WifiOff className="h-4 w-4 text-red-500" />
                )}
                <span className="text-gray-200 text-sm font-medium">
                  {mobileActiveTab === 'console' ? 'Console' : 'Status'}
                </span>
              </div>
              <button
                type="button"
                className="text-gray-400 text-sm"
                onClick={() => setIsMobileExpanded(false)}
              >
                Close
              </button>
            </div>

            {hasMobileConsole && (
              <div className="mb-3 inline-flex rounded-md bg-gray-800/70 p-1">
                <button
                  type="button"
                  className={
                    mobileActiveTab === 'status'
                      ? 'rounded px-3 py-1 text-sm text-white bg-gray-700'
                      : 'rounded px-3 py-1 text-sm text-gray-300'
                  }
                  onClick={() => setMobileActiveTab('status')}
                >
                  Status
                </button>
                <button
                  type="button"
                  className={
                    mobileActiveTab === 'console'
                      ? 'rounded px-3 py-1 text-sm text-white bg-gray-700'
                      : 'rounded px-3 py-1 text-sm text-gray-300'
                  }
                  onClick={() => setMobileActiveTab('console')}
                >
                  Console
                </button>
              </div>
            )}

            {mobileActiveTab === 'console' && hasMobileConsole ? (
              <div className="h-[55vh] min-h-0 overflow-hidden rounded-md border border-gray-800 bg-gray-900">
                {mobileConsole}
              </div>
            ) : (
              <div className="space-y-3">
                <div className="text-gray-300 text-sm">
                  Network: <span className="font-mono">{config.network}</span>
                </div>
                {lastPingTime && (
                  <div className="text-gray-400 text-sm">
                    Last ping: {lastPingTime.toLocaleTimeString()}
                  </div>
                )}
                {children && <div className="text-gray-300 text-sm">{children}</div>}
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
                />
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
};