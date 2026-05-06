import React, { useState } from 'react';
import { Button } from './ui/button';
import { Plus, BookOpen, MessageSquare, Github, Clock, Package, Rocket, FileText, Loader2 } from 'lucide-react';
import { Project, ProjectFramework } from '../types';
import { cn } from '@/lib/utils';
import { Logo } from './Logo';
import { frameworksFor } from '../services/satelliteExamples';

interface HomeScreenProps {
  recentProjects: Project[];
  onNewProject: () => void;
  onSelectProject: (project: Project) => void;
  onLoadExample: (exampleName: string, framework: ProjectFramework) => Promise<void>;
}

interface ExampleProject {
  name: string;
  title: string;
  description: string;
  icon: string;
  difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
  tags: string[];
}

// Example projects from https://github.com/Arch-Network/arch-examples/tree/main/examples.
// Whether a given example can be loaded as Satellite is decided by
// `frameworksFor(name)` (which checks the inline satellite registry),
// so this list intentionally stays framework-agnostic.
const EXAMPLE_PROJECTS: ExampleProject[] = [
  {
    name: 'helloworld',
    title: 'Hello World',
    description: 'The classic first program - perfect for getting started with Arch.',
    icon: '👋',
    difficulty: 'Beginner',
    tags: ['Tutorial', 'Basic']
  },
  {
    name: 'counter',
    title: 'Counter Program',
    description: 'A simple counter program demonstrating state management on Arch Network.',
    icon: '🔢',
    difficulty: 'Beginner',
    tags: ['State', 'Basic']
  },
  {
    name: 'clock',
    title: 'Clock Program',
    description: 'Demonstrates time-based operations and block height tracking.',
    icon: '⏰',
    difficulty: 'Beginner',
    tags: ['Time', 'Blocks']
  },
  {
    name: 'create-new-account',
    title: 'Create New Account',
    description: 'Learn how to create and initialize new accounts on Arch Network.',
    icon: '👤',
    difficulty: 'Intermediate',
    tags: ['Accounts', 'Setup']
  },
  {
    name: 'dice-game',
    title: 'Bitcoin Dice Game',
    description: 'A provably fair dice game that manages BTC deposits, bets, and withdrawals using UTXOs.',
    icon: '🎲',
    difficulty: 'Intermediate',
    tags: ['Bitcoin', 'UTXO', 'Gaming']
  },
  {
    name: 'escrow',
    title: 'Escrow Program',
    description: 'Implement secure escrow patterns for conditional transfers.',
    icon: '🔒',
    difficulty: 'Intermediate',
    tags: ['Security', 'Transfers']
  },
  {
    name: 'secp256k1_signature',
    title: 'Secp256k1 Signature',
    description: 'Learn secp256k1 signature verification on Arch Network.',
    icon: '✍️',
    difficulty: 'Intermediate',
    tags: ['Crypto', 'Security']
  },
  {
    name: 'oracle',
    title: 'Oracle Program',
    description: 'Build decentralized oracle solutions for external data feeds.',
    icon: '🔮',
    difficulty: 'Advanced',
    tags: ['Oracles', 'Data']
  },
  {
    name: 'stake',
    title: 'Staking Program',
    description: 'Implement staking mechanisms and reward distribution.',
    icon: '💰',
    difficulty: 'Advanced',
    tags: ['DeFi', 'Staking']
  },
  {
    name: 'vote',
    title: 'Voting Program',
    description: 'Build voting and governance mechanisms with multi-file structure.',
    icon: '🗳️',
    difficulty: 'Advanced',
    tags: ['Governance', 'Complex']
  },
  {
    name: 'test-sol-log-data',
    title: 'Logging Test',
    description: 'Test and debug logging functionality in Arch programs.',
    icon: '📝',
    difficulty: 'Beginner',
    tags: ['Testing', 'Debug']
  }
];

const FRAMEWORK_META: Record<ProjectFramework, { label: string; emoji: string }> = {
  native: { label: 'Native', emoji: '🦀' },
  satellite: { label: 'Satellite', emoji: '🛰️' },
};

