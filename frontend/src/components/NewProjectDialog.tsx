import React, { useState } from 'react';
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
      <DialogContent className="bg-white">
        <DialogHeader>
          <DialogTitle className="text-gray-900">Create New Project</DialogTitle>
          <DialogDescription className="text-gray-500">
            Choose a framework and create a new Arch Network project
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="name" className="text-gray-700">
                Project Name
              </label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="border-gray-300 bg-white text-gray-900 focus:border-gray-400 focus:ring-gray-400"
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="description" className="text-gray-700">
                Description
              </label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="border-gray-300 bg-white text-gray-900 focus:border-gray-400 focus:ring-gray-400"
              />
            </div>

            {/* Framework Selection */}
            <div className="grid gap-3">
              <label className="text-gray-700 font-medium">
                Choose a Framework
              </label>
              <div className="grid grid-cols-2 gap-3">
                {/* Native Rust */}
                <button
                  type="button"
                  onClick={() => setFramework('native')}
                  className={`relative p-4 rounded-lg border-2 transition-all text-left ${
                    framework === 'native'
                      ? 'border-[#F7931A] bg-orange-50'
                      : 'border-gray-300 bg-white hover:border-gray-400'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-3xl">🦀</div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">Native (Rust)</h3>
                      <p className="text-xs text-gray-600 mt-1">
                        Pure Rust program using Arch SDK
                      </p>
                    </div>
                  </div>
                  {framework === 'native' && (
                    <div className="absolute top-2 right-2">
                      <span className="text-[#F7931A]">✓</span>
                    </div>
                  )}
                </button>

                {/* Satellite */}
                <button
                  type="button"
                  onClick={() => setFramework('satellite')}
                  className={`relative p-4 rounded-lg border-2 transition-all text-left ${
                    framework === 'satellite'
                      ? 'border-[#F7931A] bg-orange-50'
                      : 'border-gray-300 bg-white hover:border-gray-400'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className="text-3xl">🛰️</div>
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">Satellite (Rust)</h3>
                      <p className="text-xs text-gray-600 mt-1">
                        Framework for cleaner Arch programs
                      </p>
                    </div>
                  </div>
                  {framework === 'satellite' && (
                    <div className="absolute top-2 right-2">
                      <span className="text-[#F7931A]">✓</span>
                    </div>
                  )}
                </button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}
              className="border-gray-300 bg-white text-gray-900 hover:bg-gray-50">
              Cancel
            </Button>
            <Button 
              type="submit" 
              className="bg-[#E05A1A] hover:bg-[#d14e12] text-white"
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