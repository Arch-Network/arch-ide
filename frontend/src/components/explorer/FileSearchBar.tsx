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
    <div className="px-2 py-1.5 border-b border-gray-700/60">
      <div className="flex items-center gap-2 bg-gray-900/60 border border-gray-700/50 rounded-lg px-2.5 py-1.5">
        <Search size={13} className="text-gray-500 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search files..."
          className="flex-1 bg-transparent text-xs text-gray-300 placeholder-gray-600 outline-none"
        />
        {value && (
          <button
            onClick={() => { onChange(''); inputRef.current?.focus(); }}
            className="hover:bg-gray-700/50 p-0.5 rounded transition-colors"
          >
            <X size={12} className="text-gray-500" />
          </button>
        )}
      </div>
    </div>
  );
};

export default FileSearchBar;