const QUICK_LINKS = [
  {
    title: 'Documentation',
    description: 'Learn about Arch Network',
    icon: BookOpen,
    href: 'https://docs.arch.network',
    color: 'text-foreground/80'
  },
  {
    title: 'Join Discord',
    description: 'Get help from the community',
    icon: MessageSquare,
    href: 'https://discord.gg/archnetwork',
    color: 'text-foreground/80'
  },
  {
    title: 'GitHub',
    description: 'View examples & contribute',
    icon: Github,
    href: 'https://github.com/Arch-Network/arch-examples',
    color: 'text-muted-foreground'
  }
];

const getDifficultyColor = (difficulty: string) => {
  switch (difficulty) {
    case 'Beginner':
      return 'bg-success/20 text-success border-success/30';
    case 'Intermediate':
      return 'bg-warning/20 text-warning border-warning/30';
    case 'Advanced':
      return 'bg-danger/20 text-danger border-danger/30';
    default:
      return 'bg-muted/20 text-muted-foreground border-muted/30';
  }
};

interface ExampleCardProps {
  example: ExampleProject;
  /** Globally-loading example key in the form `<name>:<framework>`, or null. */
  loadingKey: string | null;
  onLoad: (exampleName: string, framework: ProjectFramework) => Promise<void>;
}

