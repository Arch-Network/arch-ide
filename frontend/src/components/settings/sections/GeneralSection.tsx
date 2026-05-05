import React from 'react';
import { Trash2, AlertTriangle } from 'lucide-react';
import { Button } from '../../ui/button';
import { SettingGroup, SettingRow } from '../SettingRow';

interface GeneralSectionProps {
  onClearAllProjects?: () => void;
}

/**
 * General preferences and data-management actions. Most of the autosave-style
 * UX is implicit (we save on debounce after every keystroke), but this is the
 * natural place to expose dangerous data actions like "Clear all projects".
 */
export const GeneralSection: React.FC<GeneralSectionProps> = ({ onClearAllProjects }) => {
  return (
    <div>
      <SettingGroup title="Workspace">
        <SettingRow
          label="Autosave"
          description="Edits are saved automatically a few hundred milliseconds after you stop typing."
        >
          <span className="text-[11px] font-medium uppercase tracking-wider text-success">
            Always on
          </span>
        </SettingRow>
        <SettingRow
          label="Storage"
          description="Projects, build artifacts, and keypairs live in your browser's IndexedDB / localStorage."
        >
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Local
          </span>
        </SettingRow>
      </SettingGroup>

      {onClearAllProjects && (
        <SettingGroup
          title="Danger zone"
          description="Irreversible actions that affect every project on this device."
        >
          <SettingRow
            label="Delete all projects"
            description="Wipes every project, build artifact, and stored keypair from this browser."
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs border-danger/40 text-danger hover:bg-danger/10 hover:text-danger"
              onClick={onClearAllProjects}
            >
              <Trash2 className="mr-1.5 h-3 w-3" aria-hidden="true" />
              Clear all
            </Button>
          </SettingRow>
          <div className="flex items-start gap-2 mt-2 text-[11px] text-warning bg-warning/10 border border-warning/30 rounded-md px-2.5 py-1.5">
            <AlertTriangle className="h-3 w-3 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <span>
              This cannot be undone. Export important projects before clearing.
            </span>
          </div>
        </SettingGroup>
      )}
    </div>
  );
};

export default GeneralSection;
