import { Plus, Import, Save, Loader2, Upload, Check, Circle, Rocket } from 'lucide-react';
import { Button } from './ui/button';
import { useState, useCallback, useRef } from 'react';
import { ArchConnection, RpcConnection } from '@saturnbtcio/arch-sdk';
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
import { AuthorityAccountPanel } from './AuthorityAccountPanel';
import FormatToggleInput from './FormatToggleInput';
import StepCard from './StepCard';
import type { StepStatus } from './StepCard';

  interface BuildPanelProps {
    hasProjects: boolean;
    onBuild: () => void;
    onDeploy: () => void;
    isBuilding: boolean;
    isDeploying: boolean;
    programId?: string;
    programBinary?: string | null;
    onProgramBinaryChange?: (binary: string | null) => void;
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

      // ── Step status computation ──────────────────────────────────
      const programPubkeyHex = currentAccount?.pubkey || project?.account?.pubkey;
      const hasKeypair = Boolean(programPubkeyHex);
      const hasAuthority = Boolean(project?.authorityAccount);
      const hasBinary = Boolean(programBinary);

      const programStatus: StepStatus = hasKeypair ? 'complete' : 'pending';
      const authorityStatus: StepStatus = hasAuthority ? 'complete' : 'active';
      const artifactStatus: StepStatus = hasBinary ? 'complete' : 'pending';

      const readyCount = [hasKeypair, hasAuthority, hasBinary].filter(Boolean).length;
      const isDeployReady = hasKeypair && hasAuthority && hasBinary && connected;

      // ── Handlers ─────────────────────────────────────────────────
      const handleImportBinary = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        await processBinaryFile(file);
      };

      const processBinaryFile = async (file: File) => {
        if (!file.name.endsWith('.so')) {
          toast({
            title: "Invalid file type",
            description: "Please upload a .so binary file",
            variant: "destructive"
          });
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
          <Check className="h-3 w-3 text-emerald-400" />
        ) : (
          <Circle className="h-3 w-3 text-gray-600" />
        )}
        <span className={`text-[11px] ${done ? 'text-gray-300' : 'text-gray-500'}`}>{label}</span>
      </div>
    );

    return (
        <div className="w-full min-w-[390px] shrink-0 bg-gray-800 border-r border-gray-700 p-5 no-scrollbar overflow-y-auto overflow-x-hidden">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-bold tracking-wide text-gray-100">BUILD & DEPLOY</h2>
            <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full tracking-wider ${
              config.network === 'mainnet'
                ? 'bg-red-500/15 text-red-300 ring-1 ring-red-500/30'
                : config.network === 'testnet'
                  ? 'bg-yellow-500/15 text-yellow-300 ring-1 ring-yellow-500/30'
                  : 'bg-blue-500/15 text-blue-300 ring-1 ring-blue-500/30'
            }`}>
              {config.network === 'mainnet' ? 'MAINNET' : config.network.toUpperCase()}
            </span>
          </div>

          {/* Build button */}
          <Button
            className="w-full h-10 bg-[#F7931A] hover:bg-[#d47b16] text-white font-semibold rounded-lg shadow-sm shadow-[#F7931A]/20 transition-all duration-200 mb-6"
            onClick={onBuild}
            disabled={!hasProjects || isBuilding}
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
                        <Button data-tutorial="generate-key" variant="ghost" size="sm" onClick={handleNewKeypairClick} className="h-7 w-7 p-0 hover:bg-gray-700/50 rounded-lg" aria-label="New keypair">
                          <Plus className="h-3.5 w-3.5 text-gray-400" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom"><p>New Keypair</p></TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" onClick={() => document.getElementById('import-keypair')?.click()} className="h-7 w-7 p-0 hover:bg-gray-700/50 rounded-lg" aria-label="Import keypair">
                          <Import className="h-3.5 w-3.5 text-gray-400" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom"><p>Import Keypair</p></TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" onClick={handleExportKeypair} disabled={!currentAccount} className="h-7 w-7 p-0 hover:bg-gray-700/50 rounded-lg" aria-label="Save keypair">
                          <Save className="h-3.5 w-3.5 text-gray-400" />
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
                <div className="min-w-0" data-tutorial="keypair-generated">
                  <FormatToggleInput label="Program ID" hex={programPubkeyHex} />
                </div>
              ) : (
                <div className="text-center py-2">
                  <p className="text-xs text-gray-500">
                    No keypair generated yet. Click <strong className="text-gray-400">+</strong> above to create one.
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
                        <Button variant="ghost" size="sm" onClick={() => document.getElementById('import-binary')?.click()} className="h-7 w-7 p-0 hover:bg-gray-700/50 rounded-lg" aria-label="Import binary">
                          <Import className="h-3.5 w-3.5 text-gray-400" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom"><p>Import Binary</p></TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="sm" onClick={handleExportBinary} disabled={!programBinary} className="h-7 w-7 p-0 hover:bg-gray-700/50 rounded-lg" aria-label="Save binary">
                          <Save className="h-3.5 w-3.5 text-gray-400" />
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
                <div className="flex items-center gap-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/20 px-3 py-2.5">
                  <div className="h-2 w-2 rounded-full bg-emerald-400 shadow-sm shadow-emerald-400/50" />
                  <span className="text-xs font-mono text-gray-200 truncate flex-1">{binaryFileName}</span>
                </div>
              ) : (
                /* Drop zone */
                <div
                  className={`
                    relative rounded-lg border-2 border-dashed transition-all duration-200 cursor-pointer
                    ${isDragOver
                      ? 'border-[#F7931A]/60 bg-[#F7931A]/5'
                      : 'border-gray-700/60 hover:border-gray-600 bg-gray-900/30 hover:bg-gray-900/50'
                    }
                  `}
                  onClick={() => document.getElementById('import-binary')?.click()}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <div className="flex flex-col items-center py-5 px-4">
                    <Upload className={`h-5 w-5 mb-2 transition-colors ${isDragOver ? 'text-[#F7931A]' : 'text-gray-500'}`} />
                    <p className="text-xs text-gray-400 text-center">
                      {isDragOver ? 'Drop to upload' : 'Drag & drop or click to import'}
                    </p>
                    <p className="text-[10px] text-gray-600 mt-1">.so binary files</p>
                  </div>
                </div>
              )}
            </StepCard>
          </div>

          {/* Mainnet warning */}
          {config.network === 'mainnet' && (
            <div className="rounded-lg border border-red-500/20 bg-red-500/5 text-red-300/90 text-xs p-3 mb-4">
              Deploys on Mainnet are irreversible. Review fees and program permissions.
            </div>
          )}

          {/* Deploy Section */}
          <div className="rounded-lg border border-gray-700/40 bg-gray-800/60 p-4 space-y-3">
            {/* Readiness checklist */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <ReadinessItem done={hasKeypair} label="Keypair" />
                <ReadinessItem done={hasAuthority} label="Authority" />
                <ReadinessItem done={hasBinary} label="Binary" />
              </div>
              <span className="text-[10px] text-gray-500 font-mono">{readyCount}/3</span>
            </div>

            {/* Fee estimate */}
            <div className="text-[11px] text-gray-500">
              Estimated fee: <span className="text-gray-300 font-mono">~0.001 ARCH</span>
            </div>

            {/* Deploy button */}
            <Button
              data-tutorial="deploy"
              onClick={onDeploy}
              disabled={isDeploying || !currentAccount || !hasProjects}
              className={`
                w-full h-10 font-semibold rounded-lg transition-all duration-200
                ${isDeployReady
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm shadow-emerald-600/20'
                  : 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                }
              `}
            >
              {isDeploying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deploying...
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
