import { useEffect, useRef, useState, useCallback } from 'react';
import { Button } from './ui/button';
import { Trash2, X, Check, Info, Terminal, Loader2, ExternalLink, Copy, ClipboardCheck } from 'lucide-react';

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

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    }

    switch (type) {
      case 'error':
        return <X className="h-4 w-4 text-red-500" />;
      case 'success':
        return <Check className="h-4 w-4 text-green-500" />;
      case 'info':
        return <Info className="h-4 w-4 text-blue-500" />;
      case 'command':
        return <Terminal className="h-4 w-4 text-yellow-500" />;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-end gap-1 py-0.5 px-2 bg-gray-800 border-b border-gray-700">
        <Button
          variant="ghost"
          size="sm"
          onClick={copyLogsToClipboard}
          className="text-gray-400 hover:bg-gray-700 hover:text-white h-6 px-2 text-xs"
          disabled={messages.length === 0}
        >
          {copied ? (
            <>
              <ClipboardCheck className="h-3 w-3 mr-1 text-green-400" />
              <span className="text-green-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="h-3 w-3 mr-1" />
              Copy
            </>
          )}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onClear}
          className="text-gray-400 hover:bg-gray-700 hover:text-white h-6 px-2 text-xs"
        >
          <Trash2 className="h-3 w-3 mr-1" />
          Clear
        </Button>
      </div>
      <div ref={scrollRef} className="bg-gray-900 text-white font-mono p-2 overflow-y-auto overflow-x-auto flex-1 text-xs leading-4 break-words whitespace-pre-wrap select-text cursor-text">
        {messages.map((msg, i) => (
          <div key={i} className="mb-2">
            <div className="flex items-top">
              <span className="text-gray-500 text-[10px] whitespace-nowrap mr-2 align-top">
                {msg.timestamp.toLocaleTimeString()}
              </span>
              <div className="flex-1 max-w-full">
                {msg.type === 'command' && (
                  <div className="flex items-center gap-2">
                    <MessageIcon type={msg.type} isLoading={msg.isLoading} />
                    <span className="text-blue-400 break-words">{`$ ${msg.content}`}</span>
                    {msg.link && (
                      <a
                        href={msg.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 ml-2 whitespace-nowrap"
                        title="View in Explorer"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                )}
                {msg.type === 'success' && (
                  <div className="flex items-center gap-2">
                    <MessageIcon type={msg.type} isLoading={msg.isLoading} />
                    <span className="text-green-400 break-words">{msg.content}</span>
                    {msg.link && (
                      <a
                        href={msg.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 ml-2 whitespace-nowrap"
                        title="View in Explorer"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                )}
                {msg.type === 'error' && (
                  <div className="text-red-400 whitespace-pre-wrap break-words">
                    {msg.content.split('\n').map((line, i) => {
                      // Check for different parts of the error message
                      const isHeader = line.startsWith('error');
                      const isFile = line.startsWith('File:');
                      const isLine = line.startsWith('Line:');
                      const isCode = line.startsWith('Code:');
                      const isNote = line.startsWith('note:');
                      const isHelp = line.startsWith('help:');
                      const isWarning = line.startsWith('warning:');

                      return (
                        <div key={i} className={`
                          ${isHeader ? 'text-red-400 font-bold' : ''}
                          ${isFile ? 'text-yellow-400 mt-1' : ''}
                          ${isLine ? 'text-yellow-400' : ''}
                          ${isCode ? 'text-blue-400 mt-1 pl-4' : ''}
                          ${isNote ? 'text-cyan-400 mt-1' : ''}
                          ${isHelp ? 'text-green-400 mt-1' : ''}
                          ${isWarning ? 'text-yellow-400 font-bold' : ''}
                          ${!isHeader && !isFile && !isLine && !isCode && !isNote && !isHelp && !isWarning ? 'text-gray-300' : ''}
                        `}>
                          {line}
                        </div>
                      );
                    })}
                  </div>
                )}
                {msg.type === 'info' && (
                  <div className="flex items-center gap-2">
                    <span className="text-blue-400 break-words">{msg.content}</span>
                    {msg.link && (
                      <a
                        href={msg.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 ml-2 whitespace-nowrap"
                        title="View in Explorer"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Output;