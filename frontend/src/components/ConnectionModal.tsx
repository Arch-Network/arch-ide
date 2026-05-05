import { X, Frown } from "lucide-react";
import { Button } from "./ui/button";

interface ConnectionModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ConnectionModal = ({ isOpen, onClose }: ConnectionModalProps) => {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-modal" role="dialog" aria-modal="true" aria-label="Connect to localnet">
      <div
        className="absolute inset-0 bg-black/50"
        aria-hidden="true"
        onClick={onClose}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-xl bg-card border border-border rounded-lg p-6 shadow-lg animate-in fade-in">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-xl font-semibold text-foreground">
              Connect to localnet
            </h1>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </Button>
          </div>

          <div className="bg-surface-0 text-danger p-4 rounded-md flex items-center gap-2 mt-4" role="alert">
            <Frown className="h-5 w-5" aria-hidden="true" />
            <span>Unable to connect to localnet</span>
          </div>

          <div className="mt-6">
            <h2 className="text-lg font-mono text-foreground mb-2">How to connect</h2>
            <p className="text-muted-foreground mb-6">
              Here are the steps for connecting to localnet from playground.
            </p>

            <div className="space-y-6">
              <div>
                <h3 className="text-foreground font-mono mb-2">
                  1. Install Solana / Agave toolchain (macOS / Linux)
                </h3>
                <p className="text-muted-foreground mb-2">
                  Install from source (required; <code className="text-muted-foreground/80">agave-install update</code> is no longer supported). Run in your terminal:
                </p>
                <pre className="bg-surface-0 p-4 rounded-md font-mono text-sm">
                  <code>
                    <span className="text-success">sh</span>{" "}
                    <span className="text-foreground">-c</span>{" "}
                    <span className="text-success">
                      "$(curl -sSfL https://release.anza.xyz/v3.1.8/install)"
                    </span>
                  </code>
                </pre>
                <p className="text-muted-foreground text-xs mt-2">
                  If builds fail after updating your program dependencies, update your solana-tools to the latest using the command above.
                </p>
              </div>

              <div>
                <h3 className="text-foreground font-mono mb-2">
                  2. Start a local test validator
                </h3>
                <pre className="bg-surface-0 p-4 rounded-md font-mono text-sm">
                  <code>
                    <span className="text-success">solana-test-validator</span>
                  </code>
                </pre>
              </div>
            </div>

            <div className="mt-6">
              <button type="button" className="text-foreground font-medium flex items-center gap-2 hover:text-brand transition-colors">
                <span aria-hidden="true">›</span> Having issues?
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
