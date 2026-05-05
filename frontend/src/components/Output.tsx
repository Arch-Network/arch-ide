import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { Button } from './ui/button';
import { Trash2, X, Check, Info, Terminal, Loader2, ExternalLink, Copy, ClipboardCheck, ArrowDown } from 'lucide-react';

// How close (in px) to the bottom the user must be for new messages to keep
// auto-scrolling. Anything above this threshold is treated as "they've
// intentionally scrolled up to read older logs — don't drag them back down."
const STICK_TO_BOTTOM_THRESHOLD_PX = 32;

export interface OutputMessage {
  type: 'command' | 'success' | 'error' | 'info';
  content: string;
  timestamp: Date;
  isLoading?: boolean;
  commandId?: string;
  link?: string; // Optional explorer link
  /** Optional id for replacing in place (e.g. live build log) */
  id?: string;
}

interface OutputProps {
  messages: OutputMessage[];
  onClear?: () => void;
}

export const Output = ({ messages, onClear }: OutputProps) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);

  // We track sticky-bottom intent in a ref (not state) so user scroll events
  // don't trigger re-renders. The flag is read synchronously in the layout
  // effect below to decide whether to follow the new messages or stay put.
  const stickToBottomRef = useRef(true);
  const [hasUnreadBelow, setHasUnreadBelow] = useState(false);

  const isNearBottom = useCallback((el: HTMLDivElement) => {
    return el.scrollHeight - el.clientHeight - el.scrollTop <= STICK_TO_BOTTOM_THRESHOLD_PX;
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const atBottom = isNearBottom(el);
    stickToBottomRef.current = atBottom;
    if (atBottom && hasUnreadBelow) {
      setHasUnreadBelow(false);
    }
  }, [hasUnreadBelow, isNearBottom]);

  // Use a layout effect so the scroll position is corrected before the
  // browser paints — avoids a one-frame flash of "scrolled up then yanked
  // back down" when the user is in fact at the bottom.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // If messages emptied (e.g. the user hit Clear), reset to sticky-bottom.
    // Otherwise nothing-below would still flag "New output" on next render.
    if (messages.length === 0) {
      stickToBottomRef.current = true;
      if (hasUnreadBelow) setHasUnreadBelow(false);
      return;
    }
    if (stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
      if (hasUnreadBelow) setHasUnreadBelow(false);
    } else {
      // New content arrived while user is scrolled up — surface the
      // indicator without disturbing their scroll position.
      setHasUnreadBelow(true);
    }
    // Intentionally only depending on messages: hasUnreadBelow is a derived
    // signal we set inside this effect; including it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages]);

  // When the panel itself resizes (e.g. user drags the bottom panel taller),
  // re-pin if they were at the bottom — otherwise the resize would leave the
  // viewport floating mid-log.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (stickToBottomRef.current) {
        el.scrollTop = el.scrollHeight;
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
    stickToBottomRef.current = true;
    setHasUnreadBelow(false);
  }, []);

  const copyLogsToClipboard = useCallback(() => {
    const text = messages
      .map((msg) => {
        const time = msg.timestamp.toLocaleTimeString();
        const prefix = msg.type === 'command' ? '> $ ' : '  ';
        return `${time} ${prefix}${msg.content}`;
      })
      .join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [messages]);

  const MessageIcon = ({ type, isLoading }: { type: OutputMessage['type'], isLoading?: boolean }) => {
    if (isLoading) {
      return <Loader2 className="h-4 w-4 animate-spin text-info" aria-label="Loading" />;
    }

    switch (type) {
      case 'error':
        return <X className="h-4 w-4 text-danger" aria-label="Error" />;
      case 'success':
        return <Check className="h-4 w-4 text-success" aria-label="Success" />;
      case 'info':
        return <Info className="h-4 w-4 text-info" aria-label="Info" />;
      case 'command':
        return <Terminal className="h-4 w-4 text-warning" aria-label="Command" />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-end gap-1 py-0.5 px-2 bg-surface-1 border-b border-border">
        <Button
          variant="ghost"
          size="sm"
          onClick={copyLogsToClipboard}
          className="text-muted-foreground hover:bg-accent hover:text-foreground h-6 px-2 text-xs"
          disabled={messages.length === 0}
          aria-label="Copy logs to clipboard"
        >
          {copied ? (
            <>
              <ClipboardCheck className="h-3 w-3 mr-1 text-success" aria-hidden="true" />
              <span className="text-success">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3 mr-1" aria-hidden="true" />
              Copy
            </>
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="text-muted-foreground hover:bg-accent hover:text-foreground h-6 px-2 text-xs"
          aria-label="Clear logs"
        >
          <Trash2 className="h-3 w-3 mr-1" aria-hidden="true" />
          Clear
        </Button>
      </div>
      <div className="relative flex-1 min-h-0">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        className="bg-surface-0 text-foreground font-mono p-2 overflow-y-auto overflow-x-auto h-full text-xs leading-4 break-words whitespace-pre-wrap select-text cursor-text"
      >
        {messages.map((msg, i) => (
          <div key={i} className="mb-2">
            <div className="flex items-top">
              <span className="text-muted-foreground text-[10px] whitespace-nowrap mr-2 align-top">
                {msg.timestamp.toLocaleTimeString()}
              </span>
              <div className="flex-1 max-w-full">
                {msg.type === 'command' && (
                  <div className="flex items-center gap-2">
                    <MessageIcon type={msg.type} isLoading={msg.isLoading} />
                    <span className="text-info break-words">{`$ ${msg.content}`}</span>
                    {msg.link && (
                      <a
                        href={msg.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-info hover:text-info/80 flex items-center gap-1 ml-2 whitespace-nowrap"
                        title="View in Explorer"
                        aria-label="Open in Explorer"
                      >
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    )}
                  </div>
                )}
                {msg.type === 'success' && (
                  <div className="flex items-center gap-2">
                    <MessageIcon type={msg.type} isLoading={msg.isLoading} />
                    <span className="text-success break-words">{msg.content}</span>
                    {msg.link && (
                      <a
                        href={msg.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-info hover:text-info/80 flex items-center gap-1 ml-2 whitespace-nowrap"
                        title="View in Explorer"
                        aria-label="Open in Explorer"
                      >
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    )}
                  </div>
                )}
                {msg.type === 'error' && (
                  <div className="text-danger whitespace-pre-wrap break-words">
                    {msg.content.split('\n').map((line, i) => {
                      // Compiler-style line classifiers. Each maps to a semantic token
                      // so the same palette stays consistent in light/dark themes.
                      const isHeader = line.startsWith('error');
                      const isFile = line.startsWith('File:');
                      const isLine = line.startsWith('Line:');
                      const isCode = line.startsWith('Code:');
                      const isNote = line.startsWith('note:');
                      const isHelp = line.startsWith('help:');
                      const isWarning = line.startsWith('warning:');

                      return (
                        <div key={i} className={`
                          ${isHeader ? 'text-danger font-bold' : ''}
                          ${isFile ? 'text-warning mt-1' : ''}
                          ${isLine ? 'text-warning' : ''}
                          ${isCode ? 'text-info mt-1 pl-4' : ''}
                          ${isNote ? 'text-info mt-1' : ''}
                          ${isHelp ? 'text-success mt-1' : ''}
                          ${isWarning ? 'text-warning font-bold' : ''}
                          ${!isHeader && !isFile && !isLine && !isCode && !isNote && !isHelp && !isWarning ? 'text-foreground/80' : ''}
                        `}>
                          {line}
                        </div>
                      );
                    })}
                  </div>
                )}
                {msg.type === 'info' && (
                  <div className="flex items-center gap-2">
                    <span className="text-info break-words">{msg.content}</span>
                    {msg.link && (
                      <a
                        href={msg.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-info hover:text-info/80 flex items-center gap-1 ml-2 whitespace-nowrap"
                        title="View in Explorer"
                        aria-label="Open in Explorer"
                      >
                        <ExternalLink className="h-3 w-3" aria-hidden="true" />
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
        {hasUnreadBelow && (
          <button
            type="button"
            onClick={scrollToBottom}
            aria-label="Jump to latest output"
            className="absolute bottom-3 right-4 flex items-center gap-1.5 rounded-full bg-accent text-accent-foreground shadow-md hover:bg-accent/90 transition-opacity px-3 py-1 text-[11px] font-medium border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowDown className="h-3 w-3" aria-hidden="true" />
            New output
          </button>
        )}
      </div>
    </div>
  );
};

export default Output;