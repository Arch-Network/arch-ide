import React from 'react';
import { Switch } from '../../ui/switch';
import { Input } from '../../ui/input';
import { Button } from '../../ui/button';
import { SettingRow, SettingGroup } from '../SettingRow';
import {
  type EditorPreferences,
  DEFAULT_EDITOR_PREFS,
} from '../../../hooks/useEditorPreferences';

interface EditorSectionProps {
  prefs: EditorPreferences;
  onUpdate: <K extends keyof EditorPreferences>(key: K, value: EditorPreferences[K]) => void;
  onReset: () => void;
}

const FONT_SIZE_MIN = 10;
const FONT_SIZE_MAX = 24;
const TAB_SIZE_OPTIONS = [2, 4, 8] as const;

/**
 * Editor preferences. Sliders are intentionally avoided in favor of
 * stepper buttons + numeric inputs because the iframe-friendly design
 * needs to work without pointer drags on touch surfaces.
 */
export const EditorSection: React.FC<EditorSectionProps> = ({ prefs, onUpdate, onReset }) => {
  const adjustFontSize = (delta: number) => {
    const next = Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, prefs.fontSize + delta));
    onUpdate('fontSize', next);
  };

  const handleFontSizeInput = (raw: string) => {
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed)) return;
    onUpdate(
      'fontSize',
      Math.min(FONT_SIZE_MAX, Math.max(FONT_SIZE_MIN, parsed)),
    );
  };

  return (
    <div>
      <SettingGroup title="Typography" description="Affects only the code editor.">
        <SettingRow
          label="Font size"
          description={`Between ${FONT_SIZE_MIN}px and ${FONT_SIZE_MAX}px.`}
          htmlFor="editor-font-size"
        >
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => adjustFontSize(-1)}
              disabled={prefs.fontSize <= FONT_SIZE_MIN}
              aria-label="Decrease font size"
            >
              −
            </Button>
            <Input
              id="editor-font-size"
              type="number"
              min={FONT_SIZE_MIN}
              max={FONT_SIZE_MAX}
              value={prefs.fontSize}
              onChange={(e) => handleFontSizeInput(e.target.value)}
              className="h-8 w-16 text-center text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => adjustFontSize(1)}
              disabled={prefs.fontSize >= FONT_SIZE_MAX}
              aria-label="Increase font size"
            >
              +
            </Button>
          </div>
        </SettingRow>

        <SettingRow
          label="Font ligatures"
          description="Combine sequences like => and != into a single glyph."
          htmlFor="editor-ligatures"
        >
          <Switch
            id="editor-ligatures"
            checked={prefs.fontLigatures}
            onCheckedChange={(v) => onUpdate('fontLigatures', v)}
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="Layout" description="Wrapping, gutter, and visual aids.">
        <SettingRow
          label="Word wrap"
          description="Wrap long lines instead of horizontal scrolling."
          htmlFor="editor-word-wrap"
        >
          <Switch
            id="editor-word-wrap"
            checked={prefs.wordWrap}
            onCheckedChange={(v) => onUpdate('wordWrap', v)}
          />
        </SettingRow>

        <SettingRow
          label="Minimap"
          description="Show a code minimap on the right edge of the editor."
          htmlFor="editor-minimap"
        >
          <Switch
            id="editor-minimap"
            checked={prefs.minimap}
            onCheckedChange={(v) => onUpdate('minimap', v)}
          />
        </SettingRow>

        <SettingRow
          label="Smooth caret animation"
          description="Animate cursor movement with easing."
          htmlFor="editor-smooth-caret"
        >
          <Switch
            id="editor-smooth-caret"
            checked={prefs.smoothCaret}
            onCheckedChange={(v) => onUpdate('smoothCaret', v)}
          />
        </SettingRow>

        <SettingRow
          label="Tab size"
          description="Number of spaces a Tab character represents."
        >
          <div className="flex items-center gap-1">
            {TAB_SIZE_OPTIONS.map((size) => (
              <Button
                key={size}
                type="button"
                variant={prefs.tabSize === size ? 'default' : 'outline'}
                size="sm"
                className="h-8 w-10 p-0 text-xs"
                onClick={() => onUpdate('tabSize', size)}
                aria-pressed={prefs.tabSize === size}
              >
                {size}
              </Button>
            ))}
          </div>
        </SettingRow>
      </SettingGroup>

      <div className="flex justify-end pt-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onReset}
          className="text-xs text-muted-foreground hover:text-foreground"
          disabled={JSON.stringify(prefs) === JSON.stringify(DEFAULT_EDITOR_PREFS)}
        >
          Reset to defaults
        </Button>
      </div>
    </div>
  );
};

export default EditorSection;
