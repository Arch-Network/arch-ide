import { ConnectionStatus } from './ConnectionStatus';
import { Config } from '../types/config';
import { ChevronDown, ChevronUp, WifiOff, Wifi } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { FileChange } from '../types/types';
import { WalletButton } from './BitcoinWallet';

interface StatusBarProps {
  config: Config;
  isConnected: boolean;
  onConnectionStatusChange: (connected: boolean) => void;
  pendingChanges: Map<string, FileChange>;
  isSaving: boolean;
  children?: React.ReactNode;
}

// Map config network to wallet network
const mapConfigNetwork = (network: string): 'mainnet' | 'testnet' | 'regtest' => {
  if (network === 'testnet') return 'testnet';
  if (network === 'mainnet-beta') return 'mainnet';
  if (network === 'devnet') return 'regtest';
  return 'mainnet';
};

export const StatusBar = ({ config, isConnected, onConnectionStatusChange, pendingChanges, isSaving }: StatusBarProps) => {
  const [lastPingTime, setLastPingTime] = useState<Date | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isAutoConnecting, setIsAutoConnecting] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);

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

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const onChange = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
      if (!e.matches) setIsMobileExpanded(false);
    };
    setIsMobile(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return (
    <>
      {/* Desktop / tablet status bar */}
      <div className="hidden sm:flex h-6 bg-[#1a1b26] border-t border-gray-800 px-4 items-center justify-between text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-gray-400">Network: {config.network}</span>
          {isConnected && lastPingTime ? (
            <Wifi className="h-3 w-3 text-green-500" />
          ) : (
            <WifiOff className="h-3 w-3 text-red-500" />
          )}
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
        <button
          type="button"
          className="w-full flex items-center justify-between gap-3"
          onClick={() => setIsMobileExpanded((v) => !v)}
          aria-expanded={isMobileExpanded}
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
      </div>

      {/* Mobile expanded sheet */}
      {isMobile && isMobileExpanded && (
        <div className="fixed inset-0 z-[60] sm:hidden">
          <div
            className="absolute inset-0 bg-black/50"
            aria-hidden="true"
            onClick={() => setIsMobileExpanded(false)}
          />
          <div className="absolute inset-x-0 bottom-0 bg-[#1a1b26] border-t border-gray-800 rounded-t-lg p-4 pb-[calc(env(safe-area-inset-bottom)+16px)]">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                {isConnected && lastPingTime ? (
                  <Wifi className="h-4 w-4 text-green-500" />
                ) : (
                  <WifiOff className="h-4 w-4 text-red-500" />
                )}
                <span className="text-gray-200 text-sm font-medium">Status</span>
              </div>
              <button
                type="button"
                className="text-gray-400 text-sm"
                onClick={() => setIsMobileExpanded(false)}
              >
                Close
              </button>
            </div>

            <div className="space-y-3">
              <div className="text-gray-300 text-sm">
                Network: <span className="font-mono">{config.network}</span>
              </div>
              {lastPingTime && (
                <div className="text-gray-400 text-sm">
                  Last ping: {lastPingTime.toLocaleTimeString()}
                </div>
              )}
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
          </div>
        </div>
      )}
    </>
  );
};