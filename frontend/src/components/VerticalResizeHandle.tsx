import React from 'react';
import { GripVertical } from 'lucide-react';

interface VerticalResizeHandleProps {
  onMouseDown: (e: React.MouseEvent) => void;
}

const VerticalResizeHandle = ({ onMouseDown }: VerticalResizeHandleProps) => {
  return (
    <div
      className="w-1 cursor-col-resize flex items-center justify-center hover:bg-accent absolute right-0 top-0 bottom-0 transition-colors"
      onMouseDown={onMouseDown}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
    >
      <GripVertical size={16} className="text-muted-foreground" aria-hidden="true" />
    </div>
  );
};

export default VerticalResizeHandle;