import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

interface ExportProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onExport: (includeKeypairs: boolean) => void;
  projectName: string;
  hasKeypairs: boolean;
}

const ExportProjectDialog = ({ isOpen, onClose, onExport, projectName, hasKeypairs }: ExportProjectDialogProps) => {
  const [includeKeypairs, setIncludeKeypairs] = useState(false);

  useEffect(() => {
    if (isOpen) setIncludeKeypairs(false);
  }, [isOpen]);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-card border-border sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle className="text-foreground">Export Project</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Downloads "{projectName}.zip" with the project's files, name, framework, and IDL.
          </DialogDescription>
        </DialogHeader>

        {hasKeypairs && (
          <div className="space-y-3 py-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="export-include-keypairs"
                checked={includeKeypairs}
                onCheckedChange={(checked) => setIncludeKeypairs(checked === true)}
              />
              <label htmlFor="export-include-keypairs" className="text-sm font-medium leading-none text-foreground">
                Include program and authority keypairs
              </label>
            </div>
            {includeKeypairs && (
              <div role="alert" className="flex gap-2 rounded-md border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  The zip will contain these private keys in plain text. Anyone with the file controls the program
                  and the authority account, including its funds. Only share it with people you trust.
                </span>
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => onExport(includeKeypairs)}
            className="bg-brand hover:bg-brand-hover text-brand-foreground"
          >
            Export
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExportProjectDialog;
