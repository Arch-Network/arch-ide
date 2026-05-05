import React, { useMemo, useState } from 'react';
import { Button } from './ui/button';
import { ToggleGroup, ToggleGroupItem } from './ui/toggle-group';
import { ClipboardIcon, ExternalLink } from 'lucide-react';
import { hexToBase58 } from '../utils/base58';
import { middleTruncate } from '../utils/text';

interface FormatToggleInputProps {
  label?: string;
  hex: string; // 32-byte pubkey hex
  explorerHref?: string;
  className?: string;
}

export const FormatToggleInput: React.FC<FormatToggleInputProps> = ({
  label,
  hex,
  explorerHref,
  className,
}) => {
  const [format, setFormat] = useState<'base58' | 'hex'>('base58');
  const [copied, setCopied] = useState(false);
  const base58Value = useMemo(() => hexToBase58(hex), [hex]);
  const rawValue = format === 'base58' ? base58Value : hex;
  const displayValue = middleTruncate(rawValue, 36);

  const copy = () => navigator.clipboard.writeText(rawValue); // Copy full value, not truncated

  return (
    <div className={`space-y-2 ${className || ''}`}>
      {label && <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">{label}</div>}

      <div className="flex flex-wrap items-center gap-1.5 min-w-0">
        <ToggleGroup type="single" value={format} onValueChange={(v: string) => v && setFormat(v as 'base58' | 'hex')} className="inline-flex w-auto h-7 flex-none items-center rounded-full bg-background/60 border border-border p-0.5">
          <ToggleGroupItem value="base58">Base58</ToggleGroupItem>
          <ToggleGroupItem value="hex">Hex</ToggleGroupItem>
        </ToggleGroup>

        <div className={`flex-1 min-w-[160px] h-8 text-xs font-mono bg-background/60 border rounded-lg px-2.5 flex items-center text-foreground/80 order-2 md:order-none ${/^[0-9a-fA-F]+$/.test(hex) ? 'border-border' : 'border-danger'}`}>
          <span className="truncate" title={rawValue}>{displayValue}</span>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => { copy(); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
          className="h-8 w-8 p-0 shrink-0 order-3 hover:bg-accent rounded-lg md:w-auto md:px-2.5"
          aria-label={copied ? 'Copied to clipboard' : 'Copy to clipboard'}
        >
          <ClipboardIcon className="h-3 w-3" aria-hidden="true" />
          <span className="text-xs hidden md:inline ml-1">{copied ? 'Copied' : 'Copy'}</span>
        </Button>

        {explorerHref && (
          <a href={explorerHref} target="_blank" rel="noopener noreferrer" aria-label="View on Explorer">
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0 hover:bg-accent rounded-lg md:w-auto md:px-2.5">
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
              <span className="text-xs hidden md:inline ml-1">Explorer</span>
            </Button>
          </a>
        )}
      </div>
    </div>
  );
};

export default FormatToggleInput;
