  import { Button } from "./ui/button";
  import { Copy, X } from "lucide-react";
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
  }

  const CopiedNotification = () => (
    <p className="text-sm text-green-400 mt-2">Copied to clipboard!</p>
  );

  export const ConnectionErrorModal = ({
    isOpen,
    onClose,
    network,
    persistDismissal = true,
    isConnected,
    actualUrl,
    rpcUrl
  }: ConnectionErrorModalProps) => {
    const isLocalnet = network === 'devnet';
    const [os, setOs] = useState<'mac' | 'linux' | 'windows' | 'unknown'>('unknown');
    const [copiedInstall, setCopiedInstall] = useState(false);
    const [copiedValidator, setCopiedValidator] = useState(false);

    useEffect(() => {
      // Detect operating system
      const platform = window.navigator.platform.toLowerCase();
      if (platform.includes('mac')) {
        setOs('mac');
      } else if (platform.includes('linux')) {
        setOs('linux');
      } else if (platform.includes('win')) {
        setOs('windows');
      }
    }, []);

    const getInstallInstructions = () => {
      switch (os) {
        case 'mac':
          return {
            title: "Install Arch Network local validator (MacOS)",
            command: "$(curl -sSfL https://release.arch.network/latest/install.sh)"
          };
        case 'linux':
          return {
            title: "Install Arch Network local validator (Linux)",
            command: "$(curl -sSfL https://release.arch.network/latest/install.sh)"
          };
        default:
          return {
            title: "Install Arch Network local validator",
            command: "Installation instructions not available for your operating system"
          };
      }
    };

    const instructions = getInstallInstructions();

    const handleInstallCopy = async () => {
      await navigator.clipboard.writeText(`sh -c "${instructions.command}"`);
      setCopiedInstall(true);
      setTimeout(() => setCopiedInstall(false), 2000);
    };

    const handleValidatorCopy = async () => {
      await navigator.clipboard.writeText('arch-local-validator --bitcoin-rpc-endpoint [bitcoin-rpc-endpoint] --bitcoin-rpc-port [bitcoin-rpc-port] --bitcoin-rpc-username [bitcoin-rpc-username] --bitcoin-rpc-password [bitcoin-rpc-password]');
      setCopiedValidator(true);
      setTimeout(() => setCopiedValidator(false), 2000);
    };

    const handleClose = () => {
      if (persistDismissal) {
        localStorage.setItem(MODAL_PREFERENCE_KEY, 'true');
      }
      onClose();
    };

    const wasDismissed = persistDismissal && localStorage.getItem(MODAL_PREFERENCE_KEY) === 'true';
    if (!isOpen || isConnected || wasDismissed) return null;

    return (
      <div className="fixed inset-0 z-50">
        {/* Layer 2: dimmed overlay */}
        <div
          className="absolute inset-0 bg-black/50"
          aria-hidden="true"
          onClick={handleClose}
        />

        {/* Layer 3: centered modal */}
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-[#1C1E26] border border-gray-800 rounded-lg p-6 shadow-lg animate-in fade-in">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-xl font-semibold text-white">
                  Connect to {network}
                </h1>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleClose}
                className="h-9 w-9 rounded-md hover:bg-gray-700/50 text-gray-300 hover:text-white"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="bg-[#15171E] text-red-300 p-4 rounded-md flex items-start gap-3 mt-5">
              <span className="text-2xl leading-none">☹</span>
              <div className="text-sm">
                <div>
                  Unable to connect to {network} using <span className="font-mono">{actualUrl || rpcUrl}</span>
                </div>
                {actualUrl && actualUrl !== rpcUrl && (
                  <div className="text-xs mt-1 text-red-200/80">
                    (Attempted connection via {actualUrl})
                  </div>
                )}
              </div>
            </div>

          <div className="mt-6">
            <h2 className="text-lg font-semibold text-white mb-2">
              {isLocalnet ? 'How to connect' : 'Connection Issues'}
            </h2>
            <p className="text-gray-400 mb-6">
              {isLocalnet
                ? 'Here are the steps for connecting to localnet from playground.'
                : `Common solutions for connecting to ${network}:`}
            </p>

            <div className="space-y-6">
              {isLocalnet ? (
                <>
                  <div>
                    <h3 className="text-white font-medium mb-2">
                      1. {instructions.title}
                    </h3>
                    <p className="text-gray-400 mb-2">
                      Run the following command in your terminal:
                    </p>
                    <div className="bg-[#15171E] p-4 rounded-md font-mono text-sm whitespace-pre-wrap overflow-x-auto relative group">
                      <code>
                        {os !== 'unknown' ? (
                          <>
                            <span className="text-green-400">sh</span>{" "}
                            <span className="text-white">-c</span>{" "}
                            <span className="text-green-400">
                              "{instructions.command}"
                            </span>
                          </>
                        ) : (
                          <span className="text-yellow-400">
                            {instructions.command}
                          </span>
                        )}
                      </code>
                      {os !== 'unknown' && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="absolute right-2 top-2 bg-gray-700/50 hover:bg-gray-600 text-gray-300 hover:text-white"
                          onClick={handleInstallCopy}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                    {copiedInstall && <CopiedNotification />}
                  </div>

                  <div>
                    <h3 className="text-white font-medium mb-2">
                      2. Start the local validator
                    </h3>
                    <div className="bg-[#15171E] p-4 rounded-md font-mono text-sm relative group">
                      <code>
                        <span className="text-green-400">arch-local-validator</span>
                        <span className="text-white"> --bitcoin-rpc-endpoint </span>
                        <span className="text-green-400">[bitcoin-rpc-endpoint]</span>
                        <span className="text-white"> --bitcoin-rpc-port </span>
                        <span className="text-green-400">[bitcoin-rpc-port]</span>
                        <span className="text-white"> --bitcoin-rpc-username </span>
                        <span className="text-green-400">[bitcoin-rpc-username]</span>
                        <span className="text-white"> --bitcoin-rpc-password </span>
                        <span className="text-green-400">[bitcoin-rpc-password]</span>
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute right-2 top-2 bg-gray-700/50 hover:bg-gray-600 text-gray-300 hover:text-white"
                        onClick={handleValidatorCopy}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    {copiedValidator && <CopiedNotification />}
                  </div>
                </>
              ) : (
                <ul className="list-disc pl-4 space-y-3 text-gray-300">
                  <li>Check your internet connection</li>
                  <li>Verify the RPC endpoint is correct</li>
                  <li>Make sure the {network} is currently operational</li>
                  <li>Try switching to a different RPC endpoint</li>
                </ul>
              )}
            </div>

            <div className="mt-6 text-gray-400 text-sm">
              {isLocalnet ? (
                <a href="https://docs.arch.network/book/" target="_blank" rel="noopener noreferrer" className="text-white font-medium flex items-center gap-2">
                  <span>❯</span> Having issues?
                </a>
              ) : (
                <p>You can change your RPC endpoint in the configuration panel.</p>
              )}
            </div>
          </div>
          </div>
        </div>
      </div>
    );
  };