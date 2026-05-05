import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Trash2 } from 'lucide-react';

interface DeleteConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  itemName: string;
  itemType: 'file' | 'directory';
}

const DeleteConfirmDialog: React.FC<DeleteConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  itemName,
  itemType,
}) => {
  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-card text-foreground border-border max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-danger" aria-hidden="true" />
            Delete {itemType === 'directory' ? 'Folder' : 'File'}
          </DialogTitle>
          <DialogDescription className="text-muted-foreground text-sm pt-2">
            {itemType === 'directory' ? (
              <>Are you sure you want to delete <strong className="text-foreground/80">{itemName}</strong> and all its contents? This action cannot be undone.</>
            ) : (
              <>Are you sure you want to delete <strong className="text-foreground/80">{itemName}</strong>? This action cannot be undone.</>
            )}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-4">
          <Button type="button" variant="outline" onClick={onClose} className="text-foreground">
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleConfirm}
            className="bg-danger hover:bg-danger/90 text-danger-foreground"
          >
            Delete
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DeleteConfirmDialog;
