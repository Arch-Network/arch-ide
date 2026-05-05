import React from 'react';
import { Sun, Moon, MonitorCog } from 'lucide-react';
import { Button } from './ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuLabel,
} from './ui/dropdown-menu';
import { useTheme, type Theme } from '../hooks/useTheme';

/**
 * Theme picker dropdown for the top bar.
 *
 * The trigger reflects the *resolved* theme (so the icon flips with
 * the OS when in `'system'` mode), while the menu lets users opt out
 * of automatic following. We could've shipped a simple two-state
 * toggle, but offering `'system'` as a first-class option matches
 * platform conventions and avoids surprising users whose OS theme
 * shifts during the day.
 */
export const ThemeToggle: React.FC = () => {
  const { theme, resolvedTheme, setTheme } = useTheme();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent"
          aria-label={`Theme: ${theme === 'system' ? `system (${resolvedTheme})` : theme}`}
        >
          {resolvedTheme === 'dark' ? (
            <Moon className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Sun className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel className="text-[10px] uppercase tracking-wider">
          Theme
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={theme}
          onValueChange={(v) => setTheme(v as Theme)}
        >
          <DropdownMenuRadioItem value="light" className="text-xs gap-2">
            <Sun className="h-3.5 w-3.5" aria-hidden="true" />
            Light
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="dark" className="text-xs gap-2">
            <Moon className="h-3.5 w-3.5" aria-hidden="true" />
            Dark
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="system" className="text-xs gap-2">
            <MonitorCog className="h-3.5 w-3.5" aria-hidden="true" />
            System
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ThemeToggle;
