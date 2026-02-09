import { useEffect, useState, useRef } from 'react';
import { Button } from './ui/button';
import { Loader2 } from 'lucide-react';
import { RpcConnection } from '@saturnbtcio/arch-sdk';
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
  const [retryCount, setRetryCount] = useState(0);
  const [actualConnectedUrl, setActualConnectedUrl] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const BASE_DELAY = 2000;
  const MAX_DELAY = 60000;
  const CONNECTED_CHECK_INTERVAL = 30000;

  const updateActualUrl = (url: string | null) => {
    setActualConnectedUrl(url);
    onActualUrlChange(url);
  };

  const checkConnection = async () => {
    if (isConnecting) return false;

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

      updateActualUrl(rpcUrl);
      onPingUpdate(new Date());
      setShowErrorModal(false);
      setRetryCount(0);
      onConnect();
      return true;
    } catch (error) {
      updateActualUrl(null);
      setShowErrorModal(true);
      onDisconnect();
      onPingUpdate(null);
      return false;
    } finally {
      setIsConnecting(false);
    }
  };

  const scheduleNextCheck = (wasConnected: boolean) => {
    if (intervalRef.current) {
      clearTimeout(intervalRef.current);
    }

    if (wasConnected) {
      intervalRef.current = setTimeout(() => handleConnect(), CONNECTED_CHECK_INTERVAL);
    } else {
      const delay = Math.min(BASE_DELAY * Math.pow(2, retryCount), MAX_DELAY);
      setRetryCount(prev => prev + 1);
      intervalRef.current = setTimeout(() => handleConnect(), delay);
    }
  };

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      const success = await checkConnection();
      if (!success) {
        setIsConnecting(false);
      }
    } catch (error) {
      setIsConnecting(false);
      setShowErrorModal(true);
      onDisconnect();
      onPingUpdate(null);
    }
  };

  useEffect(() => {
    if (isConnected) {
      handleConnect();
    }
  }, [rpcUrl]);

  useEffect(() => {
    handleConnect();
    return () => {
      if (intervalRef.current) {
        clearTimeout(intervalRef.current);
      }
    };
  }, []);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-5 px-2 text-xs"
        onClick={isConnected ? onDisconnect : handleConnect}
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
