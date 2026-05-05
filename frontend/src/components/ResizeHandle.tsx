import React from 'react';
import { GripHorizontal } from 'lucide-react';

interface ResizeHandleProps {
  onMouseDown: (e: React.MouseEvent) => void;
}

const ResizeHandle = ({ onMouseDown }: ResizeHandleProps) => {
  return (
    <div
      className="h-2 border-t border-b border-border bg-surface-1 cursor-row-resize flex items-center justify-center hover:bg-accent transition-colors"
      onMouseDown={onMouseDown}
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize panel"
    >
      <GripHorizontal size={16} className="text-muted-foreground" aria-hidden="true" />
    </div>
  );
};

export default ResizeHandle;