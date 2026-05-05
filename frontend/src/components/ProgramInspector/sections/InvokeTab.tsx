import React, { useEffect, useMemo, useState } from 'react';
import {
  Workflow,
  Send,
  Info,
  Lock,
  AlertCircle,
  EyeOff,
  CheckCircle2,
  ExternalLink,
  Loader2,
} from 'lucide-react';
import { Input } from '../../ui/input';
import { Button } from '../../ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../ui/select';
import { renderType } from '../../../utils/idl/typeRender';
import { hexToBase58 } from '../../../utils/base58';
import { useBitcoinWallet } from '../../../hooks/useBitcoinWallet';
import {
  derivePda,
  buildAccountValueMap,
  buildArgTypeMap,
  type PdaDerivation,
} from '../../../utils/idl/derivePda';
import { lookupWellKnown, shouldHideFromForm } from '../../../utils/idl/wellKnown';
import {
  submitInstruction,
  type SubmitResult,
  type WalletSigner,
} from '../../../utils/idl/submitInstruction';
import { getExplorerUrls } from '../../../utils/explorerLinks';
import { AccountInput, type AccountInputSuggestion } from '../AccountInput';
import { ArgInput } from '../ArgInput';
import { emptyArgValue, isArgValueValid, type ArgValue } from '../argValue';
import type { ProjectMutations } from '../projectMutations';
import type {
  ArchIdl,
  ArchInstruction,
  ArchInstructionAccount,
  InvokeHistoryEntry,
  Project,
} from '../../../types';
import type { Config } from '../../../types/config';

interface InvokeTabProps {
  idl: ArchIdl | null;
  project: Project | null;
  config: Config;
  mutations: ProjectMutations;
  /**
   * When set, the form rehydrates from this history entry on next
   * render and calls `onReplayConsumed` so the parent can clear it.
   * We use a "queued payload + ack" pattern (rather than a key bump)
   * so the replay survives tab remounts.
   */
  replayEntry?: InvokeHistoryEntry | null;
  onReplayConsumed?: () => void;
}

/**
 * Discriminated state machine for the submission lifecycle. Each
 * phase is a distinct UI: a spinner while we encode/sign/submit, a
 * green panel with the txid + explorer link on success, a red panel
 * with the captured errors on failure.
 */
type SubmitState =
  | { kind: 'idle' }
  | { kind: 'submitting' }
  | { kind: 'success'; result: SubmitResult }
  | { kind: 'error'; result: SubmitResult };

/**
 * IDL-driven transaction builder form.
 *
 * The form's job is to make calling a program feel as fast as Solana
 * Playground: pick an instruction, glance over auto-filled accounts,
 * fill in the args, hit Submit. To get there we collapse three classes
 * of accounts that the user shouldn't have to think about:
 *
 *   1. Fixed-address accounts (`acc.address` from the IDL) — system
 *      programs are hidden entirely; other fixed addresses are shown
 *      read-only with a "from IDL" pill.
 *   2. PDAs (`acc.pda`) — derived live from seeds; the bump and
 *      base58 result are surfaced so devs can sanity-check.
 *   3. Signer / pubkey accounts — backed by `AccountInput` which lets
 *      the user pick from authority, connected wallet, saved keypairs,
 *      address book entries, or generate a fresh keypair on demand.
 *
 * Submission (Borsh encode → sign → submit → poll) lands in Slice 3.
 */
