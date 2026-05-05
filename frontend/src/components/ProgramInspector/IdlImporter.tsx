import React, { useRef, useState } from 'react';
import { Upload, FileJson, AlertCircle } from 'lucide-react';
import { Button } from '../ui/button';
import { Textarea } from '../ui/textarea';
import { parseIdlJson } from '../../utils/idl/validate';
import type { ArchIdl } from '../../types';

interface IdlImporterProps {
  /** Compact mode is rendered when an IDL already exists (for "replace IDL" UX). */
  compact?: boolean;
  onImport: (idl: ArchIdl) => void;
  onCancel?: () => void;
}

/**
 * Two-mode IDL ingestion:
 *   - Drop / select a `.json` file
 *   - Paste raw JSON into a textarea
 *
 * Both go through `parseIdlJson` so error messages stay consistent.
 */
export const IdlImporter: React.FC<IdlImporterProps> = ({ compact, onImport, onCancel }) => {
  const [pasted, setPasted] = useState('');
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const apply = (text: string) => {
    const result = parseIdlJson(text);
    if (!result.ok || !result.idl) {
      setError(result.reason ?? 'Failed to parse IDL.');
      return;
    }
    setError(null);
    onImport(result.idl);
  };

  const handleFile = async (file: File) => {
    try {
      const text = await file.text();
      apply(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      {!compact && (
        <div className="text-center space-y-1.5">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-brand/10 text-brand">
            <FileJson className="h-5 w-5" aria-hidden="true" />
          </div>
          <h3 className="text-sm font-semibold text-foreground">No IDL imported yet</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            Import an IDL JSON to unlock the program inspector — IDL viewer, account decoder,
            and transaction builder.
          </p>
        </div>
      )}

      <div className="grid gap-2">
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.currentTarget.value = '';
          }}
        />
        <Button
          variant="outline"
          size="sm"
          className="h-9 text-xs"
          onClick={() => fileRef.current?.click()}
        >
          <Upload className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
          Import idl.json
        </Button>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="idl-paste"
          className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Or paste JSON
        </label>
        <Textarea
          id="idl-paste"
          value={pasted}
          onChange={(e) => setPasted(e.target.value)}
          placeholder='{ "version": "0.1.0", "name": "counter", "instructions": [...] }'
          className="font-mono text-[11px] min-h-[140px] resize-y"
          spellCheck={false}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? 'idl-paste-error' : undefined}
        />
        {error && (
          <p
            id="idl-paste-error"
            role="alert"
            className="flex items-start gap-1.5 text-[11px] text-danger"
          >
            <AlertCircle className="h-3 w-3 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}
      </div>

      <div className="flex items-center justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button
          size="sm"
          className="h-8 text-xs bg-brand hover:bg-brand-hover text-brand-foreground"
          onClick={() => apply(pasted)}
          disabled={!pasted.trim()}
        >
          Use IDL
        </Button>
      </div>
    </div>
  );
};

export default IdlImporter;
