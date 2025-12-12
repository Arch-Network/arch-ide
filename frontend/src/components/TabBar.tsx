import React from 'react';
import { WrapText, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FileNode, Project } from '../types';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { findFileInProject } from '../App';

interface TabBarProps {
  openFiles: FileNode[];
  currentFile: FileNode | null;
  onSelectFile: (file: FileNode) => void;
  onCloseFile: (file: FileNode) => void;
  currentProject: Project | null;
  isWordWrapEnabled?: boolean;
  onToggleWordWrap?: () => void;
}

const TabBar = ({ openFiles, currentFile, onSelectFile, onCloseFile, currentProject, isWordWrapEnabled = true, onToggleWordWrap }: TabBarProps) => {
  const handleTabSelect = (file: FileNode) => {
    console.group('TabBar handleTabSelect');
    console.log('Tab selected:', {
      name: file.name,
      path: file.path,
      type: file.type,
      contentLength: file.content?.length,
      contentPreview: file.content?.substring(0, 100)
    });

    // Find the file in openFiles first since it has the latest content
    const openFile = openFiles.find(f => f.path === file.path || f.name === file.name);

    if (openFile) {
      console.log('Found file in openFiles:', {
        name: openFile.name,
        path: openFile.path,
        contentLength: openFile.content?.length,
        contentPreview: openFile.content?.substring(0, 100)
      });
      onSelectFile(openFile);
    } else {
      console.warn('File not found in openFiles, falling back to project files:', file.path || file.name);
      // Fallback to project files if not found in open files
      const projectFile = findFileInProject(currentProject?.files || [], file.path || file.name);
      onSelectFile(projectFile || file);
    }

    console.groupEnd();
  };

  return (
    <div className="flex items-center bg-gray-800 border-b border-gray-700">
      <div className="flex overflow-x-auto flex-1 min-w-0">
        {openFiles.map((file) => (
          <div
            key={file.path || file.name}
            className={cn(
              "flex items-center gap-2 px-4 py-2 border-r border-gray-700 cursor-pointer hover:bg-gray-700",
              (currentFile?.path || currentFile?.name) === (file.path || file.name) && "bg-gray-700"
            )}
            onClick={() => handleTabSelect(file)}
          >
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="text-sm">
                    {file.name}
                  </span>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{file.path ? file.path : file.name}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <button
              className="opacity-50 hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                onCloseFile(file);
              }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {onToggleWordWrap && (
        <div className="flex items-center px-2 border-l border-gray-700">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={onToggleWordWrap}
                  className={cn(
                    "h-8 w-8 rounded-md flex items-center justify-center hover:bg-gray-700 transition-colors",
                    isWordWrapEnabled ? "text-white" : "text-gray-400"
                  )}
                  aria-label={isWordWrapEnabled ? "Disable word wrap" : "Enable word wrap"}
                >
                  <WrapText className="h-4 w-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isWordWrapEnabled ? "Word wrap: On" : "Word wrap: Off"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      )}
    </div>
  );
};

export default TabBar;