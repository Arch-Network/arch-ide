import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { validateName } from '../utils/nameValidation';

interface RenameDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onRename: (newName: string) => void;
  currentName: string;
  type: 'file' | 'directory';
  /** Names of the item's siblings, excluding its own. */
  existingNames: string[];
}

const RenameDialog = ({ isOpen, onClose, onRename, currentName, type, existingNames }: RenameDialogProps) => {
  const [name, setName] = useState(currentName);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when dialog opens with new item
  useEffect(() => {
    if (isOpen) {
      setName(currentName);
      setError('');

      // Use a small timeout to ensure the dialog is fully rendered
      const timeoutId = setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();

          // For files, select the name part without the extension
          if (type === 'file' && currentName.includes('.')) {
            const extensionIndex = currentName.lastIndexOf('.');
            inputRef.current.setSelectionRange(0, extensionIndex);
          } else {
            // For folders, select the entire name
            inputRef.current.select();
          }
        }
      }, 50);

      return () => clearTimeout(timeoutId);
    }
  }, [isOpen, currentName, type]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    const trimmed = name.trim();
    if (trimmed === currentName) {
      onClose();
      return;
    }

    const validationError = validateName(trimmed, type === 'file' ? 'file' : 'folder', existingNames);
    if (validationError) {
      setError(validationError);
      return;
    }

    onRename(trimmed);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-card text-foreground border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">Rename {type === 'file' ? 'File' : 'Folder'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="rename-name" className="text-foreground">New name</Label>
              <Input
                id="rename-name"
                ref={inputRef}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError('');
                }}
                onKeyDown={handleKeyDown}
                placeholder={`Enter new ${type === 'file' ? 'file' : 'folder'} name`}
                className="bg-background text-foreground border-border"
                aria-invalid={!!error}
                aria-describedby={error ? 'rename-error' : undefined}
              />
              {error && (
                <p id="rename-error" role="alert" className="text-danger text-sm">
                  {error}
                </p>
              )}
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" onClick={onClose} className="text-foreground">
              Cancel
            </Button>
            <Button type="submit" className="bg-brand hover:bg-brand-hover text-brand-foreground">
              Rename
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default RenameDialog;