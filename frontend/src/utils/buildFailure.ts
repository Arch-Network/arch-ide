/**
 * Attribute a failed build to the user's code or to the build server.
 *
 * Only reliable signals count. The build server generates Cargo.toml and
 * picks every dependency, so dependency resolution, download, and toolchain
 * failures can never come from the user's program. A failure is attributed to
 * the user's code only when rustc reports an error located in the program's
 * own `src/` files. Anything else is "unclassified".
 */

export type BuildFailureKind = 'user-code' | 'infrastructure' | 'unclassified';

export interface BuildFailure {
  kind: BuildFailureKind;
  summary: string;
}

const INFRASTRUCTURE_SIGNALS: { pattern: RegExp; reason: string }[] = [
  {
    pattern: /feature `edition2024` is required|is not stabilized in this version of Cargo|requires rustc [\d.]+ or newer/,
    reason: "a dependency needs a newer Rust toolchain than the build server has",
  },
  {
    pattern: /failed to select a version for|failed to download `|unable to get packages from source|failed to load source for dependency|spurious network error|Couldn't resolve host/,
    reason: 'the build server could not resolve or download its dependencies',
  },
  {
    pattern: /toolchain '[^']+' is not installed|no such command: `build-sbf`|cargo-build-sbf: (command )?not found|linker `[^`]+` not found/,
    reason: "the build server's Rust toolchain is missing a component",
  },
  {
    pattern: /^Build failed: Build timed out after \d+s/m,
    reason: "the build exceeded the build server's time limit",
  },
  {
    pattern: /^Build failed: .*\(os error \d+\)/m,
    reason: 'the build server hit a system error',
  },
];

const MAX_LISTED_ERRORS = 5;

export function classifyBuildFailure(log: string): BuildFailure {
  const lines = log.split(/\r?\n/);

  for (const { pattern, reason } of INFRASTRUCTURE_SIGNALS) {
    const evidence = lines.find((line) => pattern.test(line));
    if (evidence) {
      return {
        kind: 'infrastructure',
        summary: [
          `Build failed on the build server, not in your code: ${reason}.`,
          `Server reported: ${evidence.trim()}`,
          'Changing your program will not fix this. Try again later, and report it to the Arch IDE maintainers if it keeps happening.',
        ].join('\n'),
      };
    }
  }

  const codeErrors = findErrorsInUserSource(lines);
  if (codeErrors.length > 0) {
    const listed = codeErrors.slice(0, MAX_LISTED_ERRORS).map(({ location, message }) => `  ${location}  ${message}`);
    if (codeErrors.length > MAX_LISTED_ERRORS) listed.push(`  …and ${codeErrors.length - MAX_LISTED_ERRORS} more`);
    return {
      kind: 'user-code',
      summary: [
        `Build failed: ${codeErrors.length} error${codeErrors.length === 1 ? '' : 's'} in your program code.`,
        ...listed,
        'Fix the code at these locations and build again.',
      ].join('\n'),
    };
  }

  return {
    kind: 'unclassified',
    summary: 'Build failed (unclassified): the log does not match a known code error or build-server problem. Read the full log below.',
  };
}

/** rustc errors whose primary location (`--> src/...`) is in the program's own crate. */
function findErrorsInUserSource(lines: string[]): { message: string; location: string }[] {
  const errors: { message: string; location: string }[] = [];
  let pendingError: string | null = null;
  for (const line of lines) {
    const header = line.match(/^(error(?:\[E\d+\])?): (.*)$/);
    if (header) {
      pendingError = `${header[1]}: ${header[2]}`;
      continue;
    }
    if (line.startsWith('warning')) {
      pendingError = null;
      continue;
    }
    const location = line.match(/^\s*--> (src\/\S+)$/);
    if (location && pendingError) {
      errors.push({ message: pendingError, location: location[1] });
      pendingError = null;
    }
  }
  return errors;
}
