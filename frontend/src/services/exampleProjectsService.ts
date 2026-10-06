import { v4 as uuidv4 } from 'uuid';
import type { FileNode, Project, ProjectFramework } from '../types';
import { projectService } from './projectService';
import { DICE_GAME_LIB_RS, DICE_GAME_SETUP_TS, DICE_GAME_CLIENT_TS } from './diceGameInline';
import { SATELLITE_EXAMPLES, isSatelliteAvailable } from './satelliteExamples';

// Pinned to a commit because arch-examples `main` is an auto-synced mirror
// whose layout changes without notice. EXAMPLE_STRUCTURES must match the tree
// at this commit; bump both together.
const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/Arch-Network/arch-examples/a14e69b57a19c74a479a1020890fd8f43ceb258c/examples';

// Known file structure for each example (no API needed!)
const EXAMPLE_STRUCTURES: Record<string, { src: string[], client?: string[], srcPath?: string }> = {
  'clock': {
    src: ['lib.rs'],
    srcPath: 'program/src'
  },
  'create-new-account': {
    src: ['lib.rs'],
    srcPath: 'program/src'
  },
  'dice-game': {
    src: ['lib.rs'],
    client: ['setup.ts', 'client.ts'],
    srcPath: 'program/src'
  },
  'escrow': {
    src: ['lib.rs'],
    srcPath: 'program/src'
  },
  'helloworld': {
    src: ['lib.rs'],
    srcPath: 'program/src'
  },
  'oracle': {
    src: ['lib.rs'],
    srcPath: 'program/src'
  },
  'secp256k1_signature': {
    src: ['lib.rs'],
    srcPath: 'program/src'
  },
  'stake': {
    src: ['lib.rs'],
    srcPath: 'program/src'
  },
  'test-sol-log-data': {
    src: ['lib.rs'],
    srcPath: 'program/src'
  },
  'vote': {
    src: ['lib.rs', 'shared_validator_state.rs', 'utils.rs', 'whitelist.rs'],
    srcPath: 'src'
  }
};

// ── Inline example sources ─────────────────────────────────
// Imported from separate files for maintainability.

const INLINE_EXAMPLES: Record<string, Record<string, string>> = {
  'dice-game': {
    'lib.rs': DICE_GAME_LIB_RS,
    'setup.ts': DICE_GAME_SETUP_TS,
    'client.ts': DICE_GAME_CLIENT_TS,
  },
};

/**
 * Fetches file content directly from raw GitHub URL (no API needed!)
 */
async function fetchRawFileContent(exampleName: string, filePath: string): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${GITHUB_RAW_BASE}/${exampleName}/${filePath}`);
  } catch (error) {
    throw new Error(`Failed to fetch ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) {
    throw new Error(`Failed to fetch ${filePath}: ${response.status} ${response.statusText}`);
  }
  return response.text();
}

/**
 * Builds the source file tree.
 *
 * For native projects: checks inline examples first, then falls back to
 * fetching from the arch-examples GitHub repo.
 *
 * For satellite projects: pulls exclusively from the inline
 * `SATELLITE_EXAMPLES` registry — there's no upstream satellite mirror
 * of arch-examples, so an example with no inline satellite source is
 * treated as not-supported (the UI prevents this combination).
 */
async function buildSourceFiles(
  exampleName: string,
  framework: ProjectFramework,
): Promise<FileNode[]> {
  if (framework === 'satellite') {
    const satellite = SATELLITE_EXAMPLES[exampleName];
    if (!satellite) {
      throw new Error(`No satellite version available for "${exampleName}"`);
    }
    return Object.entries(satellite.src).map(([name, content]) => ({
      name,
      type: 'file',
      content,
      path: name,
    }));
  }

  const structure = EXAMPLE_STRUCTURES[exampleName];
  if (!structure) {
    throw new Error(`Unknown example: ${exampleName}`);
  }

  const fileNodes: FileNode[] = [];
  const srcPath = structure.srcPath || 'program/src';
  const inlineSrc = INLINE_EXAMPLES[exampleName];

  for (const fileName of structure.src) {
    try {
      const content = inlineSrc?.[fileName]
        ?? await fetchRawFileContent(exampleName, `${srcPath}/${fileName}`);
      fileNodes.push({
        name: fileName,
        type: 'file',
        content,
        path: fileName
      });
    } catch (error) {
      console.error(`Failed to fetch ${fileName}:`, error);
      throw error;
    }
  }

  return fileNodes;
}

