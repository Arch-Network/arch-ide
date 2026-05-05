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
      <DialogContent className="bg-card border-border max-w-md p-0 overflow-hidden rounded-xl text-foreground">
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-brand/10 flex items-center justify-center">
              <Rocket className="h-4.5 w-4.5 text-brand" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Deploy Program</h2>
              <span className={`text-[10px] font-semibold uppercase tracking-wider ${
                network === 'mainnet'
                  ? 'text-danger'
                  : network === 'testnet'
                    ? 'text-warning'
                    : 'text-info'
              }`}>
                {network === 'mainnet' ? 'Mainnet' : network === 'testnet' ? 'Testnet' : 'Devnet'}
              </span>
            </div>
          </div>

          {/* Ready info */}
          <div className="rounded-lg bg-success/5 border border-success/15 p-3.5">
            <div className="flex items-start gap-2.5">
              <Check className="h-4 w-4 text-success mt-0.5 shrink-0" aria-hidden="true" />
              <div className="space-y-2">
                <p className="text-xs text-success/90 font-medium">Ready to deploy</p>
                <ul className="text-[11px] text-muted-foreground space-y-1 list-disc list-inside">
                  <li>Create and fund a temporary authority account</li>
                  <li>Create your program account on-chain</li>
                  <li>Upload your compiled binary</li>
                  <li>Mark the program as executable</li>
                </ul>
                <p className="text-[11px] text-muted-foreground/80">
                  Check the console for deployment progress.
                </p>
              </div>
            </div>
          </div>

          {/* Not connected warning */}
          {!isConnected && (
            <div className="rounded-lg bg-danger/5 border border-danger/15 p-3.5" role="alert">
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="h-4 w-4 text-danger mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="text-xs text-danger font-medium">Not Connected</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Please connect to the network before deploying.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 px-5 py-3 border-t border-border">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={isDeploying}
            className="text-foreground/80 border-border hover:bg-accent hover:text-foreground text-xs h-9"
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleDeploy}
            disabled={!isConnected || isDeploying}
            className="bg-brand hover:bg-brand-hover text-brand-foreground text-xs h-9"
          >
            {isDeploying ? 'Deploying...' : 'Deploy Program'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
