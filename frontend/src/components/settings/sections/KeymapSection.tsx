import React from 'react';
import { SettingGroup } from '../SettingRow';

interface Shortcut {
  label: string;
  description?: string;
  combo: string[];
}

const detectMac = () =>
  typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

const buildShortcuts = (isMac: boolean): { group: string; items: Shortcut[] }[] => {
  const cmd = isMac ? '⌘' : 'Ctrl';
  return [
    {
      group: 'Workbench',
      items: [
        { label: 'Open command palette', combo: [cmd, 'K'] },
        { label: 'Build program', combo: [cmd, 'B'] },
        { label: 'Save current file', combo: [cmd, 'S'] },
      ],
    },
    {
      group: 'Editor',
      items: [
        { label: 'Find in current file', combo: [cmd, 'F'] },
        { label: 'Replace in current file', combo: [cmd, isMac ? '⌥' : 'Alt', 'F'] },
        { label: 'Go to line', combo: [cmd, 'G'] },
        { label: 'Format document', combo: [isMac ? '⇧⌥' : 'Shift+Alt', 'F'] },
      ],
    },
  ];
};

export const KeymapSection: React.FC = () => {
  const groups = buildShortcuts(detectMac());

  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground -mt-1">
        Custom key bindings are coming soon. Today these match Monaco's defaults plus the
        Arch IDE workbench commands.
      </p>
      {groups.map(({ group, items }) => (
        <SettingGroup key={group} title={group}>
          <ul className="divide-y divide-border/40" role="list">
            {items.map((item) => (
              <li
                key={item.label}
                className="flex items-center justify-between py-2.5 text-sm"
              >
                <span className="text-foreground/90">{item.label}</span>
                <span className="flex items-center gap-1 font-mono text-[11px]">
                  {item.combo.map((key, i) => (
                    <React.Fragment key={`${item.label}-${key}-${i}`}>
                      <kbd className="px-1.5 py-0.5 rounded bg-surface-2 border border-border text-foreground/80">
                        {key}
                      </kbd>
                      {i < item.combo.length - 1 && (
                        <span className="text-muted-foreground/60">+</span>
                      )}
                    </React.Fragment>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </SettingGroup>
      ))}
    </div>
  );
};

export default KeymapSection;
