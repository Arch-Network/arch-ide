import * as ToggleGroupPrimitive from '@radix-ui/react-toggle-group';
import React from 'react';

export const ToggleGroup = ToggleGroupPrimitive.Root;
export const ToggleGroupItem = React.forwardRef<HTMLButtonElement, React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item>>(
  ({ className = '', ...props }, ref) => (
    <ToggleGroupPrimitive.Item
      ref={ref}
      className={`inline-flex items-center justify-center rounded-full h-7 px-3 text-xs transition-colors data-[state=on]:bg-foreground data-[state=on]:text-background data-[state=off]:text-foreground/70 hover:data-[state=off]:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring ${className}`}
      {...props}
    />
  )
);
ToggleGroupItem.displayName = 'ToggleGroupItem';