function getExampleDescription(exampleName: string): string {
  const descriptions: Record<string, string> = {
    'clock': 'Demonstrates time-based operations and block height tracking.',
    'counter': 'A simple counter program demonstrating state management on Arch Network.',
    'create-new-account': 'Learn how to create and initialize new accounts on Arch Network.',
    'dice-game': 'A Satoshi Dice-style BTC game with deposits, dice rolls, and withdrawals using UTXOs.',
    'escrow': 'Implement secure escrow patterns for conditional transfers.',
    'helloworld': 'The classic first program - perfect for getting started with Arch.',
    'oracle': 'Build decentralized oracle solutions for external data feeds.',
    'secp256k1_signature': 'Learn secp256k1 signature verification on Arch Network.',
    'stake': 'Implement staking mechanisms and reward distribution.',
    'test-sol-log-data': 'Test and debug logging functionality in Arch programs.',
    'vote': 'Build voting and governance mechanisms with multi-file structure.'
  };

  return descriptions[exampleName] || `Example project: ${exampleName}`;
}

/**
 * Fetches client files.
 *
 * Native: checks inline examples first, then falls back to GitHub.
 * Satellite: returns inline-only client files for the requested example.
 */
async function buildClientFiles(
  exampleName: string,
  framework: ProjectFramework,
): Promise<FileNode[]> {
  if (framework === 'satellite') {
    const satellite = SATELLITE_EXAMPLES[exampleName];
    if (!satellite) return [];
    return Object.entries(satellite.client).map(([name, content]) => ({
      name,
      type: 'file',
      content,
      path: name,
    }));
  }

  const structure = EXAMPLE_STRUCTURES[exampleName];
  if (!structure || !structure.client) {
    console.log(`✓ No client files defined for ${exampleName}`);
    return [];
  }

  const clientFiles: FileNode[] = [];
  const inlineSrc = INLINE_EXAMPLES[exampleName];

  for (const fileName of structure.client) {
    try {
      const content = inlineSrc?.[fileName]
        ?? await fetchRawFileContent(exampleName, `app/${fileName}`);
      clientFiles.push({
        name: fileName,
        type: 'file',
        content,
        path: fileName
      });
    } catch (error) {
      console.warn(`Failed to fetch client file ${fileName}:`, error);
    }
  }

  console.log(`✓ Loaded ${clientFiles.length} client files for ${exampleName}`);
  return clientFiles;
}

async function generateUniqueProjectName(baseName: string): Promise<string> {
  const existingProjects = await projectService.getAllProjects();
  const existingNames = new Set(existingProjects.map(p => p.name));

  if (!existingNames.has(baseName)) {
    return baseName;
  }

  let counter = 1;
  let newName = `${baseName} (${counter})`;
  while (existingNames.has(newName)) {
    counter++;
    newName = `${baseName} (${counter})`;
  }

  return newName;
}

export async function loadExampleProject(
  exampleName: string,
  framework: ProjectFramework = 'native',
): Promise<Project> {
  console.log(`📦 Loading example project: ${exampleName} (${framework})`);

  if (framework === 'satellite' && !isSatelliteAvailable(exampleName)) {
    throw new Error(
      `"${exampleName}" doesn't have a satellite version yet — only native is available.`,
    );
  }

  try {
    // Suffix the project name with the framework so loading the same
    // example in both flavors yields two distinct, easy-to-distinguish
    // projects in the sidebar (rather than `counter` and `counter (1)`).
    const baseName =
      framework === 'satellite' ? `${exampleName}-satellite` : exampleName;
    const uniqueName = await generateUniqueProjectName(baseName);
    if (uniqueName !== baseName) {
      console.log(`📝 Project name already exists, using: ${uniqueName}`);
    }

    const srcFiles = await buildSourceFiles(exampleName, framework);
    console.log(`✓ Loaded ${srcFiles.length} source files`);

    const clientFiles = await buildClientFiles(exampleName, framework);

    const files: FileNode[] = [
      {
        name: 'src',
        type: 'directory',
        children: srcFiles,
        path: 'src'
      },
      {
        name: 'client',
        type: 'directory',
        children: clientFiles,
        path: 'client'
      }
    ];

    const project: Project = {
      id: uuidv4(),
      name: uniqueName,
      description: getExampleDescription(exampleName),
      // Critical: the build server uses `framework` to pick the right
      // Cargo.toml template (arch-satellite-lang vs. plain arch_program).
      framework,
      files,
      created: new Date(),
      lastModified: new Date()
    };

    await projectService.saveProject(project);

    console.log(`✅ Successfully loaded ${uniqueName}!`);
    return project;
  } catch (error) {
    console.error(`❌ Failed to load example project ${exampleName}:`, error);
    throw new Error(`Failed to load example project: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function listExampleProjects(): Promise<string[]> {
  return Object.keys(EXAMPLE_STRUCTURES);
}

/**
 * Frameworks an example can be loaded as: `'native'` when it has a native
 * source in EXAMPLE_STRUCTURES, `'satellite'` when an inline satellite
 * source exists.
 */
export function frameworksFor(exampleName: string): ProjectFramework[] {
  const frameworks: ProjectFramework[] = [];
  if (exampleName in EXAMPLE_STRUCTURES) frameworks.push('native');
  if (isSatelliteAvailable(exampleName)) frameworks.push('satellite');
  return frameworks;
}

export const exampleProjectsService = {
  loadExampleProject,
  listExampleProjects
};
