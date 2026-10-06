import React from 'react';
import { GripHorizontal } from 'lucide-react';
import type { ResizeSeparatorProps } from '../hooks/useResizablePanel';

const ResizeHandle = (separatorProps: ResizeSeparatorProps) => {
  return (
    <div
      className="h-2 border-t border-b border-border bg-surface-1 cursor-row-resize flex items-center justify-center hover:bg-accent transition-colors focus-visible:outline-offset-[-2px]"
      {...separatorProps}
      role="separator"
      tabIndex={0}
      aria-orientation="horizontal"
      aria-label="Resize panel"
    >
      <GripHorizontal size={16} className="text-muted-foreground" aria-hidden="true" />
    </div>
  );
};

export default ResizeHandle;