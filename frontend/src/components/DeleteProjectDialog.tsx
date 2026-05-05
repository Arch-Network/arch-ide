import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertTriangle } from 'lucide-react';

interface DeleteProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (deleteAll: boolean) => Promise<void>;
  projectName?: string;
}

const DeleteProjectDialog = ({ isOpen, onClose, onConfirm, projectName }: DeleteProjectDialogProps) => {
  const [deleteAll, setDeleteAll] = useState(false);

  const handleConfirm = async () => {
    await onConfirm(deleteAll);
    setDeleteAll(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex gap-2 items-center text-foreground">
            <AlertTriangle className="h-5 w-5 text-danger" aria-hidden="true" />
            Confirm Delete
          </DialogTitle>
          <DialogDescription className="text-muted-foreground">
            {deleteAll
              ? "This will permanently delete all projects. This action cannot be undone."
              : `Are you sure you want to delete "${projectName}"? This action cannot be undone.`
            }
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center space-x-2 py-4">
          <Checkbox
            id="delete-all"
            checked={deleteAll}
            onCheckedChange={(checked) => setDeleteAll(checked as boolean)}
          />
          <label
            htmlFor="delete-all"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-foreground"
          >
            Delete all projects
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm}>
            {deleteAll ? 'Delete All Projects' : 'Delete Project'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default DeleteProjectDialog;