// Wallet connection button - shows in the UI like Solana Playground
import React from 'react';
import { Wallet, ChevronDown, LogOut } from 'lucide-react';
import { Button } from '../ui/button';
import { useBitcoinWallet } from '../../hooks/useBitcoinWallet';
import { useToast } from '../ui/use-toast';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

const WalletIcon: React.FC<{ name: string }> = ({ name }) => {
  const getWalletStyle = () => {
    switch (name) {
      case 'Unisat':
        return { bg: 'bg-orange-600', text: 'U' };
      case 'Xverse':
        return { bg: 'bg-purple-600', text: 'X' };
      default:
        return { bg: 'bg-muted', text: name[0] };
    }
  };

  const style = getWalletStyle();

  return (
    <div
      aria-hidden="true"
      className={`${style.bg} w-5 h-5 rounded flex items-center justify-center text-white text-xs font-bold`}
    >
      {style.text}
    </div>
  );
};

interface WalletButtonProps {
  network?: 'mainnet' | 'testnet' | 'regtest';
  rpcUrl?: string;
}

export const WalletButton: React.FC<WalletButtonProps> = ({
  network = 'testnet',
}) => {
  const {
    wallet,
    account,
    connected,
    connecting,
    availableWallets,
    connect,
    disconnect
  } = useBitcoinWallet();

  const { toast } = useToast();

  const handleConnect = async (walletName: string) => {
    try {
      await connect(walletName, network);
      toast({
        title: "Wallet Connected",
        description: `Successfully connected to ${walletName} on ${network}`,
      });
    } catch (error: any) {
      console.error('Connection error:', error);
      toast({
        title: "Connection Failed",
        description: error.message || "Failed to connect wallet",
        variant: "destructive",
      });
    }
  };

  // Truncate address for display
  const formatAddress = (address?: string) => {
    if (!address) return 'Unknown';
    if (address.length <= 16) return address;
    return `${address.slice(0, 8)}...${address.slice(-8)}`;
  };

  if (connecting) {
    return (
      <Button variant="outline" size="sm" disabled className="gap-2 bg-accent border-border text-foreground/80">
        <Wallet className="h-4 w-4 animate-pulse text-brand" aria-hidden="true" />
        <span>Connecting...</span>
      </Button>
    );
  }

  if (connected && account && account.address) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 bg-accent border-border hover:bg-surface-3 text-foreground"
            aria-label={`Wallet ${formatAddress(account.address)}`}
          >
            <Wallet className="h-4 w-4 text-brand" aria-hidden="true" />
            <span className="font-mono text-xs font-medium">{formatAddress(account.address)}</span>
            <ChevronDown className="h-3 w-3 opacity-70" aria-hidden="true" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72 bg-popover border-border">
          <DropdownMenuLabel className="text-foreground">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-brand" aria-hidden="true" />
              <span className="font-semibold">{wallet?.name}</span>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator className="bg-border" />
          <div className="px-3 py-3 text-sm bg-accent/50">
            <div className="text-muted-foreground text-xs font-medium mb-1.5">Address</div>
            <div className="font-mono text-sm text-foreground break-all leading-relaxed">{account.address}</div>
          </div>
          {account.publicKey && (
            <div className="px-3 py-3 text-sm bg-accent/30 border-t border-border">
              <div className="text-muted-foreground text-xs font-medium mb-1.5">Public Key</div>
              <div className="font-mono text-sm text-foreground break-all leading-relaxed">{account.publicKey}</div>
            </div>
          )}
          <DropdownMenuSeparator className="bg-border" />
          <DropdownMenuItem
            onClick={() => disconnect()}
            className="text-danger hover:text-danger hover:bg-danger/10 font-medium cursor-pointer flex items-center gap-2"
          >
            <LogOut className="h-4 w-4" aria-hidden="true" />
            <span>Disconnect</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  // Not connected - show wallet selection
  if (availableWallets.length === 0) {
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-2 bg-accent border-border hover:bg-surface-3 text-foreground"
        onClick={() => window.open('https://unisat.io', '_blank')}
      >
        <Wallet className="h-4 w-4" aria-hidden="true" />
        <span>Install Wallet</span>
      </Button>
    );
  }

  if (availableWallets.length === 1) {
    // Only one wallet available - direct connect
    return (
      <Button
        variant="outline"
        size="sm"
        className="gap-2 bg-accent border-border hover:bg-surface-3 text-foreground"
        onClick={() => handleConnect(availableWallets[0].name)}
      >
        <Wallet className="h-4 w-4" aria-hidden="true" />
        <span>Connect {availableWallets[0].name}</span>
      </Button>
    );
  }

  // Multiple wallets available - show dropdown
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="gap-2 bg-accent border-border hover:bg-surface-3 text-foreground"
        >
          <Wallet className="h-4 w-4" aria-hidden="true" />
          <span>Connect Wallet</span>
          <ChevronDown className="h-3 w-3 opacity-70" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="bg-popover border-border">
        <DropdownMenuLabel className="text-foreground font-semibold">Select Wallet</DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-border" />
        {availableWallets.map((w) => (
          <DropdownMenuItem
            key={w.name}
            onClick={() => handleConnect(w.name)}
            className="gap-2 text-foreground hover:bg-accent cursor-pointer"
          >
            <WalletIcon name={w.name} />
            <span>{w.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
