import React, { useRef, useEffect } from 'react';
import { Search, X } from 'lucide-react';

interface FileSearchBarProps {
  value: string;
  onChange: (value: string) => void;
  onClose: () => void;
}

const FileSearchBar: React.FC<FileSearchBarProps> = ({ value, onChange, onClose }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onChange('');
      onClose();
    }
  };

  return (
    <div className="px-2 py-1.5 border-b border-border">
      <div className="flex items-center gap-2 bg-background/60 border border-border rounded-lg px-2.5 py-1.5 focus-within:ring-1 focus-within:ring-brand/50">
        <Search size={13} className="text-muted-foreground shrink-0" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search files..."
          aria-label="Search files"
          className="flex-1 bg-transparent text-xs text-foreground/80 placeholder:text-muted-foreground/70 outline-none"
        />
        {value && (
          <button
            type="button"
            onClick={() => { onChange(''); inputRef.current?.focus(); }}
            className="hover:bg-accent p-0.5 rounded transition-colors"
            aria-label="Clear search"
          >
            <X size={12} className="text-muted-foreground" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
};

export default FileSearchBar;
