import React, { useMemo, useState } from 'react';
import {
  Search,
  X,
  Regex,
  CaseSensitive,
  WholeWord,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FileNode } from '../types';

interface SearchPanelProps {
  files: FileNode[];
  /** Open the file (and ideally jump the editor to the matching line). */
  onOpenFile: (file: FileNode, line?: number) => void;
}

interface SearchHit {
  file: FileNode;
  /** 1-indexed for display. */
  line: number;
  preview: string;
  matchStart: number;
  matchEnd: number;
}

interface FileGroup {
  file: FileNode;
  hits: SearchHit[];
}

const MAX_HITS_PER_FILE = 200;
const MAX_TOTAL_HITS = 1000;

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const buildRegex = (
  query: string,
  options: { regex: boolean; caseSensitive: boolean; wholeWord: boolean },
): RegExp | null => {
  if (!query) return null;
  try {
    const pattern = options.regex ? query : escapeRegex(query);
    const wrapped = options.wholeWord ? `\\b(?:${pattern})\\b` : pattern;
    return new RegExp(wrapped, options.caseSensitive ? 'g' : 'gi');
  } catch {
    return null;
  }
};

/** Recursively walk every file in the project tree (including nested folders). */
const collectFiles = (nodes: FileNode[], acc: FileNode[] = []): FileNode[] => {
  for (const node of nodes) {
    if (node.type === 'directory' && node.children) {
      collectFiles(node.children, acc);
    } else if (node.type === 'file' && typeof node.content === 'string') {
      acc.push(node);
    }
  }
  return acc;
};

const decodeContent = (raw: string): string => {
  const prefix = 'data:text/plain;base64,';
  if (!raw.startsWith(prefix)) return raw;
  try {
    const base64 = raw.slice(prefix.length);
    const decoded = atob(base64);
    try {
      const utf8 = new Uint8Array(decoded.split('').map((c) => c.charCodeAt(0)));
      return new TextDecoder().decode(utf8);
    } catch {
      return decodeURIComponent(escape(decoded));
    }
  } catch {
    return raw;
  }
};

const renderHighlighted = (preview: string, start: number, end: number) => {
  if (start < 0 || end <= start) return preview;
  return (
    <>
      <span className="text-muted-foreground/80">{preview.slice(0, start)}</span>
      <span className="bg-warning/30 text-warning rounded px-0.5">
        {preview.slice(start, end)}
      </span>
      <span className="text-muted-foreground/80">{preview.slice(end)}</span>
    </>
  );
};

/**
 * Cross-file search across the in-memory project tree.
 *
 * Why purely client-side? The project lives entirely in the browser (IndexedDB
 * + in-memory tree); shipping content to a server just to grep it would be
 * slower and add an avoidable failure mode. We cap matches per file and
 * overall to keep the UI responsive on giant Cargo dumps.
 */
