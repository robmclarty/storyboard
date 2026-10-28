import { readFileSync } from 'node:fs';

/** Where the CLI writes: stdout for what was asked for, stderr for usage problems and errors. */
export type Io = {
  readonly stdout: (text: string) => void;
  readonly stderr: (text: string) => void;
};

const USAGE = `Usage:
  storyboard --help | --version
`;

const HELP = `storyboard interviews a person broad to narrow, then drafts the intent, spec, design and
map the rest of the toolchain builds from.

The interview isn't built yet. Its commands arrive with the first build; the layout they'll
fill is in docs/architecture.md.

${USAGE}
Exit codes:
  0  success
  2  a usage problem, or an unexpected error
`;

/** The package's version, if package.json has one. It sits one level above both src/ and dist/. */
const version = (): string | undefined => {
  const pkg: unknown = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  return typeof pkg === 'object' && pkg !== null && 'version' in pkg && typeof pkg.version === 'string'
    ? pkg.version
    : undefined;
};

/**
 * Runs one command line and returns its exit code. It never exits the process itself, so the
 * bin, a test or another host can each decide what to do with the code.
 */
export const run = (argv: readonly string[], io: Io): number => {
  if (argv.length === 0 || argv[0] === 'help' || argv.includes('--help') || argv.includes('-h')) {
    io.stdout(HELP);
    return 0;
  }
  if (argv.includes('--version')) {
    const found = version();
    if (found === undefined) {
      io.stderr('storyboard: package.json has no version\n');
      return 2;
    }
    io.stdout(`${found}\n`);
    return 0;
  }
  io.stderr(`storyboard: unknown argument "${argv[0] ?? ''}"\n\n${USAGE}`);
  return 2;
};
