import React, { useCallback, useEffect, useState, useRef } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { FileNode, Disposable } from '../types';
import { declareGlobalTypes } from './Editor/languages/typescript/declarations/global';
import { COMMENT, H_ORANGE, H_YELLOW, H_PURPLE, H_BLUE, ARCH_DARK, ARCH_GRAY, TEXT_PRIMARY } from '../theme/theme';
import { MonacoFileSystem } from '../services/MonacoFileSystem';
import * as monaco from 'monaco-editor';
import { editor as monacoEditor } from 'monaco-editor';
import { isHomeTab } from '../utils/homeTab';
import { HomeScreen } from './HomeScreen';

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

const findFileInProject = (files: any[], path: string): FileNode | null => {
  for (const file of files) {
    if (file.path === path) return file;
    if (file.children) {
      const found = findFileInProject(file.children, path);
      if (found) return found;
    }
  }
  return null;
};

const defineTheme = (monaco: any) => {
  monaco.editor.defineTheme('arch-theme', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: COMMENT.substring(1), fontStyle: 'italic' },
      { token: 'keyword', foreground: H_ORANGE.substring(1) },
      { token: 'string', foreground: H_YELLOW.substring(1) },
      { token: 'number', foreground: H_PURPLE.substring(1) },
      { token: 'type', foreground: H_BLUE.substring(1) },
    ],
    colors: {
      'editor.background': ARCH_DARK,
      'editor.foreground': TEXT_PRIMARY,
      'editor.lineHighlightBackground': ARCH_GRAY,
      'editorLineNumber.foreground': COMMENT,
      'editorGutter.background': ARCH_DARK,
    }
  });
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
  isWordWrapEnabled = true
}: EditorProps) => {
  const [editorContent, setEditorContent] = useState<string>(code || '');
  const isWelcomeScreen = !currentFile;
  const isHomeTabActive = currentFile ? isHomeTab(currentFile) : false;
  const displayCode = isWelcomeScreen ? DEFAULT_WELCOME_MESSAGE : decodeBase64Content(code);
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoFsRef = useRef<MonacoFileSystem | null>(null);
  const [disposables, setDisposables] = useState<Disposable[]>([]);

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
        theme="arch-theme"
        key={currentFile?.path || 'welcome'}
        value={displayCode}
        onChange={handleChange}
        beforeMount={(monaco) => {
          defineTheme(monaco);
        }}
        onMount={async (editor, monaco) => {
          editorRef.current = editor;
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
          // Current options
          minimap: { enabled: false },
          // iOS Safari auto-zooms focused editable areas when font-size < 16px.
          // Use a larger editor font on small screens to prevent viewport zoom getting "stuck".
          fontSize: typeof window !== 'undefined' && window.matchMedia?.('(max-width: 767px)').matches ? 16 : 12,
          scrollBeyondLastLine: false,
          lineNumbers: 'on',
          renderWhitespace: 'selection',
          tabSize: 2,
          readOnly: isWelcomeScreen,

          // New options
          automaticLayout: true,
          bracketPairColorization: { enabled: true },
          wordWrap: isWordWrapEnabled ? 'on' : 'off',
          formatOnPaste: true,
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
          suggestSelection: 'first'
        }}
      />
    </div>
  );
};

export default Editor;