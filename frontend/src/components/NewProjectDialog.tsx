import React, { useState } from 'react';
import { Check } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ProjectFramework } from '@/types';

interface NewProjectDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateProject: (name: string, description: string, framework?: ProjectFramework) => void;
}

const NewProjectDialog = ({ isOpen, onClose, onCreateProject }: NewProjectDialogProps) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [framework, setFramework] = useState<ProjectFramework>('native');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Prevent submission if name is blank
    if (!name.trim()) {
      return;
    }
    onCreateProject(name, description, framework);
    setName('');
    setDescription('');
    setFramework('native');
  };

  const isNameValid = name.trim().length > 0;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-background text-foreground border-border sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground">Create New Project</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Choose a framework and create a new Arch Network project
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="name" className="text-sm font-medium text-foreground">
                Project Name
              </label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="bg-background text-foreground border-input"
                placeholder="my-project"
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="description" className="text-sm font-medium text-foreground">
                Description
              </label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="bg-background text-foreground border-input min-h-[80px]"
                placeholder="Optional project description"
              />
            </div>

            {/* Framework Selection */}
            <div className="grid gap-3">
              <label className="text-sm font-medium text-foreground">
                Choose a Framework
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* Native Rust */}
                <button
                  type="button"
                  onClick={() => setFramework('native')}
                  aria-pressed={framework === 'native'}
                  className={`relative p-4 rounded-lg border-2 transition-all text-left ${
                    framework === 'native'
                      ? 'border-brand bg-brand/10 dark:bg-brand/20'
                      : 'border-input bg-background hover:border-muted-foreground/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-3xl" aria-hidden="true">🦀</div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground">Native (Rust)</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Pure Rust program using Arch SDK
                      </p>
                    </div>
                  </div>
                  {framework === 'native' && (
                    <div className="absolute top-2 right-2" aria-hidden="true">
                      <Check className="h-4 w-4 text-brand" />
                    </div>
                  )}
                </button>

                {/* Satellite */}
                <button
                  type="button"
                  onClick={() => setFramework('satellite')}
                  aria-pressed={framework === 'satellite'}
                  className={`relative p-4 rounded-lg border-2 transition-all text-left ${
                    framework === 'satellite'
                      ? 'border-brand bg-brand/10 dark:bg-brand/20'
                      : 'border-input bg-background hover:border-muted-foreground/50'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-3xl" aria-hidden="true">🛰️</div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-foreground">Satellite (Rust)</h3>
                      <p className="text-xs text-muted-foreground mt-1">
                        Framework for cleaner Arch programs
                      </p>
                    </div>
                  </div>
                  {framework === 'satellite' && (
                    <div className="absolute top-2 right-2" aria-hidden="true">
                      <Check className="h-4 w-4 text-brand" />
                    </div>
                  )}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={onClose} className="text-foreground">
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-brand hover:bg-brand-hover text-brand-foreground"
              disabled={!isNameValid}
            >
              Create Project
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

export default NewProjectDialog;