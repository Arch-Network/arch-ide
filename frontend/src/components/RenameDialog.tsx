import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface RenameDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onRename: (newName: string) => void;
  currentName: string;
  type: 'file' | 'directory';
}

const RenameDialog = ({ isOpen, onClose, onRename, currentName, type }: RenameDialogProps) => {
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

  const validateName = (value: string): boolean => {
    if (!value.trim()) {
      setError('Name cannot be empty');
      return false;
    }

    // Validate file/folder name
    const isValid = /^[a-zA-Z0-9_.-]+$/.test(value);
    if (!isValid) {
      setError('Invalid name. Use only letters, numbers, underscore, dot, or dash');
      return false;
    }

    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateName(name)) {
      return;
    }

    if (name.trim() === currentName) {
      onClose();
      return;
    }

    onRename(name.trim());
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