export const InvokeTab: React.FC<InvokeTabProps> = ({
  idl,
  project,
  config,
  mutations,
  replayEntry,
  onReplayConsumed,
}) => {
  const {
    account: walletAccount,
    connected: walletConnected,
    wallet,
    signMessage: walletSignMessageRaw,
  } = useBitcoinWallet();

  const [selectedIxName, setSelectedIxName] = useState<string | undefined>(
    idl?.instructions[0]?.name,
  );
  const [argValues, setArgValues] = useState<Record<string, ArgValue>>({});
  const [accounts, setAccounts] = useState<Record<string, string>>({});
  const [submitState, setSubmitState] = useState<SubmitState>({ kind: 'idle' });

  /**
   * Bridge `useBitcoinWallet` into the shape `submitInstruction` wants.
   *
   * The wallet adapter returns the BIP-322 envelope as `{ signature,
   * address }`, so we strip down to the bare base64 string for the
   * pipeline. We also normalize the wallet's compressed pubkey
   * (33 bytes → 66 hex chars) into the 32-byte x-only form Arch
   * stores on-chain. Both transforms happen here so signer
   * resolution can compare pubkeys with a plain string equality.
   */
  const walletSigner = useMemo<WalletSigner | undefined>(() => {
    if (!walletConnected || !walletAccount?.publicKey) return undefined;
    const fullPubHex = walletAccount.publicKey;
    const xOnlyHex =
      fullPubHex.length === 66 ? fullPubHex.slice(2) : fullPubHex;
    return {
      pubkeyHex: xOnlyHex,
      label: wallet?.name ?? 'Wallet',
      signHashHex: async (hashHex) => {
        const res = await walletSignMessageRaw(hashHex);
        return typeof res === 'string'
          ? res
          : (res as { signature: string }).signature;
      },
    };
  }, [walletConnected, walletAccount?.publicKey, wallet?.name, walletSignMessageRaw]);

  const selected = useMemo<ArchInstruction | undefined>(() => {
    if (!idl || !selectedIxName) return undefined;
    return idl.instructions.find((ix) => ix.name === selectedIxName);
  }, [idl, selectedIxName]);

  // Reset per-instruction state when the user picks a different
  // instruction. Carrying values across would let the form quietly
  // submit the wrong fields. We also seed the args map with empty
  // typed values so each input renders the right control on first
  // paint, and clear any prior submission result.
  useEffect(() => {
    setAccounts({});
    setSubmitState({ kind: 'idle' });
    if (!selected) {
      setArgValues({});
      return;
    }
    const seeded: Record<string, ArgValue> = {};
    for (const arg of selected.args) {
      seeded[arg.name] = emptyArgValue(arg.type);
    }
    setArgValues(seeded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedIxName]);

  /**
   * History replay rehydrator.
   *
   * When the user clicks "Re-run" on a History entry, the inspector
   * passes the snapshot in via `replayEntry`. We do this in two
   * steps to avoid racing with the instruction-reset effect above:
   *
   *   1. If the entry's instruction differs from the current pick,
   *      flip `selectedIxName` and exit. The reset effect will fire,
   *      and the next render hits step 2.
   *   2. If the instruction already matches, paint the saved
   *      accounts + args directly and ack the parent.
   *
   * The argValues are stored as `unknown` in the history entry; we
   * cast on rehydration since the InvokeTab is the only producer of
   * that shape and we'd rather keep the persistence layer ignorant.
   */
  useEffect(() => {
    if (!replayEntry || !idl) return;
    if (replayEntry.instruction !== selectedIxName) {
      const ix = idl.instructions.find((i) => i.name === replayEntry.instruction);
      if (!ix) {
        // Instruction no longer in the IDL; surface an error and ack
        // so the parent doesn't re-fire the same payload.
        setSubmitState({
          kind: 'error',
          result: {
            ok: false,
            errors: [`Instruction "${replayEntry.instruction}" no longer exists in this IDL.`],
          },
        });
        onReplayConsumed?.();
        return;
      }
      setSelectedIxName(replayEntry.instruction);
      return; // Wait for the next render — selectedIxName effect resets state first.
    }
    setAccounts({ ...replayEntry.accountValues });
    setArgValues({ ...replayEntry.argValues } as Record<string, ArgValue>);
    setSubmitState({ kind: 'idle' });
    onReplayConsumed?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replayEntry, selectedIxName, idl]);

  /**
   * Quick-fill suggestions surfaced in every `AccountInput` dropdown.
   * Both Authority and Wallet appear when available — when neither is
   * connected the dropdown still shows "Generate random keypair" plus
   * any saved entries, so the form is never a dead end.
   */
  const accountSuggestions = useMemo<AccountInputSuggestion[]>(() => {
    const out: AccountInputSuggestion[] = [];
    if (project?.authorityAccount?.pubkey) {
      out.push({
        label: 'Authority',
        description: 'project',
        address: hexToBase58(project.authorityAccount.pubkey),
      });
    }
    if (walletConnected && walletAccount?.publicKey) {
      out.push({
        label: 'Wallet',
        description: walletAccount.type ?? 'connected',
        address: hexToBase58(walletAccount.publicKey),
      });
    }
    if (project?.account?.pubkey) {
      out.push({
        label: 'Program',
        description: 'self',
        address: hexToBase58(project.account.pubkey),
      });
    }
    return out;
  }, [
    project?.authorityAccount?.pubkey,
    project?.account?.pubkey,
    walletConnected,
    walletAccount?.publicKey,
    walletAccount?.type,
  ]);

  /**
   * Default signer pubkey to seed the input on instruction switch.
   * AccountInput is fully editable, but pre-filling saves a click on
   * the most common path.
   */
  const defaultSignerAddress = useMemo<string | null>(() => {
    if (project?.authorityAccount?.pubkey) {
      return hexToBase58(project.authorityAccount.pubkey);
    }
    if (walletConnected && walletAccount?.publicKey) {
      return hexToBase58(walletAccount.publicKey);
    }
    return null;
  }, [
    project?.authorityAccount?.pubkey,
    walletConnected,
    walletAccount?.publicKey,
  ]);

  // The program ID for PDA derivation is the deployed program's
  // pubkey. Until deploy, `project.account` is null and we can't
  // derive — surface that as a "deploy first" hint per-PDA rather
  // than failing the whole form.
  const programIdHex = project?.account?.pubkey ?? null;

  /**
   * Effective account values for PDA derivation: prefer manual input,
   * fall back to fixed `address`, fall back to the default signer
   * pubkey for signer-flagged accounts. This keeps `kind: 'account'`
   * seed PDAs correct even when the user hasn't touched the signer
   * field (since we know what'd land there if they did).
   */
  const effectiveAccountValues = useMemo<Record<string, string>>(() => {
    if (!selected) return {};
    const out: Record<string, string> = {};
    for (const acc of selected.accounts) {
      const manual = accounts[acc.name];
      if (manual && manual.trim().length > 0) {
        out[acc.name] = manual.trim();
        continue;
      }
      if (acc.address) {
        out[acc.name] = acc.address;
        continue;
      }
      if (acc.isSigner && defaultSignerAddress) {
        out[acc.name] = defaultSignerAddress;
      }
    }
    return out;
  }, [selected, accounts, defaultSignerAddress]);

  /**
   * Flatten typed `ArgValue`s into the scalar map `derivePda` consumes.
   * Each variant maps to a primitive that the seed encoder knows how
   * to handle (string, bigint, boolean, Uint8Array). Unfilled values
   * become `undefined` so `derivePda` reports them as pending.
   */
  const flattenedArgs = useMemo<Record<string, unknown>>(() => {
    const out: Record<string, unknown> = {};
    for (const [name, v] of Object.entries(argValues)) {
      switch (v.kind) {
        case 'bool':
          out[name] = v.value;
          break;
        case 'integer':
          out[name] = v.value;
          break;
        case 'string':
          out[name] = v.value;
          break;
        case 'pubkey':
          // Re-emit as the raw string so `derivePda`'s pubkey path
          // gets a value it can decode (it accepts base58 or hex).
          out[name] = v.raw;
          break;
        case 'bytes':
          out[name] = v.bytes;
          break;
        case 'option':
          out[name] = v.present ? v.inner : undefined;
          break;
        case 'json':
          out[name] = v.value;
          break;
      }
    }
    return out;
  }, [argValues]);

  /**
   * Pre-compute every PDA in the current instruction. We do this in one
   * pass so a single render captures the full account state — render
   * helpers below just look up the result by name.
   */
  const pdaResults = useMemo<Record<string, PdaDerivation>>(() => {
    if (!selected || !programIdHex) return {};
    const argTypes = buildArgTypeMap(selected);
    const accountValues = buildAccountValueMap(selected, effectiveAccountValues);
    const out: Record<string, PdaDerivation> = {};
    for (const acc of selected.accounts) {
      if (!acc.pda) continue;
      out[acc.name] = derivePda(acc.pda, {
        programIdHex,
        accountValues,
        argValues: flattenedArgs,
        argTypes,
      });
    }
    return out;
  }, [selected, programIdHex, effectiveAccountValues, flattenedArgs]);

  if (!idl) return null;

  if (idl.instructions.length === 0) {
    return (
      <div className="px-3 py-6 text-center">
        <Workflow className="mx-auto h-5 w-5 text-muted-foreground/70" aria-hidden="true" />
        <p className="text-xs text-muted-foreground mt-2">
          The imported IDL doesn't define any instructions.
        </p>
      </div>
    );
  }

  // Partition accounts: hidden (well-known programs), and rendered.
  // We keep the count of hidden ones so the form can show a small
  // "+N system accounts auto-filled" footer for transparency.
  const visibleAccounts = selected
    ? selected.accounts.filter((acc) => !shouldHideFromForm(acc.address))
    : [];
  const hiddenAccountCount = selected
    ? selected.accounts.length - visibleAccounts.length
    : 0;

  return (
    <div className="space-y-4 px-3 py-3">
      <div className="space-y-1.5">
        <label
          htmlFor="invoke-ix"
          className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground"
        >
          Instruction
        </label>
        <Select value={selectedIxName} onValueChange={setSelectedIxName}>
          <SelectTrigger id="invoke-ix" className="h-8 text-xs bg-background/50">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {idl.instructions.map((ix) => (
              <SelectItem key={ix.name} value={ix.name}>
                <span className="font-mono">{ix.name}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {selected && (
        <>
          {visibleAccounts.length > 0 && (
            <Section title="Accounts">
              <ul className="space-y-2" role="list">
                {visibleAccounts.map((acc) => (
                  <AccountField
                    key={acc.name}
                    account={acc}
                    value={
                      accounts[acc.name] ??
                      (acc.isSigner && defaultSignerAddress ? defaultSignerAddress : '')
                    }
                    onChange={(v) => setAccounts((s) => ({ ...s, [acc.name]: v }))}
                    pdaResult={pdaResults[acc.name]}
                    programIdHex={programIdHex}
                    suggestions={accountSuggestions}
                    addressBook={project?.addressBook ?? []}
                    savedKeypairs={project?.savedKeypairs ?? []}
                    mutations={mutations}
                  />
                ))}
              </ul>
              {hiddenAccountCount > 0 && (
                <p className="text-[10px] text-muted-foreground italic mt-1.5 flex items-center gap-1">
                  <EyeOff className="h-3 w-3" aria-hidden="true" />
                  +{hiddenAccountCount} system account{hiddenAccountCount === 1 ? '' : 's'}{' '}
                  auto-filled
                </p>
              )}
            </Section>
          )}

          {selected.args.length > 0 && (
            <Section title="Args">
              <ul className="space-y-2" role="list">
                {selected.args.map((arg) => {
                  const id = `invoke-arg-${arg.name}`;
                  const value = argValues[arg.name] ?? emptyArgValue(arg.type);
                  return (
                    <li key={arg.name} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <label
                          htmlFor={id}
                          className="text-[11px] font-mono text-foreground/85"
                        >
                          {arg.name}
                        </label>
                        <code className="text-[10px] text-muted-foreground font-mono">
                          {renderType(arg.type)}
                        </code>
                      </div>
                      <ArgInput
                        id={id}
                        type={arg.type}
                        value={value}
                        onChange={(next) =>
                          setArgValues((s) => ({ ...s, [arg.name]: next }))
                        }
                        accountContext={{
                          suggestions: accountSuggestions,
                          addressBook: project?.addressBook ?? [],
                          savedKeypairs: project?.savedKeypairs ?? [],
                          mutations,
                        }}
                      />
                    </li>
                  );
                })}
              </ul>
            </Section>
          )}

          <SubmitPanel
            instruction={selected}
            argValues={argValues}
            accounts={accounts}
            project={project}
            config={config}
            idl={idl}
            walletSigner={walletSigner}
            state={submitState}
            onStateChange={setSubmitState}
            mutations={mutations}
          />
        </>
      )}
    </div>
  );
};

/**
 * Single account row. Branches on the account's auto-fill class:
 *
 *   - `address` constraint → read-only Input + "from IDL" pill.
 *   - `pda` constraint     → read-only Input bound to derivation
 *                            result; pending/error states render
 *                            inline so the user understands why
 *                            nothing's filled in yet.
 *   - everything else      → `AccountInput` with the full picker
 *                            (authority/wallet/random/saved). Signer
 *                            accounts get the same component; they're
 *                            distinguished only by the "signer" pill.
 */
interface AccountFieldProps {
  account: ArchInstructionAccount;
  value: string;
  onChange: (v: string) => void;
  pdaResult: PdaDerivation | undefined;
  programIdHex: string | null;
  suggestions: AccountInputSuggestion[];
  addressBook: import('../../../types').AddressBookEntry[];
  savedKeypairs: import('../../../types').SavedKeypair[];
  mutations: ProjectMutations;
}

const AccountField: React.FC<AccountFieldProps> = ({
  account,
  value,
  onChange,
  pdaResult,
  programIdHex,
  suggestions,
  addressBook,
  savedKeypairs,
  mutations,
}) => {
  const id = `invoke-acc-${account.name}`;
  const wellKnown = lookupWellKnown(account.address);

  if (account.address) {
    return (
      <li className="space-y-1">
        <FieldHeader id={id} account={account} pill="address" pillLabel="from IDL" />
        <Input
          id={id}
          value={account.address}
          readOnly
          className="h-7 text-[11px] font-mono bg-surface-1/60 text-muted-foreground"
          spellCheck={false}
        />
        {wellKnown && (
          <p className="text-[10px] text-muted-foreground">{wellKnown.label}</p>
        )}
      </li>
    );
  }

  if (account.pda) {
    return (
      <li className="space-y-1">
        <FieldHeader id={id} account={account} pill="pda" pillLabel="PDA" />
        <PdaField
          id={id}
          result={pdaResult}
          hasProgramId={programIdHex !== null}
        />
      </li>
    );
  }

  return (
    <li className="space-y-1">
      <FieldHeader
        id={id}
        account={account}
        pill={account.isSigner ? 'signer' : null}
        pillLabel={account.isSigner ? 'signer' : null}
      />
      <AccountInput
        id={id}
        value={value}
        onChange={onChange}
        fieldName={account.name}
        suggestions={suggestions}
        addressBook={addressBook}
        savedKeypairs={savedKeypairs}
        mutations={mutations}
        allowRandom={account.isSigner}
      />
    </li>
  );
};

/**
 * Compact derivation status renderer. Keeps the visual weight low so
 * a fully-resolved PDA doesn't dominate the form.
 */
const PdaField: React.FC<{
  id: string;
  result: PdaDerivation | undefined;
  hasProgramId: boolean;
}> = ({ id, result, hasProgramId }) => {
  if (!hasProgramId) {
    return (
      <div className="rounded border border-dashed border-warning/40 bg-warning/5 px-2 py-1.5">
        <p className="flex items-center gap-1 text-[10px] text-warning">
          <AlertCircle className="h-3 w-3" aria-hidden="true" />
          Deploy the program first — the PDA depends on its on-chain ID.
        </p>
      </div>
    );
  }
  if (!result || result.kind === 'pending') {
    return (
      <div className="rounded border border-dashed border-border bg-surface-1/60 px-2 py-1.5">
        <p className="text-[10px] text-muted-foreground">
          Will derive when{' '}
          <code className="font-mono text-foreground/80">
            {result?.kind === 'pending' ? result.missing.join(', ') : 'inputs'}
          </code>{' '}
          {result?.kind === 'pending' && result.missing.length === 1 ? 'is' : 'are'} filled in.
        </p>
      </div>
    );
  }
  if (result.kind === 'error') {
    return (
      <div className="rounded border border-danger/50 bg-danger/5 px-2 py-1.5">
        <p className="flex items-center gap-1 text-[10px] text-danger">
          <AlertCircle className="h-3 w-3" aria-hidden="true" />
          {result.reason}
        </p>
      </div>
    );
  }
  return (
    <>
      <Input
        id={id}
        value={result.base58}
        readOnly
        className="h-7 text-[11px] font-mono bg-surface-1/60 text-muted-foreground"
        spellCheck={false}
      />
      <p className="text-[10px] text-muted-foreground flex items-center gap-1">
        <Lock className="h-3 w-3" aria-hidden="true" />
        Derived (bump {result.bump})
      </p>
    </>
  );
};

const FieldHeader: React.FC<{
  id: string;
  account: ArchInstructionAccount;
  pill: 'address' | 'pda' | 'signer' | null;
  pillLabel: string | null;
}> = ({ id, account, pill, pillLabel }) => (
  <div className="flex items-center justify-between gap-2">
    <label htmlFor={id} className="text-[11px] font-mono text-foreground/85">
      {account.name}
      {account.optional && (
        <span className="ml-1 text-[10px] text-muted-foreground italic">(optional)</span>
      )}
    </label>
    <span className="flex items-center gap-1">
      {account.isMut && (
        <span className="px-1 rounded bg-warning/15 text-warning text-[9px] uppercase tracking-wider">
          mut
        </span>
      )}
      {account.isSigner && pill !== 'signer' && (
        <span className="px-1 rounded bg-info/15 text-info text-[9px] uppercase tracking-wider">
          signer
        </span>
      )}
      {pill && pillLabel && (
        <span
          className={
            pill === 'address'
              ? 'px-1 rounded bg-success/15 text-success text-[9px] uppercase tracking-wider'
              : pill === 'pda'
                ? 'px-1 rounded bg-brand/15 text-brand text-[9px] uppercase tracking-wider'
                : 'px-1 rounded bg-info/15 text-info text-[9px] uppercase tracking-wider'
          }
        >
          {pillLabel}
        </span>
      )}
    </span>
  </div>
);

/**
 * Submit button + status surface. Pulls together the encoder, signer,
 * and submitter into a single async action so the rest of the form
 * stays declarative. We render three discrete UI states (idle,
 * submitting, success/error) instead of squeezing all of them into
 * one element with conditional classes — easier to reason about and
 * trivial to extend (e.g. a "Confirming…" phase in Slice 3.5).
 */
interface SubmitPanelProps {
  instruction: ArchInstruction;
  argValues: Record<string, ArgValue>;
  accounts: Record<string, string>;
  project: Project | null;
  config: Config;
  idl: ArchIdl;
  walletSigner?: WalletSigner;
  state: SubmitState;
  onStateChange: (s: SubmitState) => void;
  mutations: ProjectMutations;
}

const SubmitPanel: React.FC<SubmitPanelProps> = ({
  instruction,
  argValues,
  accounts,
  project,
  config,
  idl,
  walletSigner,
  state,
  onStateChange,
  mutations,
}) => {
  const argsValid = instruction.args.every((a) =>
    isArgValueValid(argValues[a.name] ?? emptyArgValue(a.type)),
  );
  const isSubmitting = state.kind === 'submitting';
  const canSubmit = argsValid && !!project?.account?.pubkey && !isSubmitting;

  const handleSubmit = async () => {
    if (!project) return;
    onStateChange({ kind: 'submitting' });
    const result = await submitInstruction({
      rpcUrl: config.rpcUrl,
      network: config.network,
      idl,
      instruction,
      accountValues: accounts,
      argValues,
      project,
      walletSigner,
    });
    onStateChange({ kind: result.ok ? 'success' : 'error', result });

    // Persist a history entry regardless of outcome — failed attempts
    // are at least as useful as successes for debugging. We record a
    // best-effort error message, so a transient RPC failure shows up
    // with enough context to retry. We deliberately swallow append
    // errors: a corrupt IDB write shouldn't kill the submit feedback.
    try {
      const entry: InvokeHistoryEntry = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        instruction: instruction.name,
        submittedAt: Date.now(),
        accountValues: accounts,
        argValues,
        network: config.network,
        outcome: result.ok && result.txid
          ? { kind: 'success', txid: result.txid }
          : { kind: 'error', message: result.errors.join(' • ') || 'Unknown error' },
        encodedDataHex: result.encodedDataHex,
        accounts: result.accounts,
      };
      await mutations.appendInvokeHistory(entry);
    } catch (e) {
      console.warn('[InvokeTab] failed to append history entry', e);
    }
  };

  return (
    <div className="flex flex-col gap-2 pt-1">
      <Button
        size="sm"
        variant={canSubmit ? 'default' : 'outline'}
        className="h-8 text-xs"
        disabled={!canSubmit}
        onClick={handleSubmit}
        title={
          !project?.account?.pubkey
            ? 'Deploy the program before invoking instructions'
            : !argsValid
              ? 'Some args still need attention'
              : 'Sign and submit the instruction'
        }
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-1.5 h-3 w-3 animate-spin" aria-hidden="true" />
            Submitting…
          </>
        ) : (
          <>
            <Send className="mr-1.5 h-3 w-3" aria-hidden="true" />
            Submit transaction
          </>
        )}
      </Button>

      {state.kind === 'idle' && (
        <SubmitHint
          instruction={instruction}
          argValues={argValues}
          hasProgramId={!!project?.account?.pubkey}
        />
      )}

      {state.kind === 'success' && (
        <ResultPanel
          tone="success"
          result={state.result}
          network={config.network}
          onClose={() => onStateChange({ kind: 'idle' })}
        />
      )}
      {state.kind === 'error' && (
        <ResultPanel
          tone="error"
          result={state.result}
          network={config.network}
          onClose={() => onStateChange({ kind: 'idle' })}
        />
      )}
    </div>
  );
};

const SubmitHint: React.FC<{
  instruction: ArchInstruction;
  argValues: Record<string, ArgValue>;
  hasProgramId: boolean;
}> = ({ instruction, argValues, hasProgramId }) => {
  if (!hasProgramId) {
    return (
      <p className="text-[10px] text-muted-foreground italic flex items-center gap-1">
        <AlertCircle className="h-3 w-3" aria-hidden="true" />
        Deploy the program before submitting — the instruction needs its on-chain ID.
      </p>
    );
  }
  const total = instruction.args.length;
  const invalid = instruction.args.filter(
    (a) => !isArgValueValid(argValues[a.name] ?? emptyArgValue(a.type)),
  ).length;
  if (total === 0) {
    return (
      <p className="text-[10px] text-muted-foreground italic">
        No args to fill — ready to submit.
      </p>
    );
  }
  if (invalid === 0) {
    return (
      <p className="text-[10px] text-muted-foreground italic">
        All args parsed cleanly — ready to submit.
      </p>
    );
  }
  return (
    <p className="text-[10px] text-muted-foreground italic">
      {invalid} of {total} args still need attention.
    </p>
  );
};

/**
 * Inline result panel. Success path surfaces the txid + an explorer
 * link when the network has one (mainnet/testnet). Error path lists
 * every accumulated failure so the user can fix them all at once
 * instead of playing whack-a-mole with one error at a time.
 */
const ResultPanel: React.FC<{
  tone: 'success' | 'error';
  result: SubmitResult;
  network: 'mainnet' | 'testnet' | 'devnet';
  onClose: () => void;
}> = ({ tone, result, network, onClose }) => {
  const explorer = getExplorerUrls(network);
  const txUrl = result.txid && explorer ? explorer.tx(result.txid) : null;
  return (
    <div
      className={
        tone === 'success'
          ? 'rounded-lg border border-success/40 bg-success/10 px-3 py-2 space-y-1.5'
          : 'rounded-lg border border-danger/50 bg-danger/10 px-3 py-2 space-y-1.5'
      }
      role="status"
      aria-live="polite"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[11px] font-medium">
          {tone === 'success' ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" />
          ) : (
            <AlertCircle className="h-3.5 w-3.5 text-danger" aria-hidden="true" />
          )}
          {tone === 'success' ? 'Transaction submitted' : 'Submission failed'}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-[10px] text-muted-foreground hover:text-foreground"
        >
          dismiss
        </button>
      </div>

      {result.txid && (
        <div className="flex items-center gap-1.5 text-[10px] font-mono">
          <span className="text-muted-foreground">txid:</span>
          <code className="text-foreground/85 truncate">{result.txid}</code>
          {txUrl && (
            <a
              href={txUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="ml-auto flex items-center gap-1 text-brand hover:underline"
            >
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
              explorer
            </a>
          )}
        </div>
      )}

      {result.errors.length > 0 && (
        <ul className="space-y-0.5">
          {result.errors.map((e, i) => (
            <li
              key={i}
              className="text-[10px] text-danger flex items-start gap-1"
            >
              <span aria-hidden="true">•</span>
              <span>{e}</span>
            </li>
          ))}
        </ul>
      )}

      {result.encodedDataHex && tone === 'success' && (
        <details className="text-[10px]">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
            Inspect instruction data ({result.encodedDataHex.length / 2} bytes)
          </summary>
          <pre className="mt-1 px-2 py-1 bg-surface-1 rounded font-mono break-all whitespace-pre-wrap text-[10px]">
            {result.encodedDataHex}
          </pre>
        </details>
      )}
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="space-y-1.5">
    <h3 className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
      <Info className="h-3 w-3" aria-hidden="true" />
      {title}
    </h3>
    {children}
  </section>
);

export default InvokeTab;
