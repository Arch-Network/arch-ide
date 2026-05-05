import React, { useCallback, useEffect, useState, useRef } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { FileNode, Disposable } from '../types';
import { declareGlobalTypes } from './Editor/languages/typescript/declarations/global';
import {
  COMMENT,
  H_ORANGE,
  H_YELLOW,
  H_PURPLE,
  H_BLUE,
  H_GREEN,
  SURFACE_1,
  SURFACE_2,
  TEXT_PRIMARY,
  TEXT_SECONDARY,
} from '../theme/theme';
import { MonacoFileSystem } from '../services/MonacoFileSystem';
import * as monaco from 'monaco-editor';
import { editor as monacoEditor } from 'monaco-editor';
import { isHomeTab } from '../utils/homeTab';
import { HomeScreen } from './HomeScreen';
import { useTheme } from '../hooks/useTheme';

interface EditorProps {
  code: string;
  onChange: (value: string | undefined) => void;
  onSave?: (value: string) => void;
  currentFile?: FileNode | null;
  currentProject?: any;
  onSelectFile: (file: FileNode) => void;
  // Props for HomeScreen
  recentProjects?: any[];
  onNewProject?: () => void;
  onSelectProject?: (project: any) => void;
  onLoadExample?: (exampleName: string) => Promise<void>;
  isWordWrapEnabled?: boolean;
  /** When provided, overrides Monaco's font size preference. */
  fontSize?: number;
  fontLigatures?: boolean;
  minimap?: boolean;
  smoothCaret?: boolean;
  tabSize?: number;
}


const DEFAULT_WELCOME_MESSAGE = `
/*
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *                    🏗️  ARCH NETWORK PLAYGROUND
 *
 *            Build Bitcoin-native programs with Rust + eBPF
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */

// 🚀 QUICK START
// ─────────────────────────────────────────────────────────────────────────
//
// 1. CREATE A PROJECT
//    Click the "+" button in the top navigation to get started
//
// 2. EXPLORE THE TEMPLATE
//    • src/lib.rs       → Your Rust program code
//    • client/client.ts → Example client interaction code
//
// 3. BUILD & DEPLOY
//    • Open the Build panel (🔨) in the left sidebar
//    • Click "Build" to compile your program
//    • Configure network settings (testnet/devnet)
//    • Generate program & authority keypairs
//    • Deploy to Arch Network
//
// 4. TEST YOUR PROGRAM
//    • Open client/client.ts to see example usage
//    • Modify the client code to interact with your program
//    • Run and test your transactions


// ⚡ KEYBOARD SHORTCUTS
// ─────────────────────────────────────────────────────────────────────────
//
// Cmd/Ctrl + S     →  Save current file
// Cmd/Ctrl + B     →  Build program
// Cmd/Ctrl + W     →  Close current tab


// 📚 LEARN MORE
// ─────────────────────────────────────────────────────────────────────────
//
// Documentation   →  https://docs.arch.network
// Discord         →  Join our community for support
// Examples        →  Check out the template programs
// GitHub          →  https://github.com/Arch-Network


// 💡 TIPS
// ─────────────────────────────────────────────────────────────────────────
//
// • Use the Explorer (📁) to navigate between files
// • The Build panel shows build status and deployment info
// • Connect your Bitcoin wallet (Unisat/Xverse) for seamless transactions
// • Use testnet for development, devnet for local testing
// • Check the Output panel below for build logs and errors


/*
 * ═══════════════════════════════════════════════════════════════════════════
 *
 *                    Ready to build? Create your first project!
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */
`;

// Helper function to decode base64 content (with UTF-8 support)
const decodeBase64Content = (content: string): string => {
  // Check if the content starts with 'data:text/plain;base64,'
  const base64Prefix = 'data:text/plain;base64,';
  if (content && typeof content === 'string' && content.startsWith(base64Prefix)) {
    try {
      // Remove the prefix and decode
      const base64Content = content.slice(base64Prefix.length);
      const decoded = atob(base64Content);

      // Convert from Latin1 bytes to UTF-8 string
      try {
        const utf8Bytes = new Uint8Array(decoded.split('').map(c => c.charCodeAt(0)));
        return new TextDecoder().decode(utf8Bytes);
      } catch (e) {
        // Fallback: try legacy decoding
        return decodeURIComponent(escape(decoded));
      }
    } catch (e) {
      console.error('Failed to decode base64 content:', e);
      return content;
    }
  }
  return content;
};

