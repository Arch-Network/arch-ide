import React, { useState } from 'react';
import {
  ChevronDown,
  Wand2,
  Wallet,
  ShieldCheck,
  Dice5,
  BookmarkPlus,
  Bookmark,
  Trash2,
  KeyRound,
  X,
  Check,
} from 'lucide-react';
import { Input } from '../ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { generateArchKeypair } from '../../utils/keypairGenerator';
import { hexToBase58 } from '../../utils/base58';
import type {
  AddressBookEntry,
  ProjectAccount,
  SavedKeypair,
} from '../../types';
import type { ProjectMutations } from './projectMutations';

/**
 * Drop-down powered pubkey input for the Invoke form.
 *
 * The composition is intentional: the dropdown handles **source
 * selection** (where the address comes from) and the input handles
 * **manual override** (the user can always type). Once a source is
 * picked we lift the value into form state via `onChange` — the input
 * is the single source of truth for what gets submitted.
 *
 * Keep this component dumb about *why* an address is being requested
 * (signer vs program input vs PDA seed). The parent shapes the visible
 * suggestions via the optional `extraSuggestions` prop.
 */
export interface AccountInputSuggestion {
  label: string;
  description?: string;
  address: string;
  /** When set, clicking this suggestion also auto-saves it as a keypair. */
  account?: ProjectAccount;
}

interface AccountInputProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /**
   * Used as the saved-pair label when the user clicks "Save". We use
   * the field name so saves like "user", "authority", "counter_pda"
   * become discoverable in the dropdown without the user typing
   * anything; they can rename via the address book later.
   */
  fieldName: string;
  /**
   * Quick-fill suggestions surfaced in the dropdown above the address
   * book. Prefer "Authority" and "Wallet" when available; the
   * dropdown's keyboard nav stays sane because we cap this list at
   * roughly 4 entries.
   */
  suggestions: AccountInputSuggestion[];
  addressBook: AddressBookEntry[];
  savedKeypairs: SavedKeypair[];
  mutations: ProjectMutations;
  /**
   * Whether the field should accept generation of a fresh keypair.
   * Disable for non-signer fields (random pubkeys are useless there)
   * to keep the dropdown focused.
   */
  allowRandom?: boolean;
  /** Toggle the BIP-322 / Taproot network so generated keys land on the right chain. */
  network?: 'mainnet' | 'testnet' | 'devnet';
}

