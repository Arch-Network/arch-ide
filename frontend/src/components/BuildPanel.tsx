import { Plus, Import, Save, Loader2, Upload, Check, Circle, Rocket, Hammer, Play, X } from 'lucide-react';
import { Button } from './ui/button';
import { useState, useCallback, useRef, useMemo } from 'react';
import { ArchConnection, RpcConnection } from '@arch-network/arch-sdk';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
  } from "./ui/tooltip";
  import { NewKeypairDialog } from './NewKeypairDialog';
  import { useEffect } from 'react';
  import { Config } from '../types/config';
  import { Project, ProjectAccount } from '../types';
  import { useToast } from "@/components/ui/use-toast";
  import { getSmartRpcUrl } from '../utils/smartRpcConnection';
import { type BinaryOrigin, decodeProgramBinary, describeOrigin, hasElfMagic, shortSha256 } from '../utils/programArtifact';
import { AuthorityAccountPanel } from './AuthorityAccountPanel';
import FormatToggleInput from './FormatToggleInput';
import StepCard from './StepCard';
import type { StepStatus } from './StepCard';
import { estimateDeployCost } from '../utils/arch-sdk-deployer';
import { formatArchFromLamports } from '../utils/archUnits';

const WORKFLOW_DISMISSED_KEY = 'arch-ide:build-panel-workflow-dismissed';

  interface BuildPanelProps {
    hasProjects: boolean;
    onBuild: () => void;
    /** Starts a deploy, or cancels the running one while isDeploying. */
    onDeploy: () => void;
    isBuilding: boolean;
    isDeploying: boolean;
    programId?: string;
    programBinary?: string | null;
    onProgramBinaryChange?: (binary: string | null) => void;
    binaryOrigin?: BinaryOrigin | null;
    onBinaryOriginChange?: (origin: BinaryOrigin) => void;
    config: Config;
    onConfigChange?: (config: Config) => void;
    onConnectionStatusChange?: (connected: boolean) => void;
    onProgramIdChange?: (programId: string) => void;
    currentAccount: {
      privkey: string;
      pubkey: string;
      address: string;
    } | null;
    onAccountChange: (account: { privkey: string; pubkey: string; address: string; } | null) => void;
    project: Project | null;
    onProjectAccountChange: (account: ProjectAccount) => void;
    onAuthorityAccountChange: (account: ProjectAccount | null) => void;
    onSaveToHistory?: (account: ProjectAccount) => Promise<void>;
    onRestoreFromHistory?: (index: number) => Promise<void>;
    onDeleteFromHistory?: (index: number) => Promise<void>;
    binaryFileName: string | null;
    setBinaryFileName: (name: string | null) => void;
    connected: boolean;
  }

  const BuildPanel = ({
    hasProjects,
    onBuild,
    onDeploy,
    isBuilding,
    isDeploying,
    programId,
    programBinary,
    onProgramBinaryChange,
    binaryOrigin,
    onBinaryOriginChange,
    config,
    onConnectionStatusChange,
    onProgramIdChange,
    currentAccount,
    onAccountChange,
    project,
    onProjectAccountChange,
    onAuthorityAccountChange,
    onSaveToHistory,
    onRestoreFromHistory,
    onDeleteFromHistory,
    binaryFileName,
    setBinaryFileName,
    connected
  }: BuildPanelProps) => {
      const [isNewKeypairDialogOpen, setIsNewKeypairDialogOpen] = useState(false);
      const [isUploading, setIsUploading] = useState(false);
      const [isDragOver, setIsDragOver] = useState(false);
      const [authorityActions, setAuthorityActions] = useState<React.ReactNode>(null);
      const [isWorkflowDismissed, setIsWorkflowDismissed] = useState(() => {
        try {
          return localStorage.getItem(WORKFLOW_DISMISSED_KEY) === 'true';
        } catch {
          return false;
        }
      });
      const fileInputRef = useRef<HTMLInputElement>(null);
      const { toast } = useToast();
      const [isRpcConnected, setIsRpcConnected] = useState(connected);

      useEffect(() => {
        let isCurrentEffect = true;

        if (programBinary && project?.name && isCurrentEffect) {
          setBinaryFileName(`${project.name}.so`);
        }

        return () => {
          isCurrentEffect = false;
        };
      }, [programBinary, project?.name]);

      useEffect(() => {
        setIsRpcConnected(connected);
      }, [connected]);

      const [uploadError, setUploadError] = useState<string | null>(null);
      const [artifactIdentity, setArtifactIdentity] = useState<{ binary: string; size: number; sha256: string } | null>(null);
      useEffect(() => {
        setUploadError(null);
        if (!programBinary) return;
        let cancelled = false;
        const bytes = decodeProgramBinary(programBinary);
        shortSha256(bytes).then((sha256) => {
          if (!cancelled) setArtifactIdentity({ binary: programBinary, size: bytes.length, sha256 });
        });
        return () => {
          cancelled = true;
        };
      }, [programBinary]);

      // ── Step status computation ──────────────────────────────────
      const programPubkeyHex = currentAccount?.pubkey || project?.account?.pubkey;
      const hasKeypair = Boolean(programPubkeyHex);
      const hasAuthority = Boolean(project?.authorityAccount);
      const hasBinary = Boolean(programBinary);
      const estimatedCostLamports = useMemo(() => {
        if (!programBinary) return null;
        const base64 = programBinary.startsWith('data:') ? programBinary.split(',')[1] : programBinary;
        const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
        return estimateDeployCost(Math.floor((base64.length * 3) / 4) - padding, null).total;
      }, [programBinary]);

      const programStatus: StepStatus = hasKeypair ? 'complete' : 'pending';
      const authorityStatus: StepStatus = hasAuthority ? 'complete' : 'active';
      const artifactStatus: StepStatus = hasBinary ? 'complete' : 'pending';

      const readyCount = [hasKeypair, hasAuthority, hasBinary].filter(Boolean).length;
      const isDeployReady = hasKeypair && hasAuthority && hasBinary && connected;
      const deployReadinessReason = !hasProjects
        ? 'Create or select a project to begin.'
        : !hasBinary
          ? 'Build the program or import a .so artifact.'
          : !hasKeypair
            ? 'Generate or import a program keypair.'
            : !hasAuthority
              ? 'Generate or restore an authority account.'
              : !connected
                ? 'Connect to the selected network before deploying.'
                : 'Ready to deploy this build.';

      const WorkflowItem = ({
        icon,
        label,
        detail,
        done,
        active,
      }: {
        icon: React.ReactNode;
        label: string;
        detail: string;
        done?: boolean;
        active?: boolean;
      }) => (
        <div className="flex items-start gap-2 min-w-0">
          <div className={`mt-0.5 h-6 w-6 rounded-md flex items-center justify-center shrink-0 ${
            done
              ? 'bg-success/15 text-success'
              : active
                ? 'bg-brand/15 text-brand'
                : 'bg-surface-3 text-muted-foreground'
          }`}>
            {done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : icon}
          </div>
          <div className="min-w-0">
            <p className={`text-xs font-medium ${done || active ? 'text-foreground' : 'text-muted-foreground'}`}>
              {label}
            </p>
            <p className="text-[11px] leading-snug text-muted-foreground">
              {detail}
            </p>
          </div>
        </div>
      );

      const setWorkflowDismissed = (dismissed: boolean) => {
        setIsWorkflowDismissed(dismissed);
        try {
          if (dismissed) {
            localStorage.setItem(WORKFLOW_DISMISSED_KEY, 'true');
          } else {
            localStorage.removeItem(WORKFLOW_DISMISSED_KEY);
          }
        } catch {
          // Ignore storage failures; the current session state still updates.
        }
      };

      // ── Handlers ─────────────────────────────────────────────────
      const handleImportBinary = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        await processBinaryFile(file);
        // Clear the input so choosing the same file again still fires onChange.
        event.target.value = '';
      };

      const processBinaryFile = async (file: File) => {
        setUploadError(null);
        if (!file.name.endsWith('.so')) {
          setUploadError(`${file.name} was not loaded: please upload a .so binary file.`);
          return;
        }

        if (!hasElfMagic(new Uint8Array(await file.slice(0, 4).arrayBuffer()))) {
          setUploadError(`${file.name} was not loaded: it is not an ELF program (it does not start with the bytes 7f 45 4c 46). Upload the .so produced by cargo build-sbf.`);
          return;
        }

        try {
          setIsUploading(true);
          const reader = new FileReader();

          reader.onload = async (e) => {
            const binary = e.target?.result;
            if (binary) {
              setBinaryFileName(file.name);
              onProgramBinaryChange?.(binary as string);
              onBinaryOriginChange?.({ source: 'uploaded', fileName: file.name, at: new Date(), binary: binary as string });
              toast({
                title: "Success",
                description: "Program binary loaded successfully",
              });
            }
          };

          reader.onerror = () => {
            toast({
              title: "Error",
              description: "Failed to read binary file",
              variant: "destructive"
            });
          };

          reader.readAsDataURL(file);
        } catch (error) {
          toast({
            title: "Error",
            description: error instanceof Error ? error.message : "Failed to load binary",
            variant: "destructive"
          });
        } finally {
          setIsUploading(false);
        }
      };

    const handleExportBinary = () => {
        if (!programBinary || !binaryFileName) {
            toast({
                title: "Error",
                description: "Missing binary or filename",
                variant: "destructive"
            });
            return;
        }

        try {
            let binaryData: Uint8Array;
            const base64Content = programBinary.startsWith('data:')
                ? programBinary.split(',')[1]
                : programBinary;

            try {
                const binaryString = Buffer.from(base64Content, 'base64').toString('binary');
                binaryData = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    binaryData[i] = binaryString.charCodeAt(i);
                }
            } catch (error) {
                throw new Error('Failed to decode binary data');
            }

            const blob = new Blob([new Uint8Array(binaryData)], { type: 'application/octet-stream' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = binaryFileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            toast({
                title: "Success",
                description: "Binary downloaded successfully"
            });

        } catch (error) {
            console.error('Failed to export binary:', error);
            toast({
                title: "Error",
                description: error instanceof Error ? error.message : "Failed to export binary",
                variant: "destructive"
            });
        }
    };

    const handleNewKeypair = async () => {
      if (!connected) {
        toast({
          variant: "destructive",
          title: "Connection Error",
          description: "Cannot generate new keypair. Please check your RPC connection and try again."
        });
        return;
      }

      try {
        const smartRpcUrl = getSmartRpcUrl(config.rpcUrl);
        const provider = new RpcConnection(smartRpcUrl);
        const connection = ArchConnection(provider);
        const account = await connection.createNewAccount();
        onAccountChange(account);
        onProgramIdChange?.(account.pubkey);
        onProjectAccountChange(account);
        setIsNewKeypairDialogOpen(false);
      } catch (error) {
        console.error('Failed to generate keypair:', error);
        toast({
          variant: "destructive",
          title: "Error",
          description: `Failed to generate new keypair: ${error instanceof Error ? error.message : 'Unknown error'}`
        });
      }
    };

    const handleNewKeypairClick = () => {
      setIsNewKeypairDialogOpen(true);
    };

    const handleExportKeypair = () => {
      if (!currentAccount) return;
      const blob = new Blob([JSON.stringify(currentAccount, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'program-keypair.json';
      a.click();
      URL.revokeObjectURL(url);
    };

    const handleImportKeypair = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const account = JSON.parse(e.target?.result as string);
          onAccountChange(account);
          onProgramIdChange?.(account.pubkey);
          onProjectAccountChange(account);
        } catch (error) {
          console.error('Failed to import keypair:', error);
        }
      };
      reader.readAsText(file);
    };

    // ── Drag-and-drop handlers for artifact ──────────────────────
    const handleDragOver = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(true);
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
    }, []);

    const handleDrop = useCallback(async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);
      const file = e.dataTransfer.files?.[0];
      if (file) {
        await processBinaryFile(file);
      }
    }, []);

    // ── Readiness indicator ──────────────────────────────────────
    const ReadinessItem = ({ done, label }: { done: boolean; label: string }) => (
      <div className="flex items-center gap-1.5">
        {done ? (
          <Check className="h-3 w-3 text-success" aria-hidden="true" />
        ) : (
          <Circle className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
        )}
        <span
          className={`text-[11px] ${done ? 'text-foreground/80' : 'text-muted-foreground'}`}
          aria-label={`${label} ${done ? 'ready' : 'pending'}`}
        >
          {label}
        </span>
      </div>
    );

    return (
        <div className="w-full min-w-0 bg-surface-1 border-r border-border p-5 no-scrollbar overflow-y-auto overflow-x-hidden">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 mb-5 min-w-0">
            <h2 className="text-base font-bold tracking-wide text-foreground truncate">BUILD &amp; DEPLOY</h2>
            <div className="flex items-center gap-2 shrink-0">
              {isWorkflowDismissed && (
                <button
                  type="button"
                  onClick={() => setWorkflowDismissed(false)}
                  className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  Show workflow
                </button>
              )}
              <span className={`flex-shrink-0 text-[10px] font-semibold px-2.5 py-1 rounded-full tracking-wider whitespace-nowrap ${
                config.network === 'mainnet'
                  ? 'bg-danger/15 text-danger ring-1 ring-danger/30'
                  : config.network === 'testnet'
                    ? 'bg-warning/15 text-warning ring-1 ring-warning/30'
                    : 'bg-info/15 text-info ring-1 ring-info/30'
              }`}>
                {config.network === 'mainnet' ? 'MAINNET' : config.network.toUpperCase()}
              </span>
            </div>
          </div>

          {!isWorkflowDismissed && (
            <section className="rounded-lg border border-border bg-surface-2/60 p-4 mb-5 space-y-3" aria-label="Project workflow">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-foreground/90">
                    Project workflow
                  </h3>
                  <p className="text-[11px] text-muted-foreground mt-1">
                    Follow this path: build the Rust program, deploy it, then run a TypeScript client.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setWorkflowDismissed(true)}
                  className="shrink-0 rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  aria-label="Dismiss project workflow"
                  title="Dismiss workflow guidance"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>

              <div className="space-y-3">
                <WorkflowItem
                  icon={<Hammer className="h-3.5 w-3.5" aria-hidden="true" />}
                  label="Build"
                  detail={hasBinary ? `${binaryFileName || 'Program binary'} is ready.` : 'Compile the current project into a .so artifact.'}
                  done={hasBinary}
                  active={hasProjects && !hasBinary}
                />
                <WorkflowItem
                  icon={<Rocket className="h-3.5 w-3.5" aria-hidden="true" />}
                  label="Deploy"
                  detail={deployReadinessReason}
                  done={false}
                  active={isDeployReady}
                />
                <WorkflowItem
                  icon={<Play className="h-3.5 w-3.5" aria-hidden="true" />}
                  label="Run"
                  detail="Open a client/*.ts file after deployment to execute it against the selected network."
                  active={hasProjects}
                />
              </div>
            </section>
          )}

          {/* Build button */}
          <Button
            className="w-full h-10 bg-brand hover:bg-brand-hover text-brand-foreground font-semibold rounded-lg shadow-sm shadow-brand/20 transition-all duration-200 mb-6"
            onClick={onBuild}
            disabled={!hasProjects || isBuilding}
            title={!hasProjects ? 'Create or select a project before building.' : isBuilding ? 'Build already in progress.' : 'Build program'}
          >
            {isBuilding ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Building...
              </>
            ) : (
              'Build'
            )}
          </Button>

          {/* Steps */}
          <div className="space-y-0">
            {/* Step 1: Program */}
            <StepCard
              step={1}
              title="Program"
              status={programStatus}
              collapsible={hasKeypair}
              defaultCollapsed={false}
              actions={
                <TooltipProvider delayDuration={300}>
                  <div className="flex items-center gap-0.5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" onClick={handleNewKeypairClick} className="h-7 w-7 p-0 hover:bg-accent rounded-lg" aria-label="New keypair">
                          <Plus className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom"><p>New Keypair</p></TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" onClick={() => document.getElementById('import-keypair')?.click()} className="h-7 w-7 p-0 hover:bg-accent rounded-lg" aria-label="Import keypair">
                          <Import className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom"><p>Import Keypair</p></TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" onClick={handleExportKeypair} disabled={!currentAccount} className="h-7 w-7 p-0 hover:bg-accent rounded-lg" aria-label="Save keypair">
                          <Save className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom"><p>Export Keypair</p></TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>
              }
            >
              <NewKeypairDialog
                isOpen={isNewKeypairDialogOpen}
                onClose={() => setIsNewKeypairDialogOpen(false)}
                onConfirm={handleNewKeypair}
                isConnected={isRpcConnected}
              />
              <input
                type="file"
                id="import-keypair"
                className="hidden"
                accept="application/json"
                onChange={handleImportKeypair}
              />
              {programPubkeyHex ? (
                <div className="min-w-0">
                  <FormatToggleInput label="Program ID" hex={programPubkeyHex} />
                </div>
              ) : (
                <div className="text-center py-2">
                  <p className="text-xs text-muted-foreground">
                    No keypair generated yet. Click <strong className="text-foreground/80">+</strong> above to create one.
                  </p>
                </div>
              )}
            </StepCard>

            {/* Step 2: Authority */}
            <StepCard step={2} title="Authority" status={authorityStatus} actions={authorityActions}>
              <AuthorityAccountPanel
                project={project}
                onAuthorityAccountChange={onAuthorityAccountChange}
                onSaveToHistory={onSaveToHistory}
                onRestoreFromHistory={onRestoreFromHistory}
                onDeleteFromHistory={onDeleteFromHistory}
                config={config}
                isConnected={isRpcConnected}
                onRenderActions={setAuthorityActions}
                requiredLamports={estimatedCostLamports}
              />
            </StepCard>

            {/* Step 3: Artifact */}
            <StepCard
              step={3}
              title="Artifact"
              status={artifactStatus}
              isLast
              actions={
                <TooltipProvider delayDuration={300}>
                  <div className="flex items-center gap-0.5">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" onClick={() => document.getElementById('import-binary')?.click()} className="h-7 w-7 p-0 hover:bg-accent rounded-lg" aria-label="Import binary">
                          <Import className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom"><p>Import Binary</p></TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" onClick={handleExportBinary} disabled={!programBinary} className="h-7 w-7 p-0 hover:bg-accent rounded-lg" aria-label="Save binary">
                          <Save className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom"><p>Export Binary</p></TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>
              }
            >
              <input
                type="file"
                id="import-binary"
                ref={fileInputRef}
                accept=".so"
                className="hidden"
                onChange={handleImportBinary}
              />

              {hasBinary && binaryFileName ? (
                /* Binary loaded state */
                <div className="flex items-center gap-2.5 rounded-lg bg-success/5 border border-success/20 px-3 py-2.5">
                  <div className="h-2 w-2 rounded-full bg-success shadow-sm shadow-success/50" />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-mono text-foreground truncate">{binaryFileName}</p>
                    {programBinary && artifactIdentity?.binary === programBinary && (
                      <p className="text-[10px] leading-snug font-mono text-muted-foreground break-words">
                        {artifactIdentity.size.toLocaleString()} bytes · sha256 {artifactIdentity.sha256} · {describeOrigin(binaryOrigin, programBinary)}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                /* Drop zone */
                <div
                  className={`
                    relative rounded-lg border-2 border-dashed transition-all duration-200 cursor-pointer
                    ${isDragOver
                      ? 'border-brand/60 bg-brand/5'
                      : 'border-border hover:border-muted-foreground/50 bg-background/30 hover:bg-background/50'
                    }
                  `}
                  onClick={() => document.getElementById('import-binary')?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <div className="flex flex-col items-center py-5 px-4">
                    <Upload className={`h-5 w-5 mb-2 transition-colors ${isDragOver ? 'text-brand' : 'text-muted-foreground'}`} aria-hidden="true" />
                    <p className="text-xs text-muted-foreground text-center">
                      {isDragOver ? 'Drop to upload' : 'Drag & drop or click to import'}
                    </p>
                    <p className="text-[10px] text-muted-foreground/70 mt-1">.so binary files</p>
                  </div>
                </div>
              )}
              {uploadError && (
                <p role="alert" className="mt-2 text-[11px] leading-snug text-destructive">{uploadError}</p>
              )}
            </StepCard>
          </div>

          {/* Mainnet warning */}
          {config.network === 'mainnet' && (
            <div className="rounded-lg border border-danger/20 bg-danger/5 text-danger/90 text-xs p-3 mb-4" role="alert">
              Deploys on Mainnet are irreversible. Review fees and program permissions.
            </div>
          )}

          {/* Deploy Section */}
          <div className="rounded-lg border border-border bg-surface-2/60 p-4 space-y-3">
            {/* Readiness checklist */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ReadinessItem done={hasKeypair} label="Keypair" />
                <ReadinessItem done={hasAuthority} label="Authority" />
                <ReadinessItem done={hasBinary} label="Binary" />
              </div>
              <span className="text-[10px] text-muted-foreground font-mono">{readyCount}/3</span>
            </div>

            {/* Cost estimate */}
            {estimatedCostLamports !== null && (
              <div className="text-[11px] text-muted-foreground">
                Estimated cost:{' '}
                <span className="text-foreground/80 font-mono">
                  ~{formatArchFromLamports(estimatedCostLamports, { maximumSignificantDigits: 2 })} ARCH
                </span>
              </div>
            )}

            {/* Deploy button */}
            <Button
              onClick={onDeploy}
              disabled={!isDeploying && !isDeployReady}
              title={isDeploying ? 'Stop sending deploy transactions' : isDeployReady ? 'Deploy program' : deployReadinessReason}
              className={`
                w-full h-10 font-semibold rounded-lg transition-all duration-200
                ${isDeploying
                  ? 'bg-transparent hover:bg-destructive/10 text-destructive border border-destructive/50'
                  : isDeployReady
                  ? 'bg-success hover:bg-success/90 text-success-foreground shadow-sm shadow-success/20'
                  : 'bg-surface-3 hover:bg-surface-3/80 text-muted-foreground'
                }
              `}
            >
              {isDeploying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Cancel deploy
                </>
              ) : (
                <>
                  <Rocket className="mr-2 h-4 w-4" />
                  Deploy
                </>
              )}
            </Button>
          </div>
        </div>
      );
  };

export default BuildPanel;
