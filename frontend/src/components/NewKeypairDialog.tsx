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
      <DialogContent className="bg-[#141414] border-gray-800/60 text-gray-200">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-gray-100">Create a new program keypair?</DialogTitle>
          <DialogDescription className="pt-2 text-sm text-gray-400">
            This will create a brand new keypair for your program.
          </DialogDescription>
        </DialogHeader>

        {!isConnected && (
          <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
            <WifiOff className="h-4 w-4 text-red-400" />
            <p className="text-xs text-red-400">
              No RPC connection available. Please check your connection and try again.
            </p>
          </div>
        )}

        <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
          <AlertTriangle className="h-4 w-4 text-yellow-400" />
          <p className="text-xs text-yellow-400">
            The old keypair will be lost if you don't save it.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="text-gray-300 border-gray-700 hover:bg-gray-800 hover:text-gray-200">
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={!isConnected || isGenerating}
            className="bg-[#F7931A] hover:bg-[#d47b16] text-white"
          >
            {isGenerating ? "Generating..." : "Generate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};