import React, { useState } from 'react';
import { Button } from './ui/button';
import { Plus, BookOpen, MessageSquare, Github, Clock, Package, Rocket, FileText, Loader2 } from 'lucide-react';
import { Project } from '../types';
import { cn } from '@/lib/utils';

interface HomeScreenProps {
  recentProjects: Project[];
  onNewProject: () => void;
  onSelectProject: (project: Project) => void;
  onLoadExample: (exampleName: string) => Promise<void>;
}

// Example projects from https://github.com/Arch-Network/arch-examples/tree/main/examples
const EXAMPLE_PROJECTS = [
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

const QUICK_LINKS = [
  {
    title: 'Documentation',
    description: 'Learn about Arch Network',
    icon: BookOpen,
    href: 'https://docs.arch.network',
    color: 'text-gray-300'
  },
  {
    title: 'Join Discord',
    description: 'Get help from the community',
    icon: MessageSquare,
    href: 'https://discord.gg/archnetwork',
    color: 'text-gray-300'
  },
  {
    title: 'GitHub',
    description: 'View examples & contribute',
    icon: Github,
    href: 'https://github.com/Arch-Network/arch-examples',
    color: 'text-gray-400'
  }
];

const getDifficultyColor = (difficulty: string) => {
  switch (difficulty) {
    case 'Beginner':
      return 'bg-green-500/20 text-green-400 border-green-500/30';
    case 'Intermediate':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
    case 'Advanced':
      return 'bg-red-500/20 text-red-400 border-red-500/30';
    default:
      return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  }
};

export const HomeScreen: React.FC<HomeScreenProps> = ({
  recentProjects,
  onNewProject,
  onSelectProject,
  onLoadExample
}) => {
  const [loadingExample, setLoadingExample] = useState<string | null>(null);

  const handleLoadExample = async (exampleName: string) => {
    setLoadingExample(exampleName);
    try {
      await onLoadExample(exampleName);
    } finally {
      setLoadingExample(null);
    }
  };

  return (
    <div className="h-full overflow-auto bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      <div className="max-w-7xl mx-auto p-4 sm:p-8 space-y-12">
        {/* Hero Section */}
        <div className="text-center space-y-6 py-12">
          <div className="flex items-center justify-center gap-4">
            <img src="/images/logo.svg" alt="Arch Network" className="h-16 w-auto" />
          </div>
          <h1 className="text-5xl font-bold bg-gradient-to-r from-[#F7931A] via-orange-400 to-yellow-500 bg-clip-text text-transparent">
            Arch Network IDE
          </h1>
          <p className="text-xl text-gray-400 max-w-2xl mx-auto">
            Build Bitcoin-native programs with Rust + eBPF. Learn. Explore. Create.
          </p>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3 sm:gap-4 pt-4 px-2 sm:px-0">
            <Button
              size="lg"
              onClick={onNewProject}
              className="w-full sm:w-auto bg-[#F7931A] hover:bg-[#E8870E] text-gray-900 font-bold shadow-lg hover:shadow-xl transition-all"
            >
              <Plus className="mr-2 h-5 w-5" />
              Create New Project
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => window.open('https://docs.arch.network', '_blank')}
              className="w-full sm:w-auto bg-gray-900/30 border-gray-600 text-white hover:text-white hover:bg-gray-800/60 hover:border-[#F7931A] font-semibold"
            >
              <BookOpen className="mr-2 h-5 w-5" />
              Documentation
            </Button>
          </div>
        </div>

        {/* Recent Projects */}
        {recentProjects.length > 0 && (
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-gray-400" />
              <h2 className="text-2xl font-semibold text-white">Recent Projects</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {recentProjects.slice(0, 6).map((project) => (
                <button
                  key={project.id}
                  onClick={() => onSelectProject(project)}
                  className="group relative bg-gray-800/50 backdrop-blur border border-gray-700 rounded-lg p-6 hover:border-[#F7931A] transition-all duration-200 text-left"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <Package className="h-8 w-8 text-[#F7931A]" />
                      <span className="text-xs text-gray-500">
                        {new Date(project.lastModified).toLocaleDateString()}
                      </span>
                    </div>
                    <div>
                      <h3 className="font-semibold text-white group-hover:text-[#F7931A] transition-colors">
                        {project.name}
                      </h3>
                      {project.description && (
                        <p className="text-sm text-gray-400 mt-1 line-clamp-2">
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
            <Rocket className="h-5 w-5 text-gray-400" />
            <h2 className="text-2xl font-semibold text-white">Example Projects</h2>
            <span className="text-sm text-gray-500 ml-2">
              From Arch Network Examples
            </span>
          </div>
          <p className="text-gray-400">
            Start with a working example and learn by building. All examples come with documented code and client integration.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {EXAMPLE_PROJECTS.map((example) => (
              <div
                key={example.name}
                className="group relative bg-gray-800/50 backdrop-blur border border-gray-700 rounded-lg p-6 hover:border-[#F7931A] transition-all duration-200"
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between">
                    <div className="text-4xl">{example.icon}</div>
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
                    <h3 className="font-semibold text-white text-lg">
                      {example.title}
                    </h3>
                    <p className="text-sm text-gray-400 mt-2">
                      {example.description}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {example.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs px-2 py-1 bg-gray-700/50 text-gray-300 rounded"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                  <Button
                    onClick={() => handleLoadExample(example.name)}
                    disabled={loadingExample !== null}
                    className="w-full bg-gray-700 hover:bg-[#F7931A] text-white transition-colors"
                  >
                    {loadingExample === example.name ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      'Load Example'
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Quick Links */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-gray-400" />
            <h2 className="text-2xl font-semibold text-white">Resources</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {QUICK_LINKS.map((link) => (
              <a
                key={link.title}
                href={link.href}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative bg-gray-800/50 backdrop-blur border border-gray-700 rounded-lg p-6 hover:border-[#F7931A] transition-all duration-200"
              >
                <div className="flex items-start gap-4">
                  <link.icon className={cn('h-8 w-8', link.color)} />
                  <div>
                    <h3 className="font-semibold text-white group-hover:text-[#F7931A] transition-colors">
                      {link.title}
                    </h3>
                    <p className="text-sm text-gray-400 mt-1">
                      {link.description}
                    </p>
                  </div>
                </div>
              </a>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="text-center text-gray-500 text-sm py-8 border-t border-gray-800">
          <p>Built with ❤️ by the Arch Network community</p>
          <p className="mt-2">
            <a href="https://github.com/Arch-Network" target="_blank" rel="noopener noreferrer" className="hover:text-[#F7931A] transition-colors">
              View on GitHub
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
};

export default HomeScreen;
