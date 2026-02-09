import React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check, AlertTriangle, Rocket } from 'lucide-react';

interface DeploymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onDeploy: (utxoInfo?: { txid: string; vout: number }) => Promise<void>;
  isConnected: boolean;
  isDeploying: boolean;
  network?: 'mainnet' | 'testnet' | 'regtest' | 'devnet';
  programId?: string;
  rpcUrl?: string;
}

export const DeploymentModal = ({
  isOpen,
  onClose,
  onDeploy,
  isConnected,
  isDeploying,
  network = 'testnet'
}: DeploymentModalProps) => {

  const handleDeploy = async () => {
    onClose();
    await onDeploy();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-[#141414] border-gray-800/60 max-w-md p-0 overflow-hidden rounded-xl text-gray-200">
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-[#F7931A]/10 flex items-center justify-center">
              <Rocket className="h-4.5 w-4.5 text-[#F7931A]" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-100">Deploy Program</h2>
              <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                network === 'mainnet'
                  ? 'text-red-400'
                  : network === 'testnet'
                    ? 'text-yellow-400'
                    : 'text-blue-400'
              }`}>
                {network === 'mainnet' ? 'Mainnet' : network === 'testnet' ? 'Testnet' : 'Devnet'}
              </span>
            </div>
          </div>

          {/* Ready info */}
          <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/15 p-3.5">
            <div className="flex items-start gap-2.5">
              <Check className="h-4 w-4 text-emerald-400 mt-0.5 shrink-0" />
              <div className="space-y-2">
                <p className="text-xs text-emerald-300/90 font-medium">Ready to deploy</p>
                <ul className="text-[11px] text-gray-400 space-y-1 list-disc list-inside">
                  <li>Create and fund a temporary authority account</li>
                  <li>Create your program account on-chain</li>
                  <li>Upload your compiled binary</li>
                  <li>Mark the program as executable</li>
                </ul>
                <p className="text-[11px] text-gray-500">
                  Check the console for deployment progress.
                </p>
              </div>
            </div>
          </div>

          {/* Not connected warning */}
          {!isConnected && (
            <div className="rounded-lg bg-red-500/5 border border-red-500/15 p-3.5">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 text-red-400 mt-0.5 shrink-0" />
                <div>
                  <p className="text-xs text-red-400 font-medium">Not Connected</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Please connect to the network before deploying.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-gray-800/60">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isDeploying}
            className="text-gray-300 border-gray-700 hover:bg-gray-800 hover:text-gray-200 text-xs h-9"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleDeploy}
            disabled={!isConnected || isDeploying}
            className="bg-[#F7931A] hover:bg-[#d47b16] text-white text-xs h-9"
          >
            {isDeploying ? 'Deploying...' : 'Deploy Program'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
