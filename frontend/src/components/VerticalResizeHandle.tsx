import React from 'react';
import { GripVertical } from 'lucide-react';
import type { ResizeSeparatorProps } from '../hooks/useResizablePanel';

const VerticalResizeHandle = (separatorProps: ResizeSeparatorProps) => {
  return (
    <div
      className="w-1 cursor-col-resize flex items-center justify-center hover:bg-accent absolute right-0 top-0 bottom-0 transition-colors focus-visible:outline-offset-[-2px] focus-visible:z-sticky"
      {...separatorProps}
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label="Resize sidebar"
    >
      <GripVertical size={16} className="text-muted-foreground" aria-hidden="true" />
    </div>
  );
};

export default VerticalResizeHandle;