const ExampleCard: React.FC<ExampleCardProps> = ({ example, loadingKey, onLoad }) => {
  const available = frameworksFor(example.name);
  const [framework, setFramework] = useState<ProjectFramework>(available[0]);

  const isLoading = loadingKey === `${example.name}:${framework}`;
  const isAnyLoading = loadingKey !== null;
  const hasMultipleFrameworks = available.length > 1;

  return (
    <div className="group relative bg-surface-2/50 backdrop-blur border border-border rounded-lg p-6 hover:border-brand transition-all duration-200">
      <div className="space-y-4">
        <div className="flex items-start justify-between">
          <div className="text-4xl" aria-hidden="true">{example.icon}</div>
          <span
            className={cn(
              'text-xs px-2 py-1 rounded-full border font-medium',
              getDifficultyColor(example.difficulty)
            )}
          >
            {example.difficulty}
          </span>
        </div>

        <div>
          <h3 className="font-semibold text-foreground text-lg">
            {example.title}
          </h3>
          <p className="text-sm text-muted-foreground mt-2">
            {example.description}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {example.tags.map((tag) => (
            <span
              key={tag}
              className="text-xs px-2 py-1 bg-accent text-foreground/80 rounded"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Framework selector / badge.
            - Two frameworks  → segmented toggle (user picks).
            - One framework   → static badge (informational). */}
        {hasMultipleFrameworks ? (
          <div
            role="radiogroup"
            aria-label="Select framework"
            className="grid grid-cols-2 gap-1 p-1 bg-surface-3 rounded-md"
          >
            {available.map((fw) => {
              const meta = FRAMEWORK_META[fw];
              const selected = framework === fw;
              return (
                <button
                  key={fw}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  disabled={isAnyLoading}
                  onClick={() => setFramework(fw)}
                  className={cn(
                    'text-xs font-medium px-2 py-1.5 rounded transition-colors',
                    selected
                      ? 'bg-brand text-brand-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  )}
                >
                  <span className="mr-1" aria-hidden="true">{meta.emoji}</span>
                  {meta.label}
                </button>
              );
            })}
          </div>
        ) : (
          <div
            className="inline-flex items-center gap-1.5 text-xs px-2 py-1 rounded-md border border-border bg-surface-3 text-muted-foreground"
            title={`Only available as ${FRAMEWORK_META[available[0]].label}`}
          >
            <span aria-hidden="true">{FRAMEWORK_META[available[0]].emoji}</span>
            {FRAMEWORK_META[available[0]].label} only
          </div>
        )}

        <Button
          onClick={() => onLoad(example.name, framework)}
          disabled={isAnyLoading}
          className="w-full bg-surface-3 hover:bg-brand hover:text-brand-foreground text-foreground transition-colors"
        >
          {isLoading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              Loading...
            </>
          ) : (
            <>
              Load as <span className="ml-1">{FRAMEWORK_META[framework].emoji}</span>
              <span className="ml-1">{FRAMEWORK_META[framework].label}</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
};

export const HomeScreen: React.FC<HomeScreenProps> = ({
  recentProjects,
  onNewProject,
  onSelectProject,
  onLoadExample
}) => {
  // Track loading by `<name>:<framework>` so two cards in different states
  // don't fight over a single loading flag (e.g. one shows spinner, the
  // other stays clickable for a different framework choice).
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

  const handleLoadExample = async (exampleName: string, framework: ProjectFramework) => {
    setLoadingKey(`${exampleName}:${framework}`);
    try {
      await onLoadExample(exampleName, framework);
    } finally {
      setLoadingKey(null);
    }
  };

  return (
    <div className="h-full overflow-auto bg-gradient-to-br from-background via-surface-1 to-background">
      <div className="max-w-7xl mx-auto p-4 sm:p-8 space-y-12">
        {/* Hero Section */}
        <div className="text-center space-y-6 py-12">
          <div className="flex items-center justify-center gap-4">
            <Logo className="h-16 w-auto text-foreground" />
          </div>
          <h1 className="text-5xl font-bold bg-gradient-to-r from-brand via-orange-400 to-yellow-500 bg-clip-text text-transparent">
            Arch Network IDE
          </h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Build Bitcoin-native programs with Rust + eBPF. Learn. Explore. Create.
          </p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-4 pt-4 px-2 sm:px-0">
            <Button
              size="lg"
              onClick={onNewProject}
              className="w-full sm:w-auto bg-brand hover:bg-brand-hover text-brand-foreground font-bold shadow-lg hover:shadow-xl transition-all"
            >
              <Plus className="mr-2 h-5 w-5" aria-hidden="true" />
              Create New Project
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => window.open('https://docs.arch.network', '_blank')}
              className="w-full sm:w-auto bg-background/30 border-border text-foreground hover:text-foreground hover:bg-surface-2/60 hover:border-brand font-semibold"
            >
              <BookOpen className="mr-2 h-5 w-5" aria-hidden="true" />
              Documentation
            </Button>
          </div>
        </div>

        {/* Recent Projects */}
        {recentProjects.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              <h2 className="text-2xl font-semibold text-foreground">Recent Projects</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recentProjects.slice(0, 6).map((project) => (
                <button
                  key={project.id}
                  onClick={() => onSelectProject(project)}
                  className="group relative bg-surface-2/50 backdrop-blur border border-border rounded-lg p-6 hover:border-brand transition-all duration-200 text-left"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <Package className="h-8 w-8 text-brand" aria-hidden="true" />
                      <span className="text-xs text-muted-foreground">
                        {new Date(project.lastModified).toLocaleDateString()}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground group-hover:text-brand transition-colors">
                        {project.name}
                      </h3>
                      {project.description && (
                        <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          {project.description}
                        </p>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* Example Projects */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Rocket className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-2xl font-semibold text-foreground">Example Projects</h2>
            <span className="text-sm text-muted-foreground ml-2">
              From Arch Network Examples
            </span>
          </div>
          <p className="text-muted-foreground">
            Start with a working example and learn by building. Each example can be loaded as
            <span className="mx-1 font-medium text-foreground">🦀 Native</span>
            (pure <code className="text-xs">arch_program</code>) or
            <span className="mx-1 font-medium text-foreground">🛰️ Satellite</span>
            (Anchor-style macros), where a satellite version is available.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {EXAMPLE_PROJECTS.map((example) => (
              <ExampleCard
                key={example.name}
                example={example}
                loadingKey={loadingKey}
                onLoad={handleLoadExample}
              />
            ))}
          </div>
        </section>

        {/* Quick Links */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <h2 className="text-2xl font-semibold text-foreground">Resources</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {QUICK_LINKS.map((link) => (
              <a
                key={link.title}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative bg-surface-2/50 backdrop-blur border border-border rounded-lg p-6 hover:border-brand transition-all duration-200"
              >
                <div className="flex items-start gap-4">
                  <link.icon className={cn('h-8 w-8', link.color)} aria-hidden="true" />
                  <div>
                    <h3 className="font-semibold text-foreground group-hover:text-brand transition-colors">
                      {link.title}
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      {link.description}
                    </p>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center text-muted-foreground text-sm py-8 border-t border-border">
          <p>Built with love by the Arch Network community</p>
          <p className="mt-2">
            <a href="https://github.com/Arch-Network" target="_blank" rel="noopener noreferrer" className="hover:text-brand transition-colors">
              View on GitHub
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
};

export default HomeScreen;
