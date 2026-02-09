import React, { useRef, useState } from 'react';
import {
  Folder,
  Plus,
  Trash2,
  Pencil,
  Upload,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import DeleteConfirmDialog from './DeleteConfirmDialog';
import type { FileNode } from '../../types';

interface FileContextMenuProps {
  node: FileNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  position: { x: number; y: number };
  onNewFile: () => void;
  onNewFolder: () => void;
  onDelete: () => void;
  onRename: () => void;
}

const FileContextMenu: React.FC<FileContextMenuProps> = ({
  node,
  open,
  onOpenChange,
  position,
  onNewFile,
  onNewFolder,
  onDelete,
  onRename,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  const isTopLevelFolder = node.type === 'directory' && ['src', 'client'].includes(node.name);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    onNewFile();
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDelete = () => {
    if (node.type === 'directory') {
      setIsDeleteDialogOpen(true);
    } else {
      onDelete();
    }
  };

  return (
    <>
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        {/* Invisible trigger anchored at click position */}
        <DropdownMenuTrigger asChild>
          <span
            className="fixed w-0 h-0 pointer-events-none"
            style={{ left: position.x, top: position.y }}
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent className="bg-gray-800 border-gray-700 min-w-[160px]" align="start">
          {node.type === 'directory' && (
            <>
              <DropdownMenuItem onClick={() => onNewFile()} className="text-gray-300 hover:bg-gray-700 cursor-pointer text-xs">
                <Plus size={14} className="mr-2" />
                New File
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onNewFolder} className="text-gray-300 hover:bg-gray-700 cursor-pointer text-xs">
                <Folder size={14} className="mr-2" />
                New Folder
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => fileInputRef.current?.click()} className="text-gray-300 hover:bg-gray-700 cursor-pointer text-xs">
                <Upload size={14} className="mr-2" />
                Import File
              </DropdownMenuItem>
            </>
          )}
          {!isTopLevelFolder && (
            <>
              <DropdownMenuItem onClick={onRename} className="text-gray-300 hover:bg-gray-700 cursor-pointer text-xs">
                <Pencil size={14} className="mr-2" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem className="text-red-400 hover:bg-gray-700 cursor-pointer text-xs" onClick={handleDelete}>
                <Trash2 size={14} className="mr-2" />
                Delete
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileSelect}
        />
      </DropdownMenu>

      <DeleteConfirmDialog
        isOpen={isDeleteDialogOpen}
        onClose={() => setIsDeleteDialogOpen(false)}
        onConfirm={onDelete}
        itemName={node.name}
        itemType={node.type}
      />
    </>
  );
};

export default FileContextMenu;