// Strip the leading `#` so Monaco gets bare-hex strings ("F7931A" not "#F7931A").
const hex = (color: string) => color.replace(/^#/, '');

/**
 * Light-mode syntax palette
 * -------------------------
 * Tuned for WCAG AA against a near-white background. We keep the brand
 * orange for keywords (matches the rest of the IDE's accent), but
 * shift every other hue darker than its dark-mode counterpart so it
 * actually reads on white.
 */
const LIGHT = {
  bg: '#FFFFFF',
  bgAlt: '#F4F4F5',
  bgRaised: '#FAFAFA',
  fg: '#18181B', // near-black, slightly warm
  fgMuted: '#52525B',
  comment: '#71717A',
  keyword: '#CC6A00',     // darker orange (passes contrast on white)
  control: '#7C3AED',     // purple
  string: '#B45309',      // amber-700
  number: '#7C3AED',
  type: '#0369A1',        // sky-700
  fn: '#15803D',          // green-700
  border: '#E4E4E7',
  borderActive: '#D4D4D8',
  selection: '#F7931A33',
  selectionInactive: '#F7931A1A',
  cursor: '#CC6A00',
};

interface MonacoPalette {
  bg: string;
  bgAlt: string;
  bgRaised: string;
  fg: string;
  fgMuted: string;
  comment: string;
  keyword: string;
  control: string;
  string: string;
  number: string;
  type: string;
  fn: string;
  border: string;
  borderActive: string;
  selection: string;
  selectionInactive: string;
  cursor: string;
}

const DARK: MonacoPalette = {
  bg: SURFACE_1,
  bgAlt: SURFACE_2,
  bgRaised: SURFACE_2,
  fg: TEXT_PRIMARY,
  fgMuted: TEXT_SECONDARY,
  comment: COMMENT,
  keyword: H_ORANGE,
  control: H_PURPLE,
  string: H_YELLOW,
  number: H_PURPLE,
  type: H_BLUE,
  fn: H_GREEN,
  border: '#2a2a2a',
  borderActive: '#3a3a3a',
  selection: '#F7931A33',
  selectionInactive: '#F7931A1A',
  cursor: H_ORANGE,
};

const buildArchTheme = (
  p: MonacoPalette,
  base: 'vs' | 'vs-dark',
): monaco.editor.IStandaloneThemeData => ({
  base,
  inherit: true,
  rules: [
    // Comments
    { token: 'comment', foreground: hex(p.comment), fontStyle: 'italic' },
    { token: 'comment.line', foreground: hex(p.comment), fontStyle: 'italic' },
    { token: 'comment.block', foreground: hex(p.comment), fontStyle: 'italic' },
    { token: 'comment.doc', foreground: hex(p.comment), fontStyle: 'italic' },

    // Keywords
    { token: 'keyword', foreground: hex(p.keyword) },
    { token: 'keyword.control', foreground: hex(p.control) },
    { token: 'keyword.operator', foreground: hex(p.control) },
    { token: 'keyword.directive', foreground: hex(p.type) },
    { token: 'storage', foreground: hex(p.keyword) },
    { token: 'storage.type', foreground: hex(p.keyword) },
    { token: 'storage.modifier', foreground: hex(p.keyword) },

    // Strings & literals
    { token: 'string', foreground: hex(p.string) },
    { token: 'string.quoted', foreground: hex(p.string) },
    { token: 'string.escape', foreground: hex(p.control) },
    { token: 'string.regexp', foreground: hex(p.string) },
    { token: 'number', foreground: hex(p.number) },
    { token: 'number.float', foreground: hex(p.number) },
    { token: 'number.hex', foreground: hex(p.number) },
    { token: 'constant', foreground: hex(p.number) },
    { token: 'constant.language', foreground: hex(p.number) },
    { token: 'constant.numeric', foreground: hex(p.number) },

    // Types & namespaces
    { token: 'type', foreground: hex(p.type) },
    { token: 'type.identifier', foreground: hex(p.type) },
    { token: 'entity.name.type', foreground: hex(p.type) },
    { token: 'entity.name.namespace', foreground: hex(p.type) },
    { token: 'namespace', foreground: hex(p.type) },

    // Functions / methods / macros
    { token: 'function', foreground: hex(p.fn) },
    { token: 'entity.name.function', foreground: hex(p.fn) },
    { token: 'support.function', foreground: hex(p.fn) },
    { token: 'meta.function-call', foreground: hex(p.fn) },

    // Variables / params / identifiers
    { token: 'variable', foreground: hex(p.fg) },
    { token: 'variable.parameter', foreground: hex(p.fg) },
    { token: 'identifier', foreground: hex(p.fg) },

    // Attributes
    { token: 'attribute', foreground: hex(p.type) },
    { token: 'attribute.name', foreground: hex(p.type) },
    { token: 'meta.attribute', foreground: hex(p.type) },
    { token: 'metatag', foreground: hex(p.type) },

    // Operators / delimiters
    { token: 'operator', foreground: hex(p.control) },
    { token: 'delimiter', foreground: hex(p.fgMuted) },
    { token: 'delimiter.bracket', foreground: hex(p.fg) },
    { token: 'delimiter.parenthesis', foreground: hex(p.fg) },
  ],
  colors: {
    'editor.background': p.bg,
    'editor.foreground': p.fg,
    'editor.lineHighlightBackground': p.bgAlt,
    'editor.selectionBackground': p.selection,
    'editor.inactiveSelectionBackground': p.selectionInactive,
    'editor.findMatchBackground': '#F7931A55',
    'editor.findMatchHighlightBackground': '#F7931A22',
    'editorLineNumber.foreground': p.comment,
    'editorLineNumber.activeForeground': p.fgMuted,
    'editorGutter.background': p.bg,
    'editorIndentGuide.background': p.border,
    'editorIndentGuide.activeBackground': p.borderActive,
    'editorBracketMatch.background': '#F7931A33',
    'editorBracketMatch.border': '#F7931A',
    'editorCursor.foreground': p.cursor,
    'editorWidget.background': p.bgRaised,
    'editorWidget.border': p.border,
    'editorSuggestWidget.background': p.bgRaised,
    'editorSuggestWidget.border': p.border,
    'editorSuggestWidget.selectedBackground': '#F7931A1A',
  },
});

const defineTheme = (monacoNs: typeof monaco) => {
  monacoNs.editor.defineTheme('arch-theme', buildArchTheme(DARK, 'vs-dark'));
  monacoNs.editor.defineTheme(
    'arch-theme-light',
    buildArchTheme(LIGHT, 'vs'),
  );
};

const Editor = ({
  code,
  onChange,
  onSave,
  currentFile,
  currentProject,
  onSelectFile,
  recentProjects = [],
  onNewProject,
  onSelectProject,
  onLoadExample,
  isWordWrapEnabled = true,
  fontSize,
  fontLigatures = true,
  minimap = false,
  smoothCaret = true,
  tabSize = 2,
}: EditorProps) => {
  const [editorContent, setEditorContent] = useState<string>(code || '');
  const isWelcomeScreen = !currentFile;
  const isHomeTabActive = currentFile ? isHomeTab(currentFile) : false;
  const displayCode = isWelcomeScreen ? DEFAULT_WELCOME_MESSAGE : decodeBase64Content(code);
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoFsRef = useRef<MonacoFileSystem | null>(null);
  const [disposables, setDisposables] = useState<Disposable[]>([]);
  const { resolvedTheme } = useTheme();
  const monacoTheme =
    resolvedTheme === 'light' ? 'arch-theme-light' : 'arch-theme';

  // The Monaco namespace passed into `beforeMount` / `onMount` is the
  // *actual* instance the editor uses. Importing `monaco-editor` at
  // the top of this file may resolve to a separate module copy in
  // some bundler setups — calling `setTheme` on the wrong instance
  // silently no-ops, which is exactly what was happening when
  // toggling the theme without a refresh. We capture it on mount and
  // drive theme changes through this ref instead.
  const monacoRef = useRef<typeof monaco | null>(null);

  // Re-apply theme imperatively whenever the user toggles. Monaco's
  // `setTheme` is global, so calling it on the captured namespace
  // updates every model instantly — no editor remount required.
  useEffect(() => {
    const mn = monacoRef.current;
    if (!mn) return;
    mn.editor.setTheme(monacoTheme);
  }, [monacoTheme]);

  const getLanguage = (fileName: string) => {
    if (fileName.endsWith('.ts')) return 'typescript';
    if (fileName.endsWith('.js')) return 'javascript';
    if (fileName.endsWith('.rs')) return 'rust';
    return 'plaintext';
  };

  // Decode content when it changes
  useEffect(() => {
    if (code) {
      const decodedContent = decodeBase64Content(code);
      setEditorContent(decodedContent);
    }
  }, [code]);

  useEffect(() => {
    return () => {
      disposables.forEach(d => d.dispose());
    };
  }, [disposables]);

  // Note: Tab restoration is now handled in App.tsx to avoid conflicts
  // and ensure proper state management with the parent component

  // Initialize Monaco file system
  useEffect(() => {
    if (!monacoFsRef.current) {
      monacoFsRef.current = new MonacoFileSystem();
    }
  }, []);

  // Register project files when they change
  useEffect(() => {
    if (currentProject?.files && monacoFsRef.current) {
      currentProject.files.forEach((file: { content: string; name: string; }) => {
        if (file.content) {
          const decodedContent = decodeBase64Content(file.content);
          monacoFsRef.current?.registerFile(file.name, decodedContent);
        }
      });
    }
  }, [currentProject?.files]);

  const handleChange = useCallback((value: string | undefined) => {
    if (!isWelcomeScreen && value !== undefined) {
      setEditorContent(value);
      onChange(value);
    }
  }, [isWelcomeScreen, onChange]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    try {
      console.group('Editor KeyDown');
      console.log('Event:', {
        key: e?.key,
        keyCode: e?.keyCode,
        code: e?.code,
        ctrlKey: e?.ctrlKey,
        metaKey: e?.metaKey,
        type: e?.type,
        isWelcomeScreen,
        hasEditor: !!editorRef.current,
        hasSaveHandler: !!onSave
      });

      // Handle save shortcut (Ctrl+S or Cmd+S)
      const isSaveCommand = (e?.ctrlKey || e?.metaKey) && (e?.key === 's' || e?.code === 'KeyS');
      if (isSaveCommand) {
        console.log('Save shortcut detected');

        // Prevent default browser behavior
        e?.preventDefault();
        e?.stopPropagation();

        // Save the file if we're not on welcome screen
        if (!isWelcomeScreen && onSave && editorRef.current) {
          console.log('Saving file...');
          const currentValue = editorRef.current.getValue();
          onSave(currentValue);
        } else {
          console.log('Cannot save:', {
            isWelcomeScreen,
            hasOnSave: !!onSave,
            hasEditor: !!editorRef.current
          });
        }
      }
    } catch (error) {
      console.error('Error in handleKeyDown:', error);
    } finally {
      console.groupEnd();
    }
  }, [onSave, isWelcomeScreen]);

  // Render HomeScreen if Home tab is active
  if (isHomeTabActive && onNewProject && onSelectProject && onLoadExample) {
    return (
      <div className="h-full w-full">
        <HomeScreen
          recentProjects={recentProjects}
          onNewProject={onNewProject}
          onSelectProject={onSelectProject}
          onLoadExample={onLoadExample}
        />
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <MonacoEditor
        height="100%"
        language={getLanguage(currentFile?.name || '')}
        // defaultLanguage="plaintext"
        theme={monacoTheme}
        key={currentFile?.path || 'welcome'}
        value={displayCode}
        onChange={handleChange}
        beforeMount={(monaco) => {
          monacoRef.current = monaco;
          defineTheme(monaco);
          // Apply the current theme immediately. The user may have
          // toggled themes during a previous editor lifecycle (or
          // before this component mounted) and our `useEffect` no-ops
          // until `monacoRef` is populated.
          monaco.editor.setTheme(monacoTheme);
        }}
        onMount={async (editor, monaco) => {
          editorRef.current = editor;
          monacoRef.current = monaco;
          editor.onKeyDown((e) => {
            const keyboardEvent = e as unknown as KeyboardEvent;
            handleKeyDown(keyboardEvent);
          });

          const language = getLanguage(currentFile?.name || '');
          console.log('Initial language:', language);

          if (currentFile && monacoFsRef.current) {
            // Ensure the current file is registered with decoded content
            const decodedContent = currentFile.content ? decodeBase64Content(currentFile.content) : '';
            monacoFsRef.current.registerFile(
              currentFile.name,
              decodedContent
            );

            // Create model with proper URI and decoded content
            const uri = monaco.Uri.parse(`file:///${currentFile.name}`);
            let model = monaco.editor.getModel(uri);

            if (!model) {
              model = monaco.editor.createModel(
                decodedContent,
                undefined,
                uri
              );
            } else {
              // Update existing model with decoded content
              model.setValue(decodedContent);
            }

            editor.setModel(model);
          }

          // Rest of your code remains the same...
          const editorModel = editor.getModel();
          if (editorModel) {
            // Log the final model details
            console.log('Final model details:', {
              languageId: editorModel.getLanguageId(),
              uri: editorModel.uri.toString(),
              modelId: editorModel.id
            });
          }

          // Initialize appropriate language support based on file type
          switch (language) {
            case 'typescript':
              console.log('Initializing TypeScript declarations');
              const { initDeclarations: initTsDeclarations } = await import('./Editor/languages/typescript/declarations');
              console.log('Editor:', editor);
              const tsDisposable = await initTsDeclarations(editor);
              console.log('TypeScript Disposable:', tsDisposable);
              setDisposables(prev => [...prev, tsDisposable]);
              // All compiler options, SDK globals, and playground utilities are set in initDeclarations
              break;
            case 'javascript':
              // const { initDeclarations: initJsDeclarations } = await import('./Editor/languages/javascript/declarations');
              // const jsDisposable = await initJsDeclarations();
              // console.log('JavaScript Disposable:', jsDisposable);
              // setDisposables(prev => [...prev, jsDisposable]);
              break;
            case 'rust':
              const { initRustLanguage } = await import('./Editor/Monaco/languages/rust/init');
              await initRustLanguage(monaco, editor);
              break;
          }
        }}
        options={{
          minimap: { enabled: minimap },
          // iOS Safari auto-zooms focused editable areas when font-size < 16px.
          // On small screens we floor the font at 16px to prevent viewport zoom getting "stuck".
          fontSize:
            typeof window !== 'undefined' && window.matchMedia?.('(max-width: 767px)').matches
              ? Math.max(16, fontSize ?? 13)
              : (fontSize ?? 13),
          fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
          fontLigatures,
          letterSpacing: 0.2,
          lineHeight: 1.55,
          scrollBeyondLastLine: false,
          lineNumbers: 'on',
          renderWhitespace: 'selection',
          renderLineHighlight: 'line',
          tabSize,
          readOnly: isWelcomeScreen,
          automaticLayout: true,
          bracketPairColorization: { enabled: true },
          wordWrap: isWordWrapEnabled ? 'on' : 'off',
          formatOnPaste: true,
          smoothScrolling: true,
          cursorBlinking: smoothCaret ? 'smooth' : 'blink',
          cursorSmoothCaretAnimation: smoothCaret ? 'on' : 'off',
          hover: {
            enabled: true,
            delay: 300,
            sticky: true
          },
          folding: true,
          foldingStrategy: 'indentation',
          guides: {
            indentation: true,
            bracketPairs: true
          },
          quickSuggestions: {
            other: true,
            comments: true,
            strings: true
          },
          suggestSelection: 'first',
          padding: { top: 12, bottom: 12 }
        }}
      />
    </div>
  );
};

export default Editor;