export const AccountInput: React.FC<AccountInputProps> = ({
  id,
  value,
  onChange,
  placeholder = 'address (base58 or hex)',
  fieldName,
  suggestions,
  addressBook,
  savedKeypairs,
  mutations,
  allowRandom = true,
  network = 'testnet',
}) => {
  const [savePromptOpen, setSavePromptOpen] = useState(false);
  const [pendingLabel, setPendingLabel] = useState('');

  const handlePickSuggestion = (s: AccountInputSuggestion) => {
    onChange(s.address);
  };

  const handleAddressBook = (entry: AddressBookEntry) => {
    onChange(entry.address);
  };

  const handleSavedKeypair = (kp: SavedKeypair) => {
    // For signer fields the user usually wants the *pubkey* of a saved
    // keypair (Slice 3 will use the privkey when signing); we expose the
    // pubkey here as the visible value.
    onChange(hexToBase58(kp.account.pubkey));
  };

  const handleGenerate = async () => {
    const kp = generateArchKeypair(network === 'devnet' ? 'testnet' : network);
    // Auto-save with the field name as a starting label so the keypair
    // shows up in the dropdown immediately. The user can rename via
    // their address book if it's a long-lived account.
    const label = `${fieldName} (random)`;
    await mutations.saveKeypair(label, kp);
    onChange(hexToBase58(kp.pubkey));
  };

  const handleSave = async () => {
    const trimmed = pendingLabel.trim();
    if (!trimmed || !value.trim()) {
      setSavePromptOpen(false);
      return;
    }
    await mutations.saveAddressBookEntry(trimmed, value.trim());
    setSavePromptOpen(false);
    setPendingLabel('');
  };

  // Determine whether the current value matches a known source, so we
  // can render a small badge on the dropdown trigger and skip pestering
  // the user for "save" if they already have the address bound.
  const matchedSuggestion = suggestions.find((s) => s.address === value.trim());
  const matchedAddressBook = addressBook.find((e) => e.address === value.trim());
  const matchedKeypair = savedKeypairs.find(
    (k) => hexToBase58(k.account.pubkey) === value.trim(),
  );
  const valueLabel =
    matchedSuggestion?.label ??
    matchedAddressBook?.label ??
    (matchedKeypair ? `${matchedKeypair.label} (saved)` : null);

  const canSave =
    value.trim().length > 0 &&
    !matchedSuggestion &&
    !matchedAddressBook &&
    !matchedKeypair;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="flex items-center gap-1 rounded border border-border bg-surface-1 px-1.5 h-7 text-[10px] text-muted-foreground hover:text-foreground hover:bg-surface-2 transition-colors flex-shrink-0"
              aria-label={`Pick address source for ${fieldName}`}
            >
              {valueLabel ? (
                <span className="font-medium text-foreground/90 truncate max-w-[80px]">
                  {valueLabel}
                </span>
              ) : (
                <>
                  <Wand2 className="h-3 w-3" aria-hidden="true" />
                  <span>Source</span>
                </>
              )}
              <ChevronDown className="h-3 w-3" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {suggestions.length > 0 && (
              <>
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider">
                  Connected
                </DropdownMenuLabel>
                {suggestions.map((s) => (
                  <DropdownMenuItem
                    key={`${s.label}-${s.address}`}
                    onClick={() => handlePickSuggestion(s)}
                    className="text-xs"
                  >
                    <SourceIcon label={s.label} />
                    <span className="ml-1.5">{s.label}</span>
                    {s.description && (
                      <span className="ml-auto text-[10px] text-muted-foreground">
                        {s.description}
                      </span>
                    )}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
              </>
            )}

            {allowRandom && (
              <DropdownMenuItem onClick={handleGenerate} className="text-xs">
                <Dice5 className="h-3 w-3 mr-1.5" aria-hidden="true" />
                Generate random keypair
              </DropdownMenuItem>
            )}

            {savedKeypairs.length > 0 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="text-xs">
                  <KeyRound className="h-3 w-3 mr-1.5" aria-hidden="true" />
                  Saved keypairs
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {savedKeypairs.length}
                  </span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-64">
                  {savedKeypairs.map((kp) => (
                    <SavedKeypairRow
                      key={kp.id}
                      kp={kp}
                      onPick={() => handleSavedKeypair(kp)}
                      onRemove={() => mutations.removeKeypair(kp.id)}
                    />
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}

            {addressBook.length > 0 && (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger className="text-xs">
                  <Bookmark className="h-3 w-3 mr-1.5" aria-hidden="true" />
                  Address book
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {addressBook.length}
                  </span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-64">
                  {addressBook.map((entry) => (
                    <AddressBookRow
                      key={entry.id}
                      entry={entry}
                      onPick={() => handleAddressBook(entry)}
                      onRemove={() => mutations.removeAddressBookEntry(entry.id)}
                    />
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            )}

            {value && canSave && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    setPendingLabel(fieldName);
                    setSavePromptOpen(true);
                  }}
                  className="text-xs"
                >
                  <BookmarkPlus className="h-3 w-3 mr-1.5" aria-hidden="true" />
                  Save current address as…
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-7 text-[11px] font-mono"
          spellCheck={false}
        />
      </div>

      {savePromptOpen && (
        <div className="flex items-center gap-1.5 rounded border border-border bg-surface-1 p-1.5">
          <span className="text-[10px] text-muted-foreground flex-shrink-0">Label</span>
          <Input
            value={pendingLabel}
            onChange={(e) => setPendingLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') setSavePromptOpen(false);
            }}
            placeholder="counter_pda"
            className="h-6 text-[11px] font-mono"
            autoFocus
          />
          <button
            type="button"
            onClick={handleSave}
            className="rounded bg-brand/20 text-foreground hover:bg-brand/30 transition-colors h-6 w-6 flex items-center justify-center flex-shrink-0"
            aria-label="Save to address book"
          >
            <Check className="h-3 w-3" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={() => setSavePromptOpen(false)}
            className="rounded text-muted-foreground hover:text-foreground transition-colors h-6 w-6 flex items-center justify-center flex-shrink-0"
            aria-label="Cancel save"
          >
            <X className="h-3 w-3" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
};

const SourceIcon: React.FC<{ label: string }> = ({ label }) => {
  const lower = label.toLowerCase();
  if (lower.includes('wallet')) return <Wallet className="h-3 w-3" aria-hidden="true" />;
  if (lower.includes('authority'))
    return <ShieldCheck className="h-3 w-3" aria-hidden="true" />;
  return <Wand2 className="h-3 w-3" aria-hidden="true" />;
};

const SavedKeypairRow: React.FC<{
  kp: SavedKeypair;
  onPick: () => void;
  onRemove: () => void;
}> = ({ kp, onPick, onRemove }) => (
  <div className="flex items-center px-2 py-1 hover:bg-accent/30 rounded text-xs group">
    <button
      type="button"
      onClick={onPick}
      className="flex-1 text-left truncate"
    >
      <div className="font-medium">{kp.label}</div>
      <div className="text-[10px] text-muted-foreground font-mono truncate">
        {hexToBase58(kp.account.pubkey)}
      </div>
    </button>
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onRemove();
      }}
      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-danger"
      aria-label={`Remove saved keypair "${kp.label}"`}
    >
      <Trash2 className="h-3 w-3" aria-hidden="true" />
    </button>
  </div>
);

const AddressBookRow: React.FC<{
  entry: AddressBookEntry;
  onPick: () => void;
  onRemove: () => void;
}> = ({ entry, onPick, onRemove }) => (
  <div className="flex items-center px-2 py-1 hover:bg-accent/30 rounded text-xs group">
    <button
      type="button"
      onClick={onPick}
      className="flex-1 text-left truncate"
    >
      <div className="font-medium">{entry.label}</div>
      <div className="text-[10px] text-muted-foreground font-mono truncate">
        {entry.address}
      </div>
    </button>
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onRemove();
      }}
      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 text-muted-foreground hover:text-danger"
      aria-label={`Remove "${entry.label}" from address book`}
    >
      <Trash2 className="h-3 w-3" aria-hidden="true" />
    </button>
  </div>
);

export default AccountInput;