const SearchPanel: React.FC<SearchPanelProps> = ({ files, onOpenFile }) => {
  const [query, setQuery] = useState('');
  const [useRegex, setUseRegex] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const { groups, totalHits, truncated, regexError } = useMemo(() => {
    if (!query) {
      return { groups: [] as FileGroup[], totalHits: 0, truncated: false, regexError: false };
    }
    const re = buildRegex(query, {
      regex: useRegex,
      caseSensitive,
      wholeWord,
    });
    if (!re) {
      return { groups: [] as FileGroup[], totalHits: 0, truncated: false, regexError: useRegex };
    }

    const flat = collectFiles(files);
    const groupings: FileGroup[] = [];
    let total = 0;
    let truncated = false;

    for (const file of flat) {
      if (total >= MAX_TOTAL_HITS) {
        truncated = true;
        break;
      }
      const content = decodeContent(file.content ?? '');
      if (!content) continue;
      const lines = content.split('\n');
      const hits: SearchHit[] = [];

      for (let i = 0; i < lines.length; i++) {
        if (hits.length >= MAX_HITS_PER_FILE) break;
        const line = lines[i];
        re.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = re.exec(line))) {
          if (match.index === re.lastIndex) re.lastIndex++; // zero-width safety
          const start = match.index;
          const end = match.index + match[0].length;
          // Trim long lines around the match for the preview.
          const window = 60;
          const previewStart = Math.max(0, start - window);
          const previewEnd = Math.min(line.length, end + window);
          const prefix = previewStart > 0 ? '…' : '';
          const suffix = previewEnd < line.length ? '…' : '';
          const slice = line.slice(previewStart, previewEnd);
          const adjStart = (prefix ? 1 : 0) + (start - previewStart);
          const adjEnd = adjStart + (end - start);
          hits.push({
            file,
            line: i + 1,
            preview: prefix + slice + suffix,
            matchStart: adjStart,
            matchEnd: adjEnd,
          });
          if (hits.length >= MAX_HITS_PER_FILE) break;
        }
      }

      if (hits.length > 0) {
        groupings.push({ file, hits });
        total += hits.length;
      }
    }

    return {
      groups: groupings,
      totalHits: total,
      truncated,
      regexError: false,
    };
  }, [files, query, useRegex, caseSensitive, wholeWord]);

  const toggleGroup = (key: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Search
        </h2>
        {totalHits > 0 && (
          <span className="text-[10px] text-muted-foreground">
            {totalHits}
            {truncated ? '+' : ''} {totalHits === 1 ? 'match' : 'matches'} in {groups.length}{' '}
            {groups.length === 1 ? 'file' : 'files'}
          </span>
        )}
      </div>

      <div className="px-3 py-2 space-y-2 border-b border-border">
        <div
          className={cn(
            'flex items-center gap-2 bg-background/60 border rounded-lg px-2.5 py-1.5 focus-within:ring-1 focus-within:ring-brand/50',
            regexError ? 'border-danger' : 'border-border',
          )}
        >
          <Search
            className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0"
            aria-hidden="true"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search across project…"
            aria-label="Search query"
            className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/70 outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="hover:bg-accent p-0.5 rounded transition-colors"
              aria-label="Clear search"
            >
              <X className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1">
          <ToggleChip
            active={caseSensitive}
            onClick={() => setCaseSensitive((v) => !v)}
            label="Case sensitive"
            icon={<CaseSensitive className="h-3 w-3" aria-hidden="true" />}
          />
          <ToggleChip
            active={wholeWord}
            onClick={() => setWholeWord((v) => !v)}
            label="Whole word"
            icon={<WholeWord className="h-3 w-3" aria-hidden="true" />}
          />
          <ToggleChip
            active={useRegex}
            onClick={() => setUseRegex((v) => !v)}
            label="Regex"
            icon={<Regex className="h-3 w-3" aria-hidden="true" />}
          />
        </div>

        {regexError && (
          <p role="alert" className="text-[10px] text-danger">
            Invalid regular expression
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar">
        {!query ? (
          <EmptyState message="Type a query to search across all files." />
        ) : groups.length === 0 && !regexError ? (
          <EmptyState message={`No matches for "${query}"`} />
        ) : (
          <ul role="list" className="py-1">
            {groups.map((group) => {
              const key = group.file.path || group.file.name;
              const isCollapsed = collapsed.has(key);
              return (
                <li key={key} className="px-1 py-0.5">
                  <button
                    type="button"
                    onClick={() => toggleGroup(key)}
                    className="w-full flex items-center gap-1 px-1.5 py-1 rounded hover:bg-accent/50 text-left"
                    aria-expanded={!isCollapsed}
                  >
                    {isCollapsed ? (
                      <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" aria-hidden="true" />
                    )}
                    <span className="text-xs font-medium text-foreground/90 truncate">
                      {group.file.name}
                    </span>
                    {group.file.path && group.file.path !== group.file.name && (
                      <span className="text-[10px] text-muted-foreground truncate">
                        — {group.file.path}
                      </span>
                    )}
                    <span className="ml-auto text-[10px] text-muted-foreground bg-accent rounded-full px-1.5 py-0.5">
                      {group.hits.length}
                    </span>
                  </button>
                  {!isCollapsed && (
                    <ul role="list" className="ml-4">
                      {group.hits.map((hit, i) => (
                        <li key={`${key}-${hit.line}-${i}`}>
                          <button
                            type="button"
                            onClick={() => onOpenFile(group.file, hit.line)}
                            className="w-full flex items-baseline gap-2 px-1.5 py-0.5 rounded hover:bg-accent/50 text-left text-xs"
                          >
                            <span className="text-[10px] text-muted-foreground/70 font-mono w-8 flex-shrink-0 text-right">
                              {hit.line}
                            </span>
                            <span className="font-mono truncate">
                              {renderHighlighted(hit.preview, hit.matchStart, hit.matchEnd)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

const ToggleChip: React.FC<{
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
}> = ({ active, onClick, label, icon }) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    aria-label={label}
    title={label}
    className={cn(
      'inline-flex items-center justify-center h-6 w-6 rounded transition-colors',
      active
        ? 'bg-brand/15 text-brand'
        : 'text-muted-foreground hover:bg-accent hover:text-foreground',
    )}
  >
    {icon}
  </button>
);

const EmptyState: React.FC<{ message: string }> = ({ message }) => (
  <div className="h-full flex items-center justify-center px-4 text-center">
    <p className="text-xs text-muted-foreground">{message}</p>
  </div>
);

export default SearchPanel;
