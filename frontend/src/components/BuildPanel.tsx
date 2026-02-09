import { ClipboardIcon, Plus, Import, Save, Loader2 } from 'lucide-react';
import { Button } from './ui/button';
import { useState } from 'react';
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
  import { ConnectionStatus } from './ConnectionStatus';
  import { Project, ProjectAccount } from '../types';
  import { useToast } from "@/components/ui/use-toast";
  import { getSmartRpcUrl } from '../utils/smartRpcConnection';
import { AuthorityAccountPanel } from './AuthorityAccountPanel';
import { hexToBase58 } from '../utils/base58';
import FormatToggleInput from './FormatToggleInput';
import StepCard from './StepCard';
import Identicon from './Identicon';

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
        console.log('Connection status changed:', connected);
        setIsRpcConnected(connected);
      }, [connected]);

      const handleImportBinary = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        // Validate file type
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
                ? programBinary.split(',')[1]  // Handle data URL format
                : programBinary;               // Handle raw base64

            // Decode base64 safely
            try {
                // Convert base64 to binary string using a more robust approach
                const binaryString = Buffer.from(base64Content, 'base64').toString('binary');
                binaryData = new Uint8Array(binaryString.length);
                for (let i = 0; i < binaryString.length; i++) {
                    binaryData[i] = binaryString.charCodeAt(i);
                }
            } catch (error) {
                throw new Error('Failed to decode binary data');
            }

            // Create and download the blob
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
        // Use the smart RPC URL utility to handle proxying for CORS
        const smartRpcUrl = getSmartRpcUrl(config.rpcUrl);

        console.log('Creating new keypair with RPC URL:', smartRpcUrl);

        // Create the RPC provider first
        const provider = new RpcConnection(smartRpcUrl);
        // Enhance the provider with Arch-specific functionality
        const connection = ArchConnection(provider);

        console.log('Creating new account with connection:', connection);
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

    // Update the Plus button click handler
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

    const isDeployReady = () => {
      return {
        hasBinary: Boolean(programBinary),
        hasAccount: Boolean(currentAccount),
        hasProject: Boolean(project),
        isConnected: connected,
        ready: Boolean(programBinary && currentAccount && project && connected)
      };
    };

    const deployStatus = isDeployReady();

    return (
        <div className="w-full min-w-[390px] shrink-0 bg-gray-800 border-r border-gray-700 p-5 space-y-6 no-scrollbar overflow-y-auto overflow-x-hidden">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">BUILD & DEPLOY</h2>
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-medium px-2 py-1 rounded border ${
                config.network === 'mainnet'
                  ? 'bg-red-900/40 text-red-300 border-red-400'
                  : config.network === 'testnet'
                    ? 'bg-yellow-900/30 text-yellow-300 border-yellow-400'
                    : 'bg-blue-900/40 text-blue-300 border-blue-400'
              }`}>
                {config.network === 'mainnet' ? 'MAINNET' : config.network.toUpperCase()}
              </span>
            </div>
          </div>

          <Button
            className="w-full bg-[#F7931A] hover:bg-[#d47b16] text-white"
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

          {/* Step 1: Program */}
          <StepCard
            step={1}
            title="Program"
            actions={
              <>
                <Button data-tutorial="generate-key" variant="ghost" size="sm" onClick={handleNewKeypairClick} aria-label="New">
                  <Plus className="h-4 w-4" />
                  <span className="hidden lg:inline ml-1">New</span>
                </Button>
                <Button variant="ghost" size="sm" onClick={() => document.getElementById('import-keypair')?.click()} aria-label="Import">
                  <Import className="h-4 w-4" />
                  <span className="hidden lg:inline ml-1">Import</span>
                </Button>
                <Button variant="ghost" size="sm" onClick={handleExportKeypair} disabled={!currentAccount} aria-label="Save">
                  <Save className="h-4 w-4" />
                  <span className="hidden lg:inline ml-1">Save</span>
                </Button>
              </>
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
            {(() => {
              const programPubkeyHex = currentAccount?.pubkey || project?.account?.pubkey;
              return programPubkeyHex ? (
                <div className="flex items-center gap-2 min-w-0" data-tutorial="keypair-generated">
                  <FormatToggleInput label="Program ID" hex={programPubkeyHex} />
                </div>
              ) : (
                <div className="flex items-center space-x-2">
                  <code className="text-xs bg-gray-900 p-2 rounded flex-1 overflow-hidden">
                    Not deployed
                  </code>
                </div>
              );
            })()}
          </StepCard>

          {/* Step 2: Authority */}
          <StepCard step={2} title="Authority" actions={null}>
            <AuthorityAccountPanel
              project={project}
              onAuthorityAccountChange={onAuthorityAccountChange}
              onSaveToHistory={onSaveToHistory}
              onRestoreFromHistory={onRestoreFromHistory}
              onDeleteFromHistory={onDeleteFromHistory}
              config={config}
              isConnected={isRpcConnected}
            />
          </StepCard>

          {/* Step 3: Artifact */}
          <StepCard
            step={3}
            title="Artifact"
            actions={
              <>
                <Button variant="ghost" size="sm" onClick={() => document.getElementById('import-binary')?.click()} aria-label="Import">
                  <Import className="h-4 w-4" />
                  <span className="hidden lg:inline ml-1">Import</span>
                </Button>
                <Button variant="ghost" size="sm" onClick={handleExportBinary} disabled={!programBinary} aria-label="Save">
                  <Save className="h-4 w-4" />
                  <span className="hidden lg:inline ml-1">Save</span>
                </Button>
              </>
            }
          >
            <div className="flex items-center gap-2">
              <input
                type="file"
                id="import-binary"
                accept=".so"
                className="hidden"
                onChange={handleImportBinary}
              />
            </div>
            <div className="flex items-center gap-2">
              <div className="text-xs bg-gray-900 p-2 rounded flex-1">
                {(programBinary && binaryFileName)
                  ? binaryFileName
                  : 'Import your program binary (.so)'}
              </div>
              <div className={`w-2 h-2 rounded-full ${programBinary ? 'bg-green-500' : 'bg-red-500'}`}
                   title={programBinary ? 'Binary loaded' : 'No binary loaded'} />
            </div>
          </StepCard>

          {config.network === 'mainnet' && (
            <div className="rounded-md border border-red-700 bg-red-900/20 text-red-300 text-xs p-3">
              Deploys on Mainnet are irreversible. Review fees and program permissions.
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="text-xs text-gray-400">
              Estimated fee: <span className="text-gray-200">~0.001 ARCH</span>
            </div>
            <div className="flex-1" />
            <Button
              className="mt-2"
              data-tutorial="deploy"
              onClick={onDeploy}
              disabled={isDeploying || !currentAccount || !hasProjects}
            >
              {isDeploying ? 'Deploying...' : 'Deploy'}
            </Button>
          </div>
        </div>
      );
  };

export default BuildPanel;