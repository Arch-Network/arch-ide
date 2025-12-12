import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Button } from './ui/button';
import { Copy, CheckCircle2, RotateCcw, Trash2, ChevronDown, ChevronUp, Clock, FileText, CheckCircle } from 'lucide-react';
import { HistoricalAuthorityAccount, ProjectAccount } from '../types';
import { hexToBase58 } from '../utils/base58';
import { downloadKeypairJSON } from '../utils/keypairGenerator';
import { useToast } from './ui/use-toast';

interface HistoricalKeysModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentAccount?: ProjectAccount;
  historicalKeys: HistoricalAuthorityAccount[];
  onRestore: (index: number) => void;
  onDelete: (index: number) => void;
  projectName?: string;
}

const HistoricalKeysModal: React.FC<HistoricalKeysModalProps> = ({
  isOpen,
  onClose,
  currentAccount,
  historicalKeys,
  onRestore,
  onDelete,
  projectName
}) => {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const [currentExpanded, setCurrentExpanded] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const { toast } = useToast();

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
    toast({
      title: "Copied",
      description: "Copied to clipboard",
    });
  };

  const handleRestore = (index: number) => {
    if (window.confirm('This will replace your current authority account. Continue?')) {
      onRestore(index);
      onClose();
    }
  };

  const handleDelete = (index: number) => {
    if (window.confirm('Are you sure you want to delete this historical key? This action cannot be undone.')) {
      onDelete(index);
    }
  };

  const handleExport = (account: ProjectAccount) => {
    if (!projectName) return;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    downloadKeypairJSON(account, `${projectName}-authority-${timestamp}.json`);
  };

  const formatDate = (date: Date) => {
    const d = new Date(date);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getReasonBadge = (reason: string) => {
    const styles = {
      regenerated: 'bg-blue-900/40 text-blue-300 border-blue-800',
      project_deleted: 'bg-red-900/40 text-red-300 border-red-800',
      manual: 'bg-gray-700 text-gray-300 border-gray-600'
    };
    const labels = {
      regenerated: 'Regenerated',
      project_deleted: 'Project Deleted',
      manual: 'Manual'
    };
    return (
      <span className={`text-[10px] font-medium px-2 py-0.5 rounded border ${styles[reason as keyof typeof styles] || styles.manual}`}>
        {labels[reason as keyof typeof labels] || reason}
      </span>
    );
  };

  const sortedKeys = [...historicalKeys].sort((a, b) => {
    return new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime();
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-gray-800 border-gray-700 max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-gray-200">Historical Authority Keys</DialogTitle>
          <DialogDescription className="text-gray-400">
            View and manage previous authority account keypairs for this project
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4">
          <div className="space-y-2">
            {/* Current Key */}
            {currentAccount && (
              <div className="bg-gray-900/50 border-2 border-green-700/50 rounded-md overflow-hidden">
                <div
                  className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-800/50 transition-colors"
                  onClick={() => setCurrentExpanded(!currentExpanded)}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="flex-shrink-0">
                      {currentExpanded ? (
                        <ChevronUp className="h-4 w-4 text-gray-400" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-gray-400" />
                      )}
                    </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm text-gray-200 font-mono font-medium tracking-wide">
                              {(() => {
                                const pubkeyBase58 = hexToBase58(currentAccount.pubkey);
                                return pubkeyBase58.length > 16 
                                  ? `${pubkeyBase58.slice(0, 8)}...${pubkeyBase58.slice(-8)}`
                                  : pubkeyBase58;
                              })()}
                            </span>
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded border bg-green-900/40 text-green-300 border-green-800">
                          Current
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-gray-500">
                        <CheckCircle className="h-3 w-3 text-green-500" />
                        <span>Active authority account</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Expanded Content */}
                {currentExpanded && (
                  <div className="border-t border-gray-700 p-4 space-y-4 bg-gray-900/30">
                    <div className="space-y-3">
                      <div>
                        <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1.5 block">
                          Pubkey
                        </label>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 min-w-0 h-9 text-sm font-mono font-medium bg-gray-800 border border-gray-700 rounded px-3 flex items-center text-gray-50 tracking-wide">
                            <span className="truncate" title={hexToBase58(currentAccount.pubkey)}>
                              {hexToBase58(currentAccount.pubkey)}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopy(hexToBase58(currentAccount.pubkey), 'current-pubkey');
                            }}
                            className="h-9 px-2.5"
                            title="Copy pubkey"
                          >
                            {copiedField === 'current-pubkey' ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                            ) : (
                              <Copy className="h-3.5 w-3.5 text-gray-400" />
                            )}
                          </Button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleExport(currentAccount);
                          }}
                          className="h-8 text-xs border-gray-600 text-gray-700 hover:bg-gray-700 hover:text-gray-200"
                        >
                          <FileText className="h-3.5 w-3.5 mr-1.5" />
                          Export JSON
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Historical Keys */}
            {sortedKeys.length === 0 && !currentAccount ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Clock className="h-12 w-12 text-gray-600 mb-4" />
                <p className="text-gray-400 text-sm">No historical keys</p>
                <p className="text-gray-500 text-xs mt-2">Historical keys will appear here when you regenerate your authority account</p>
              </div>
            ) : (
              sortedKeys.map((historicalKey, index) => {
                const originalIndex = historicalKeys.indexOf(historicalKey);
                const isExpanded = expandedIndex === originalIndex;
                const pubkeyBase58 = hexToBase58(historicalKey.account.pubkey);
                const truncatedPubkey = pubkeyBase58.length > 16 
                  ? `${pubkeyBase58.slice(0, 8)}...${pubkeyBase58.slice(-8)}`
                  : pubkeyBase58;

                return (
                  <div
                    key={originalIndex}
                    className="bg-gray-900/50 border border-gray-700 rounded-md overflow-hidden"
                  >
                    {/* Collapsed Row */}
                    <div
                      className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-800/50 transition-colors"
                      onClick={() => setExpandedIndex(isExpanded ? null : originalIndex)}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="flex-shrink-0">
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4 text-gray-400" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-gray-400" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm text-gray-300 font-mono font-medium tracking-wide">{truncatedPubkey}</span>
                            {getReasonBadge(historicalKey.reason)}
                          </div>
                          <div className="flex items-center gap-2 text-[10px] text-gray-500">
                            <Clock className="h-3 w-3" />
                            <span>{formatDate(historicalKey.savedAt)}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Expanded Content */}
                    {isExpanded && (
                      <div className="border-t border-gray-700 p-4 space-y-4 bg-gray-900/30">
                        <div className="space-y-3">
                          <div>
                            <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1.5 block">
                              Pubkey
                            </label>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 min-w-0 h-9 text-sm font-mono font-medium bg-gray-800 border border-gray-700 rounded px-3 flex items-center text-gray-50 tracking-wide">
                                <span className="truncate" title={pubkeyBase58}>{pubkeyBase58}</span>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopy(pubkeyBase58, `pubkey-${originalIndex}`);
                                }}
                                className="h-9 px-2.5"
                                title="Copy pubkey"
                              >
                                {copiedField === `pubkey-${originalIndex}` ? (
                                  <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
                                ) : (
                                  <Copy className="h-3.5 w-3.5 text-gray-400" />
                                )}
                              </Button>
                            </div>
                          </div>

                          {historicalKey.note && (
                            <div>
                              <label className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1.5 block">
                                Note
                              </label>
                              <p className="text-xs text-gray-200 bg-gray-800/50 border border-gray-700 rounded px-2.5 py-2">
                                {historicalKey.note}
                              </p>
                            </div>
                          )}

                          <div className="flex items-center gap-2 pt-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRestore(originalIndex);
                              }}
                              className="h-8 text-xs border-gray-600 text-gray-700 hover:bg-gray-700 hover:text-gray-200"
                            >
                              <RotateCcw className="h-3.5 w-3.5 mr-1.5" />
                              Restore
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleExport(historicalKey.account);
                              }}
                              className="h-8 text-xs border-gray-600 text-gray-700 hover:bg-gray-700 hover:text-gray-200"
                            >
                              <FileText className="h-3.5 w-3.5 mr-1.5" />
                              Export JSON
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDelete(originalIndex);
                              }}
                              className="h-8 text-xs border-red-600 text-red-400 hover:bg-red-900/20"
                            >
                              <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                              Delete
                            </Button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={onClose}
            className="border-gray-600 text-gray-700 hover:bg-gray-700 hover:text-gray-200"
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default HistoricalKeysModal;
