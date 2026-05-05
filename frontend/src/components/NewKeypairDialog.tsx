import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "./ui/dialog";
import { Button } from "./ui/button";
import { AlertTriangle, WifiOff } from "lucide-react";
import { useState } from "react";
import { useToast } from "./ui/use-toast";

interface NewKeypairDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  isConnected: boolean;
}

export const NewKeypairDialog = ({
  isOpen,
  onClose,
  onConfirm,
  isConnected
}: NewKeypairDialogProps) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const { toast } = useToast();

  const handleConfirm = async () => {
    if (!isConnected) {
      toast({
        variant: "destructive",
        title: "Connection Error",
        description: "Cannot generate new keypair. Please check your RPC connection and try again.",
      });
      return;
    }

    setIsGenerating(true);
    try {
      await onConfirm();
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "Failed to generate new keypair. Please try again.",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border text-foreground">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-foreground">Create a new program keypair?</DialogTitle>
          <DialogDescription className="pt-2 text-sm text-muted-foreground">
            This will create a brand new keypair for your program.
          </DialogDescription>
        </DialogHeader>

        {!isConnected && (
          <div className="flex items-center gap-2 p-3 bg-danger/10 border border-danger/20 rounded-lg" role="alert">
            <WifiOff className="h-4 w-4 text-danger" aria-hidden="true" />
            <p className="text-xs text-danger">
              No RPC connection available. Please check your connection and try again.
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 p-3 bg-warning/10 border border-warning/20 rounded-lg" role="alert">
          <AlertTriangle className="h-4 w-4 text-warning" aria-hidden="true" />
          <p className="text-xs text-warning">
            The old keypair will be lost if you don't save it.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="text-foreground/80 border-border hover:bg-accent hover:text-foreground">
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!isConnected || isGenerating}
            className="bg-brand hover:bg-brand-hover text-brand-foreground"
          >
            {isGenerating ? "Generating..." : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};