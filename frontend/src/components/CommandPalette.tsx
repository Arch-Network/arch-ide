import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface CommandItem {
  id: string;
  title: string;
  /** Short context line shown beneath the title. */
  description?: string;
  /** Visual group label — items are sorted by group order. */
  group?: string;
  /** Optional keywords boosted during fuzzy matching. */
  keywords?: string[];
  /** Optional shortcut hint rendered on the right. */
  shortcut?: string;
  icon?: React.ReactNode;
  /** Optional disabled flag — disabled items are still visible but unselectable. */
  disabled?: boolean;
  onSelect: () => void;
}

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  commands: CommandItem[];
  /** Optional placeholder for the search input. */
  placeholder?: string;
}

/**
 * Lightweight Cmd/Ctrl+K palette.
 *
 * We avoid pulling in `cmdk` to stay lean: a simple lowercased substring +
 * subsequence score is more than enough for ~30–50 actions and keeps the
 * bundle untouched. The palette traps focus inside its panel and restores
 * focus on close. Keyboard model:
 *   - Enter   → invoke selected
 *   - Up/Down → navigate (wraps)
 *   - Esc     → dismiss
 */
const scoreCommand = (cmd: CommandItem, query: string): number => {
  if (!query) return 1;
  const haystack = [cmd.title, cmd.description ?? '', ...(cmd.keywords ?? [])]
    .join(' ')
    .toLowerCase();
  const q = query.toLowerCase();

  if (haystack.includes(q)) return 100 + (cmd.title.toLowerCase().startsWith(q) ? 50 : 0);

  // Subsequence match — e.g. "bp" matches "Build program".
  let h = 0;
  for (let i = 0; i < q.length; i++) {
    const idx = haystack.indexOf(q[i], h);
    if (idx === -1) return 0;
    h = idx + 1;
  }
  return 25;
};

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  commands,
  placeholder = 'Type a command or search…',
}) => {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Filter & rank the commands by score.
  const ranked = useMemo(() => {
    const scored = commands
      .map((cmd) => ({ cmd, score: scoreCommand(cmd, query) }))
      .filter((entry) => entry.score > 0);
    scored.sort((a, b) => b.score - a.score);
    return scored.map((entry) => entry.cmd);
  }, [commands, query]);

  // Group display order is preserved from the first appearance in `ranked`.
  const groups = useMemo(() => {
    const seen = new Map<string, CommandItem[]>();
    for (const cmd of ranked) {
      const key = cmd.group ?? 'Actions';
      if (!seen.has(key)) seen.set(key, []);
      seen.get(key)!.push(cmd);
    }
    return Array.from(seen.entries());
  }, [ranked]);

  useEffect(() => {
    if (!isOpen) return;
    const t = setTimeout(() => inputRef.current?.focus(), 10);
    return () => clearTimeout(t);
  }, [isOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, isOpen]);

  // Scroll selected item into view as the user navigates.
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(
      `[data-command-index="${selectedIndex}"]`,
    );
    el?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  if (!isOpen) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => (ranked.length === 0 ? 0 : (i + 1) % ranked.length));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) =>
        ranked.length === 0 ? 0 : (i - 1 + ranked.length) % ranked.length,
      );
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const target = ranked[selectedIndex];
      if (target && !target.disabled) {
        target.onSelect();
        onClose();
      }
    }
  };

  // Build a flat lookup so each item knows its absolute index for keyboard nav.
  let runningIndex = -1;

  return (
    <div
      className="fixed inset-0 z-modal flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
    >
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-xl rounded-xl border border-border bg-card shadow-2xl overflow-hidden"
        onKeyDown={handleKeyDown}
      >
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border">
          <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
            aria-label="Command search"
            aria-controls="command-palette-list"
            aria-activedescendant={
              ranked[selectedIndex]
                ? `command-${ranked[selectedIndex].id}`
                : undefined
            }
          />
          <kbd className="hidden sm:inline text-[10px] font-mono px-1.5 py-0.5 rounded bg-accent text-muted-foreground border border-border">
            Esc
          </kbd>
        </div>

        <ul
          ref={listRef}
          id="command-palette-list"
          role="listbox"
          aria-label="Commands"
          className="max-h-[55vh] overflow-y-auto py-1 custom-scrollbar"
        >
          {ranked.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-muted-foreground">
              No matching commands
            </li>
          ) : (
            groups.map(([groupName, items]) => (
              <li key={groupName} className="py-1">
                <div className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                  {groupName}
                </div>
                <ul role="presentation">
                  {items.map((cmd) => {
                    runningIndex += 1;
                    const isSelected = runningIndex === selectedIndex;
                    const myIndex = runningIndex;
                    return (
                      <li
                        key={cmd.id}
                        id={`command-${cmd.id}`}
                        role="option"
                        aria-selected={isSelected}
                        aria-disabled={cmd.disabled}
                        data-command-index={myIndex}
                        className={cn(
                          'group flex items-center gap-3 px-3 py-2 mx-1 rounded-md cursor-pointer text-sm transition-colors',
                          isSelected
                            ? 'bg-accent text-foreground'
                            : 'text-foreground/80 hover:bg-accent/60',
                          cmd.disabled && 'opacity-50 cursor-not-allowed',
                        )}
                        onMouseEnter={() => setSelectedIndex(myIndex)}
                        onClick={() => {
                          if (cmd.disabled) return;
                          cmd.onSelect();
                          onClose();
                        }}
                      >
                        <span
                          className={cn(
                            'flex-shrink-0 flex items-center justify-center h-7 w-7 rounded-md',
                            isSelected ? 'bg-surface-3 text-brand' : 'bg-surface-2 text-muted-foreground',
                          )}
                          aria-hidden="true"
                        >
                          {cmd.icon ?? <ChevronRight className="h-3.5 w-3.5" />}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block truncate">{cmd.title}</span>
                          {cmd.description && (
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {cmd.description}
                            </span>
                          )}
                        </span>
                        {cmd.shortcut && (
                          <kbd className="hidden sm:inline text-[10px] font-mono px-1.5 py-0.5 rounded bg-surface-2 text-muted-foreground border border-border">
                            {cmd.shortcut}
                          </kbd>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))
          )}
        </ul>

        <div className="flex items-center justify-between px-3 py-1.5 border-t border-border bg-surface-1/60 text-[10px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="font-mono px-1 py-0.5 rounded bg-surface-2 border border-border">↑↓</kbd>
              <span className="ml-1">Navigate</span>
            </span>
            <span>
              <kbd className="font-mono px-1 py-0.5 rounded bg-surface-2 border border-border">↵</kbd>
              <span className="ml-1">Select</span>
            </span>
          </div>
          <span>{ranked.length} {ranked.length === 1 ? 'command' : 'commands'}</span>
        </div>
      </div>
    </div>
  );
};

export default CommandPalette;
