import { useEffect, useState, useRef } from 'react';
import { Button } from './ui/button';
import { Loader2 } from 'lucide-react';
import { RpcConnection } from '@arch-network/arch-sdk';
import { ConnectionErrorModal } from './ConnectionErrorModal';
import { getSmartRpcUrl } from '../utils/smartRpcConnection';

interface ConnectionStatusProps {
  rpcUrl: string;
  network: string;
  isConnected: boolean;
  onConnect: () => void;
  onDisconnect: () => void;
  onPingUpdate: (time: Date | null) => void;
  onActualUrlChange?: (url: string | null) => void;
  onOpenSettings?: () => void;
}

export const ConnectionStatus = ({
  rpcUrl,
  network,
  isConnected,
  onConnect,
  onDisconnect,
  onPingUpdate,
  onActualUrlChange = () => {},
  onOpenSettings,
}: ConnectionStatusProps) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [actualConnectedUrl, setActualConnectedUrl] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  // Timers run the closure of the render that scheduled them, so mutable
  // check state lives in refs rather than in state.
  const retryCountRef = useRef(0);
  // Bumped when rpcUrl changes, on Disconnect, and on unmount; a check started under an older
  // run reports nothing and schedules nothing.
  const runRef = useRef(0);

  const BASE_DELAY = 2000;
  const MAX_DELAY = 30000;
  const CONNECTED_CHECK_INTERVAL = 30000;

  const updateActualUrl = (url: string | null) => {
    setActualConnectedUrl(url);
    onActualUrlChange(url);
  };

  const checkConnection = async (): Promise<boolean | null> => {
    const run = runRef.current;
    setIsConnecting(true);

    try {
      const smartUrl = getSmartRpcUrl(rpcUrl);
      const connection = new RpcConnection(smartUrl);

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Connection timeout')), 5000);
      });

      const blockCount = await Promise.race([
        connection.getBlockCount(),
        timeoutPromise
      ]) as number;

      if (typeof blockCount !== 'number' || isNaN(blockCount)) {
        throw new Error('Invalid block count response');
      }

      if (run !== runRef.current) return null;
      updateActualUrl(rpcUrl);
      onPingUpdate(new Date());
      setShowErrorModal(false);
      retryCountRef.current = 0;
      onConnect();
      return true;
    } catch (error) {
      if (run !== runRef.current) return null;
      updateActualUrl(null);
      setShowErrorModal(true);
      onDisconnect();
      onPingUpdate(null);
      return false;
    } finally {
      if (run === runRef.current) setIsConnecting(false);
    }
  };

  const scheduleNextCheck = (wasConnected: boolean) => {
    if (intervalRef.current) {
      clearTimeout(intervalRef.current);
    }

    if (wasConnected) {
      intervalRef.current = setTimeout(() => handleConnect(), CONNECTED_CHECK_INTERVAL);
    } else {
      const delay = Math.min(BASE_DELAY * Math.pow(2, retryCountRef.current), MAX_DELAY);
      retryCountRef.current += 1;
      intervalRef.current = setTimeout(() => handleConnect(), delay);
    }
  };

  const handleConnect = async () => {
    const connected = await checkConnection();
    if (connected !== null) scheduleNextCheck(connected);
  };

  const handleDisconnect = () => {
    runRef.current += 1;
    if (intervalRef.current) clearTimeout(intervalRef.current);
    setIsConnecting(false);
    onDisconnect();
    onPingUpdate(null);
  };

  useEffect(() => {
    retryCountRef.current = 0;
    handleConnect();
    return () => {
      runRef.current += 1;
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
      }
    };
  }, [rpcUrl]);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-5 px-2 text-xs"
        onClick={isConnected ? handleDisconnect : handleConnect}
      >
        {isConnecting ? (
          <Loader2 className="h-3 w-3 animate-spin mr-1" />
        ) : isConnected ? (
          'Disconnect'
        ) : (
          'Connect'
        )}
      </Button>

      <ConnectionErrorModal
        isOpen={showErrorModal}
        onClose={() => setShowErrorModal(false)}
        network={network}
        persistDismissal={true}
        isConnected={isConnected}
        actualUrl={actualConnectedUrl}
        rpcUrl={rpcUrl}
        onRetry={handleConnect}
        onOpenSettings={onOpenSettings}
      />
    </>
  );
};

export default ConnectionStatus;
