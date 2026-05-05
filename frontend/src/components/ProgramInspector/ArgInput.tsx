import React from 'react';
import bs58 from 'bs58';
import { AlertCircle, Plus, Minus } from 'lucide-react';
import { Input } from '../ui/input';
import { Switch } from '../ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select';
import { Textarea } from '../ui/textarea';
import { renderType } from '../../utils/idl/typeRender';
import { AccountInput } from './AccountInput';
import {
  emptyArgValue,
  parseBytes,
  parseInteger,
  parseJson,
  parsePubkey,
  type ArgValue,
  type BytesMode,
  type IntegerType,
} from './argValue';
import type {
  AddressBookEntry,
  ComplexType,
  SavedKeypair,
} from '../../types';
import type { ProjectMutations } from './projectMutations';
import type { AccountInputSuggestion } from './AccountInput';

/**
 * Renders the appropriate typed control for a single instruction
 * argument. The component is intentionally stateless — `value` and
 * `onChange` are both `ArgValue` so the parent owns the entire form
 * and Slice 3's encoder can walk a typed tree directly.
 *
 * Validation runs on every keystroke to surface inline errors. We
 * keep the user's raw input even when it doesn't parse, because
 * destroying it on each character would make typing impossible.
 */
interface ArgInputProps {
  id: string;
  type: string | ComplexType;
  value: ArgValue;
  onChange: (next: ArgValue) => void;
  /**
   * Picker context for `pubkey`-typed args. We reuse the same
   * `AccountInput` pieces so a "user_pubkey" arg gets the same
   * authority/wallet/random/saved dropdown as an account row.
   */
  accountContext: {
    suggestions: AccountInputSuggestion[];
    addressBook: AddressBookEntry[];
    savedKeypairs: SavedKeypair[];
    mutations: ProjectMutations;
  };
}

export const ArgInput: React.FC<ArgInputProps> = ({
  id,
  type,
  value,
  onChange,
  accountContext,
}) => {
  switch (value.kind) {
    case 'bool':
      return (
        <div className="flex items-center gap-2">
          <Switch
            id={id}
            checked={value.value}
            onCheckedChange={(v) => onChange({ kind: 'bool', value: v })}
          />
          <span className="text-[11px] font-mono text-muted-foreground">
            {value.value ? 'true' : 'false'}
          </span>
        </div>
      );

    case 'integer':
      return <IntegerArgInput id={id} value={value} onChange={onChange} />;

    case 'string':
      return (
        <Input
          id={id}
          value={value.value}
          onChange={(e) => onChange({ kind: 'string', value: e.target.value })}
          placeholder="text"
          className="h-7 text-[11px] font-mono"
          spellCheck={false}
        />
      );

    case 'pubkey':
      return (
        <PubkeyArgInput
          id={id}
          value={value}
          onChange={onChange}
          accountContext={accountContext}
        />
      );

    case 'bytes':
      return <BytesArgInput id={id} value={value} onChange={onChange} />;

    case 'option':
      return (
        <OptionArgInput
          id={id}
          type={type}
          value={value}
          onChange={onChange}
          accountContext={accountContext}
        />
      );

    case 'json':
      return <JsonArgInput id={id} value={value} onChange={onChange} />;
  }
};

/**
 * Numeric input with type-aware bounds checking. We keep the parsed
 * `bigint` next to the user's raw string so editing mid-number (e.g.
 * deleting a digit) doesn't snap them back to a clamped value.
 */
const IntegerArgInput: React.FC<{
  id: string;
  value: Extract<ArgValue, { kind: 'integer' }>;
  onChange: (next: ArgValue) => void;
}> = ({ id, value, onChange }) => {
  const handleChange = (raw: string) => {
    const parsed = parseInteger(raw, value.type);
    onChange({
      kind: 'integer',
      type: value.type,
      raw,
      value: parsed.value,
      ...(parsed.error ? { error: parsed.error } : {}),
    });
  };
  return (
    <div className="space-y-1">
      <Input
        id={id}
        value={value.raw}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={isSignedInteger(value.type) ? '0' : '0'}
        className="h-7 text-[11px] font-mono"
        spellCheck={false}
        inputMode="numeric"
      />
      {value.error && <FieldError message={value.error} />}
    </div>
  );
};

const PubkeyArgInput: React.FC<{
  id: string;
  value: Extract<ArgValue, { kind: 'pubkey' }>;
  onChange: (next: ArgValue) => void;
  accountContext: ArgInputProps['accountContext'];
}> = ({ id, value, onChange, accountContext }) => (
  <div className="space-y-1">
    <AccountInput
      id={id}
      value={value.raw}
      onChange={(raw) => {
        const parsed = parsePubkey(raw);
        onChange({
          kind: 'pubkey',
          raw,
          bytes: parsed.bytes,
          ...(parsed.error ? { error: parsed.error } : {}),
        });
      }}
      fieldName={id}
      suggestions={accountContext.suggestions}
      addressBook={accountContext.addressBook}
      savedKeypairs={accountContext.savedKeypairs}
      mutations={accountContext.mutations}
      allowRandom
    />
    {value.error && <FieldError message={value.error} />}
  </div>
);

/**
 * Vec<u8> input with utf8/hex/base58 mode selector. Switching modes
 * preserves the *bytes* not the raw input — typing "hello" in utf8
 * mode then switching to hex shows `68656c6c6f`, which is what users
 * expect when they're inspecting an existing buffer.
 */
