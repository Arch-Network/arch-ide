import { Button } from "./ui/button";
import { Copy, X, RefreshCw, Settings, ExternalLink, WifiOff } from "lucide-react";
import { useEffect, useState } from "react";

const MODAL_PREFERENCE_KEY = 'connection-modal-dismissed';

interface ConnectionErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  network: string;
  persistDismissal?: boolean;
  isConnected: boolean;
  actualUrl?: string | null;
  rpcUrl: string;
  onRetry?: () => void;
  onOpenSettings?: () => void;
}

const CopiedNotification = () => (
  <span className="text-[11px] text-emerald-400 ml-2">Copied</span>
);

export const ConnectionErrorModal = ({
  isOpen,
  onClose,
  network,
  persistDismissal = true,
  isConnected,
  actualUrl,
  rpcUrl,
  onRetry,
  onOpenSettings,
}: ConnectionErrorModalProps) => {
  const isLocalnet = network === 'devnet';
  const [os, setOs] = useState<'mac' | 'linux' | 'windows' | 'unknown'>('unknown');
  const [copiedInstall, setCopiedInstall] = useState(false);
  const [copiedValidator, setCopiedValidator] = useState(false);

  useEffect(() => {
    const platform = window.navigator.platform.toLowerCase();
    if (platform.includes('mac')) setOs('mac');
    else if (platform.includes('linux')) setOs('linux');
    else if (platform.includes('win')) setOs('windows');
  }, []);

  const installCommand = 'sh -c "$(curl -sSfL https://release.arch.network/latest/install.sh)"';
  const validatorCommand = 'arch-local-validator --bitcoin-rpc-endpoint [endpoint] --bitcoin-rpc-port [port] --bitcoin-rpc-username [user] --bitcoin-rpc-password [pass]';

  const handleCopy = async (text: string, setter: (v: boolean) => void) => {
    await navigator.clipboard.writeText(text);
    setter(true);
    setTimeout(() => setter(false), 2000);
  };

  const handleClose = () => {
    if (persistDismissal) {
      localStorage.setItem(MODAL_PREFERENCE_KEY, 'true');
    }
    onClose();
  };

  const wasDismissed = persistDismissal && localStorage.getItem(MODAL_PREFERENCE_KEY) === 'true';
  if (!isOpen) return null;
  if (isConnected || wasDismissed) return null;

  const displayUrl = actualUrl || rpcUrl;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      />

      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-[#141414] border border-gray-800/60 rounded-xl p-5 shadow-2xl animate-in fade-in">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                <WifiOff className="h-4 w-4 text-red-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-200">Connection Failed</h3>
                <p className="text-[11px] text-gray-500 capitalize">{network}</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={handleClose}
              className="h-7 w-7 rounded-lg text-gray-500 hover:text-gray-300 hover:bg-gray-800/60"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Error detail */}
          <div className="rounded-lg bg-red-500/5 border border-red-500/15 px-3 py-2.5 mb-4">
            <p className="text-xs text-red-400/90">
              Unable to reach <span className="font-mono text-red-300">{displayUrl}</span>
            </p>
          </div>

          {/* Content */}
          {isLocalnet ? (
            <div className="space-y-4">
              <p className="text-xs text-gray-400">
                A local validator must be running to use devnet. Follow these steps:
              </p>

              {/* Step 1 */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-gray-300">1. Install the validator</p>
                <div className="relative group">
                  <pre className="bg-[#0a0a0a] rounded-lg px-3 py-2.5 text-[11px] font-mono text-gray-300 overflow-x-auto">
                    {installCommand}
                  </pre>
                  <button
                    onClick={() => handleCopy(installCommand, setCopiedInstall)}
                    className="absolute right-1.5 top-1.5 h-6 w-6 rounded-md bg-gray-800/80 hover:bg-gray-700 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Copy className="h-3 w-3 text-gray-400" />
                  </button>
                  {copiedInstall && <CopiedNotification />}
                </div>
              </div>

              {/* Step 2 */}
              <div className="space-y-1.5">
                <p className="text-[11px] font-medium text-gray-300">2. Start the validator</p>
                <div className="relative group">
                  <pre className="bg-[#0a0a0a] rounded-lg px-3 py-2.5 text-[11px] font-mono text-gray-300 overflow-x-auto whitespace-pre-wrap">
                    {validatorCommand}
                  </pre>
                  <button
                    onClick={() => handleCopy(validatorCommand, setCopiedValidator)}
                    className="absolute right-1.5 top-1.5 h-6 w-6 rounded-md bg-gray-800/80 hover:bg-gray-700 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Copy className="h-3 w-3 text-gray-400" />
                  </button>
                  {copiedValidator && <CopiedNotification />}
                </div>
              </div>

              <a
                href="https://docs.arch.network"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 text-[11px] text-gray-500 hover:text-gray-300 transition-colors"
              >
                <ExternalLink className="h-3 w-3" />
                View full documentation
              </a>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs text-gray-400 leading-relaxed">
                The RPC server at <span className="font-mono text-gray-300">{displayUrl}</span> is
                not responding. This usually means the network is temporarily unavailable or the
                endpoint has changed.
              </p>

              {/* Actions */}
              <div className="flex gap-2">
                {onRetry && (
                  <Button
                    onClick={() => { onRetry(); handleClose(); }}
                    className="flex-1 h-9 text-xs bg-[#F7931A] hover:bg-[#d47b16] text-white rounded-lg font-medium"
                  >
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                    Retry Connection
                  </Button>
                )}
                {onOpenSettings && (
                  <Button
                    onClick={() => { onOpenSettings(); handleClose(); }}
                    variant="ghost"
                    className="flex-1 h-9 text-xs text-gray-300 bg-gray-800/60 hover:bg-gray-700/60 rounded-lg border border-gray-700/40"
                  >
                    <Settings className="h-3.5 w-3.5 mr-1.5" />
                    Settings
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* Dismiss hint */}
          <p className="text-[10px] text-gray-600 mt-4 text-center">
            This will auto-dismiss once connected
          </p>
        </div>
      </div>
    </div>
  );
};
