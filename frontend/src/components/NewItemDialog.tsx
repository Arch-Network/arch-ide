import React, { useState, useEffect, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface NewItemDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
  type: 'file' | 'directory';
}

const NewItemDialog = ({ isOpen, onClose, onSubmit, type }: NewItemDialogProps) => {
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input field when the dialog opens
  useEffect(() => {
    if (isOpen) {
      // Use a small timeout to ensure the dialog is fully rendered
      const timeoutId = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);

      return () => clearTimeout(timeoutId);
    }
  }, [isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    // Validate file/folder name
    const isValid = /^[a-zA-Z0-9_.-]+$/.test(name);
    if (!isValid) {
      setError('Invalid name. Use only letters, numbers, underscore, dot, or dash');
      return;
    }

    onSubmit(name);
    setName('');
    setError('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-card text-foreground border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground">New {type === 'file' ? 'File' : 'Folder'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="new-item-name" className="text-foreground">Name</Label>
              <Input
                id="new-item-name"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setError('');
                }}
                placeholder={type === 'file' ? 'filename.rs' : 'folder-name'}
                autoFocus
                ref={inputRef}
                className="bg-background text-foreground border-border"
                aria-invalid={!!error}
                aria-describedby={error ? 'new-item-error' : undefined}
              />
              {error && (
                <p id="new-item-error" role="alert" className="text-danger text-sm">
                  {error}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} className="text-foreground">
              Cancel
            </Button>
            <Button type="submit" className="bg-brand hover:bg-brand-hover text-brand-foreground">
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default NewItemDialog;