import React, { useState } from 'react';
import {
  Boxes,
  AlertTriangle,
  Database,
  Workflow,
  ChevronDown,
  ChevronRight,
  Copy,
  Check,
  Trash2,
  Pencil,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '../../ui/button';
import { renderType } from '../../../utils/idl/typeRender';
import type { ArchIdl, ArchInstruction, ArchAccountType, ArchTypeDefinition } from '../../../types';

interface OverviewTabProps {
  idl: ArchIdl;
  onReplaceIdl: () => void;
  onClearIdl: () => void;
}

/**
 * Read-only browser for the IDL: instructions, accounts, types, errors.
 * Each section collapses independently so devs can pin a single instruction
 * open while working through a deploy.
 */
export const OverviewTab: React.FC<OverviewTabProps> = ({ idl, onReplaceIdl, onClearIdl }) => {
  return (
    <div className="space-y-3 px-3 py-3">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground truncate">{idl.name}</h2>
          <p className="text-[11px] text-muted-foreground">
            IDL v{idl.version} &middot; {idl.instructions.length} instructions
            &middot; {idl.accounts.length} accounts
            &middot; {idl.errors.length} errors
          </p>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <Button variant="ghost" size="sm" className="h-7 text-[11px] px-2" onClick={onReplaceIdl}>
            <Pencil className="mr-1 h-3 w-3" aria-hidden="true" />
            Replace
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-[11px] px-2 text-muted-foreground hover:text-danger hover:bg-danger/10"
            onClick={onClearIdl}
            aria-label="Clear IDL"
          >
            <Trash2 className="h-3 w-3" aria-hidden="true" />
          </Button>
        </div>
      </header>

      <Section
        title="Instructions"
        icon={<Workflow className="h-3.5 w-3.5" aria-hidden="true" />}
        count={idl.instructions.length}
        emptyMessage="No instructions in this IDL."
      >
        {idl.instructions.map((ix) => (
          <InstructionItem key={ix.name} ix={ix} />
        ))}
      </Section>

      <Section
        title="Accounts"
        icon={<Database className="h-3.5 w-3.5" aria-hidden="true" />}
        count={idl.accounts.length}
        emptyMessage="No account schemas defined."
      >
        {idl.accounts.map((account) => (
          <AccountItem key={account.name} account={account} />
        ))}
      </Section>

      {idl.types.length > 0 && (
        <Section
          title="Types"
          icon={<Boxes className="h-3.5 w-3.5" aria-hidden="true" />}
          count={idl.types.length}
        >
          {idl.types.map((t) => (
            <TypeItem key={t.name} type={t} />
          ))}
        </Section>
      )}

      {idl.errors.length > 0 && (
        <Section
          title="Errors"
          icon={<AlertTriangle className="h-3.5 w-3.5 text-warning" aria-hidden="true" />}
          count={idl.errors.length}
        >
          <ul className="divide-y divide-border/40" role="list">
            {idl.errors.map((err) => (
              <li
                key={`${err.code}-${err.name}`}
                className="flex items-start gap-2 px-2 py-1.5 text-xs"
              >
                <span className="font-mono text-[10px] text-muted-foreground mt-0.5 w-10 text-right flex-shrink-0">
                  {err.code}
                </span>
                <div className="min-w-0">
                  <div className="font-medium text-foreground/90 truncate">{err.name}</div>
                  {err.msg && (
                    <div className="text-[11px] text-muted-foreground">{err.msg}</div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
};

interface SectionProps {
  title: string;
  icon: React.ReactNode;
  count?: number;
  emptyMessage?: string;
  children: React.ReactNode;
}

const Section: React.FC<SectionProps> = ({ title, icon, count, emptyMessage, children }) => {
  const [open, setOpen] = useState(true);
  const hasChildren = React.Children.count(children) > 0;
  return (
    <section className="rounded-lg border border-border bg-surface-2/30">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 hover:bg-accent/40 rounded-t-lg transition-colors"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" aria-hidden="true" />
        )}
        <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {icon}
          {title}
        </span>
        {count !== undefined && (
          <span className="ml-auto text-[10px] text-muted-foreground bg-accent rounded-full px-1.5 py-0.5">
            {count}
          </span>
        )}
      </button>
      {open && (
        <div className="border-t border-border/60">
          {hasChildren ? children : (
            <p className="px-3 py-3 text-[11px] text-muted-foreground italic">
              {emptyMessage ?? 'Nothing here yet.'}
            </p>
          )}
        </div>
      )}
    </section>
  );
};

const InstructionItem: React.FC<{ ix: ArchInstruction }> = ({ ix }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border/40 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-accent/30 transition-colors text-left"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" aria-hidden="true" />
        )}
        <span className="font-mono text-foreground/90 truncate">{ix.name}</span>
        <span className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span>{ix.accounts.length} acc</span>
          <span>&middot;</span>
          <span>{ix.args.length} args</span>
        </span>
      </button>
      {open && (
        <div className="px-4 pb-2 space-y-2">
          {ix.accounts.length > 0 && (
            <SubBlock label="Accounts">
              <ul className="space-y-1" role="list">
                {ix.accounts.map((acc) => (
                  <li
                    key={acc.name}
                    className="flex items-center gap-2 text-[11px]"
                  >
                    <span className="font-mono text-foreground/85 truncate">{acc.name}</span>
                    <span className="flex items-center gap-1 ml-auto flex-shrink-0">
                      {acc.isMut && (
                        <span className="px-1 rounded bg-warning/15 text-warning text-[9px] uppercase tracking-wider">
                          mut
                        </span>
                      )}
                      {acc.isSigner && (
                        <span className="px-1 rounded bg-info/15 text-info text-[9px] uppercase tracking-wider">
                          signer
                        </span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </SubBlock>
          )}
          {ix.args.length > 0 && (
            <SubBlock label="Args">
              <ul className="space-y-1" role="list">
                {ix.args.map((arg) => (
                  <li
                    key={arg.name}
                    className="flex items-center justify-between gap-2 text-[11px]"
                  >
                    <span className="font-mono text-foreground/85 truncate">{arg.name}</span>
                    <code className="text-[10px] text-muted-foreground font-mono">
                      {renderType(arg.type)}
                    </code>
                  </li>
                ))}
              </ul>
            </SubBlock>
          )}
        </div>
      )}
    </div>
  );
};

const AccountItem: React.FC<{ account: ArchAccountType }> = ({ account }) => {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copyName = () => {
    navigator.clipboard.writeText(account.name);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };
  return (
    <div className="border-b border-border/40 last:border-b-0">
      <div
        className={cn(
          'group flex items-center gap-2 px-2.5 py-1.5 text-xs transition-colors',
          'hover:bg-accent/30',
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
        >
          {open ? (
            <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" aria-hidden="true" />
          )}
          <span className="font-mono text-foreground/90 truncate">{account.name}</span>
          <span className="ml-auto text-[10px] text-muted-foreground">
            {account.type.fields.length} fields
          </span>
        </button>
        <button
          type="button"
          onClick={copyName}
          className="opacity-0 group-hover:opacity-100 hover:bg-accent rounded p-1 transition-all"
          aria-label={`Copy ${account.name}`}
        >
          {copied ? (
            <Check className="h-3 w-3 text-success" aria-hidden="true" />
          ) : (
            <Copy className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
          )}
        </button>
      </div>
      {open && (
        <div className="px-4 pb-2 pt-1">
          <SubBlock label="Fields">
            <ul className="space-y-1" role="list">
              {account.type.fields.map((field) => (
                <li
                  key={field.name}
                  className="flex items-center justify-between gap-2 text-[11px]"
                >
                  <span className="font-mono text-foreground/85 truncate">{field.name}</span>
                  <code className="text-[10px] text-muted-foreground font-mono">
                    {field.type}
                  </code>
                </li>
              ))}
            </ul>
          </SubBlock>
        </div>
      )}
    </div>
  );
};

const TypeItem: React.FC<{ type: ArchTypeDefinition }> = ({ type }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border/40 last:border-b-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 px-2.5 py-1.5 text-xs hover:bg-accent/30 transition-colors text-left"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 text-muted-foreground flex-shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-3 w-3 text-muted-foreground flex-shrink-0" aria-hidden="true" />
        )}
        <span className="font-mono text-foreground/90 truncate">{type.name}</span>
        <span className="ml-auto text-[10px] text-muted-foreground uppercase tracking-wider">
          {type.type.kind}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-2 pt-1">
          {type.type.kind === 'struct' && type.type.fields && (
            <SubBlock label="Fields">
              <ul className="space-y-1" role="list">
                {type.type.fields.map((field) => (
                  <li
                    key={field.name}
                    className="flex items-center justify-between gap-2 text-[11px]"
                  >
                    <span className="font-mono text-foreground/85 truncate">{field.name}</span>
                    <code className="text-[10px] text-muted-foreground font-mono">
                      {renderType(field.type)}
                    </code>
                  </li>
                ))}
              </ul>
            </SubBlock>
          )}
          {type.type.kind === 'enum' && type.type.variants && (
            <SubBlock label="Variants">
              <ul className="space-y-1" role="list">
                {type.type.variants.map((v) => (
                  <li
                    key={v.name}
                    className="flex items-center justify-between gap-2 text-[11px]"
                  >
                    <span className="font-mono text-foreground/85 truncate">{v.name}</span>
                    {v.fields && v.fields.length > 0 && (
                      <code className="text-[10px] text-muted-foreground font-mono">
                        ({v.fields.map((f) => renderType(f.type)).join(', ')})
                      </code>
                    )}
                  </li>
                ))}
              </ul>
            </SubBlock>
          )}
        </div>
      )}
    </div>
  );
};

const SubBlock: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80 mb-1">
      {label}
    </div>
    {children}
  </div>
);

export default OverviewTab;