const BytesArgInput: React.FC<{
  id: string;
  value: Extract<ArgValue, { kind: 'bytes' }>;
  onChange: (next: ArgValue) => void;
}> = ({ id, value, onChange }) => {
  const handleModeChange = (newMode: BytesMode) => {
    if (newMode === value.mode) return;
    if (!value.bytes) {
      onChange({ ...value, mode: newMode, raw: '' });
      return;
    }
    const reEncoded = encodeBytes(value.bytes, newMode);
    onChange({
      kind: 'bytes',
      mode: newMode,
      raw: reEncoded,
      bytes: value.bytes,
    });
  };
  const handleRawChange = (raw: string) => {
    const parsed = parseBytes(raw, value.mode);
    onChange({
      kind: 'bytes',
      mode: value.mode,
      raw,
      bytes: parsed.bytes,
      ...(parsed.error ? { error: parsed.error } : {}),
    });
  };
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <Select
          value={value.mode}
          onValueChange={(v) => handleModeChange(v as BytesMode)}
        >
          <SelectTrigger className="h-7 text-[10px] w-20 flex-shrink-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="utf8">utf8</SelectItem>
            <SelectItem value="hex">hex</SelectItem>
            <SelectItem value="base58">base58</SelectItem>
          </SelectContent>
        </Select>
        <Input
          id={id}
          value={value.raw}
          onChange={(e) => handleRawChange(e.target.value)}
          placeholder={value.mode === 'utf8' ? 'plain text' : value.mode === 'hex' ? '0xdeadbeef' : 'base58 bytes'}
          className="h-7 text-[11px] font-mono"
          spellCheck={false}
        />
      </div>
      {value.error ? (
        <FieldError message={value.error} />
      ) : value.bytes ? (
        <p className="text-[10px] text-muted-foreground">
          {value.bytes.length} byte{value.bytes.length === 1 ? '' : 's'}
        </p>
      ) : null}
    </div>
  );
};

/**
 * `Option<T>` UI: a +/- toggle plus the inner control when present.
 * Toggling off keeps the inner state in memory so the user doesn't
 * lose their input if they un-check and re-check.
 */
const OptionArgInput: React.FC<{
  id: string;
  type: string | ComplexType;
  value: Extract<ArgValue, { kind: 'option' }>;
  onChange: (next: ArgValue) => void;
  accountContext: ArgInputProps['accountContext'];
}> = ({ id, type, value, onChange, accountContext }) => {
  const innerType = typeof type === 'object' && type.option ? type.option : 'unknown';
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            // When un-checking we keep `inner` so re-enabling restores
            // their typing. When checking-on for the first time we
            // initialize a fresh empty value of the right shape.
            const next = !value.present;
            onChange({
              kind: 'option',
              present: next,
              inner:
                next && value.inner.kind === 'json' && value.inner.raw === ''
                  ? emptyArgValue(innerType as string | ComplexType)
                  : value.inner,
            });
          }}
          className={
            value.present
              ? 'rounded h-6 px-2 text-[10px] bg-brand/20 text-foreground border border-brand/40 flex items-center gap-1'
              : 'rounded h-6 px-2 text-[10px] bg-surface-1 text-muted-foreground hover:text-foreground border border-border flex items-center gap-1'
          }
        >
          {value.present ? (
            <>
              <Minus className="h-3 w-3" aria-hidden="true" />
              Set
            </>
          ) : (
            <>
              <Plus className="h-3 w-3" aria-hidden="true" />
              None
            </>
          )}
        </button>
        <span className="text-[10px] text-muted-foreground">
          {value.present ? 'Some(' : 'None — click to set'}
          {!value.present && ''}
        </span>
      </div>
      {value.present && (
        <div className="ml-2 pl-2 border-l border-border">
          <ArgInput
            id={`${id}-inner`}
            type={innerType as string | ComplexType}
            value={value.inner}
            onChange={(inner) => onChange({ ...value, inner })}
            accountContext={accountContext}
          />
        </div>
      )}
    </div>
  );
};

/**
 * Free-form JSON fallback for types we don't have a structured UI
 * for yet (structs, enums, vec<defined>, etc.). Slice 3's encoder
 * matches the parsed JSON against the IDL's type definition.
 */
const JsonArgInput: React.FC<{
  id: string;
  value: Extract<ArgValue, { kind: 'json' }>;
  onChange: (next: ArgValue) => void;
}> = ({ id, value, onChange }) => (
  <div className="space-y-1">
    <Textarea
      id={id}
      value={value.raw}
      onChange={(e) => {
        const raw = e.target.value;
        const parsed = parseJson(raw);
        onChange({
          kind: 'json',
          raw,
          value: parsed.value,
          ...(parsed.error ? { error: parsed.error } : {}),
        });
      }}
      placeholder='{ "amount": 100 }'
      className="text-[11px] font-mono min-h-[60px]"
      spellCheck={false}
    />
    {value.error && <FieldError message={value.error} />}
  </div>
);

const FieldError: React.FC<{ message: string }> = ({ message }) => (
  <p className="text-[10px] text-danger flex items-center gap-1">
    <AlertCircle className="h-3 w-3" aria-hidden="true" />
    {message}
  </p>
);

const isSignedInteger = (t: IntegerType): boolean => t.startsWith('i');

const encodeBytes = (bytes: Uint8Array, mode: BytesMode): string => {
  if (mode === 'utf8') {
    try {
      return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    } catch {
      return '';
    }
  }
  if (mode === 'hex') {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  return bs58.encode(bytes);
};

/**
 * Friendly type label shown next to the field name. Mirrors what
 * `renderType` produces but with a few cosmetic tweaks to feel less
 * intimidating in the form (e.g. `Pubkey` instead of `pubkey`).
 */
export const friendlyTypeLabel = (type: string | ComplexType): string => {
  return renderType(type);
};

export default ArgInput;
