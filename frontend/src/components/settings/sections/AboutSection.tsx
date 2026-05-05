import React from 'react';
import { ExternalLink } from 'lucide-react';
import { SettingGroup } from '../SettingRow';

const APP_VERSION =
  // Vite's `import.meta.env` is the standard place for build-time globals; we
  // tolerate undefined for local dev and SSR previews.
  (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_APP_VERSION ??
  'dev';

const LINKS: { label: string; href: string; description: string }[] = [
  {
    label: 'Documentation',
    href: 'https://docs.arch.network',
    description: 'Building Bitcoin-native programs with Arch.',
  },
  {
    label: 'GitHub',
    href: 'https://github.com/Arch-Network/arch-network',
    description: 'Source code, issues, and discussions.',
  },
  {
    label: 'Changelog',
    href: 'https://github.com/Arch-Network/arch-ide/releases',
    description: "What's new in the IDE.",
  },
];

export const AboutSection: React.FC = () => {
  return (
    <div>
      <SettingGroup title="Arch IDE">
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <span className="text-muted-foreground">Version</span>
          <span className="font-mono text-foreground/90">{APP_VERSION}</span>
          <span className="text-muted-foreground">Platform</span>
          <span className="text-foreground/90">Browser-only</span>
          <span className="text-muted-foreground">License</span>
          <span className="text-foreground/90">MIT</span>
        </div>
      </SettingGroup>

      <SettingGroup title="Resources">
        <ul className="divide-y divide-border/40" role="list">
          {LINKS.map((link) => (
            <li key={link.href}>
              <a
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between py-2.5 hover:bg-accent/30 rounded-md -mx-2 px-2 transition-colors group"
              >
                <span>
                  <span className="block text-sm text-foreground/90 group-hover:text-foreground">
                    {link.label}
                  </span>
                  <span className="block text-[11px] text-muted-foreground">
                    {link.description}
                  </span>
                </span>
                <ExternalLink
                  className="h-3.5 w-3.5 text-muted-foreground/70 group-hover:text-foreground"
                  aria-hidden="true"
                />
              </a>
            </li>
          ))}
        </ul>
      </SettingGroup>
    </div>
  );
};

export default AboutSection;
