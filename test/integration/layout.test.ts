import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

// The map in docs/architecture.md is held by two tools: fallow.toml's zones (the rings) and
// rules/ (the doors). Both match on paths, which a rule fixture can't see, and a zone with a
// mistyped pattern passes exactly like a correct one while src/ is nearly empty. So each tool
// scans a real tree here, built from the repo's own config, and every file must raise exactly
// the findings listed beside it.

const REPO = fileURLToPath(new URL('../../', import.meta.url));
const BIN = join(REPO, 'node_modules', '.bin');

/** A file to write, its contents, and exactly the findings that must fire on it. */
type Case = readonly [path: string, body: string, expected: readonly string[]];

/** Writes `cases` into a new temp directory beside copies of `config`, and returns the directory. */
const buildTree = (prefix: string, config: readonly string[], cases: readonly Case[]): string => {
  const root = mkdtempSync(join(tmpdir(), prefix));
  for (const name of config) {
    cpSync(join(REPO, name), join(root, name), { recursive: true });
  }
  for (const [path, body] of cases) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), body);
  }
  return root;
};

/** Runs a scanner that exits 1 on findings, and returns its JSON report; anything else throws. */
const scan = (command: string, args: readonly string[], cwd: string): unknown => {
  const run = spawnSync(join(BIN, command), args, { cwd, encoding: 'utf8' });
  if (run.error !== undefined || !/^\s*[[{]/.test(run.stdout)) {
    throw new Error(`${command} did not report: ${run.stderr || String(run.error)}`);
  }
  return JSON.parse(run.stdout);
};

/** Groups `[file, finding]` pairs by file, each file's findings sorted and without repeats. */
const byFile = (pairs: ReadonlyArray<readonly [string, string]>): Map<string, string[]> => {
  const found = new Map<string, Set<string>>();
  for (const [file, finding] of pairs) {
    found.set(file, (found.get(file) ?? new Set()).add(finding));
  }
  return new Map([...found].map(([file, set]) => [file, [...set].toSorted()]));
};

/** A module with one export and no imports. */
const leaf = (name: string): string => `export const ${name} = (): string => '${name}';\n`;

describe('the rings: fallow.toml zones, scanned on a real tree', () => {
  const CASES: readonly Case[] = [
    // A module may be a file or a folder; both forms land in their zone.
    ['src/place.ts', leaf('place'), []],
    ['src/scheduler/next.ts', "import { place } from '../place.js';\nexport const next = place;\n", []],
    ['src/scheduler/index.ts', "export { next } from './next.js';\n", []],
    // An edge imports the core, and nothing else.
    ['src/store/save.ts', "import { next } from '../scheduler/index.js';\nexport const save = next;\n", []],
    ['src/store/index.ts', "export { save } from './save.js';\n", []],
    ['src/models/call.ts', "import { save } from '../store/index.js';\nexport const call = save;\n", ['import:store']],
    ['src/models/index.ts', "export { call } from './call.js';\n", []],
    // The core imports no edge, and calls nothing impure.
    ['src/turn.ts', "import { call } from './models/index.js';\nexport const turn = call;\n", ['import:models']],
    [
      'src/emit/write.ts',
      "import { writeFileSync } from 'node:fs';\nexport const write = (): void => writeFileSync('a', 'b');\n",
      ['call:writeFileSync'],
    ],
    ['src/brief/clock.ts', 'export const now = (): number => Date.now();\n', ['call:Date.now']],
    // Wiring and shells may reach inward to every ring.
    [
      'src/flow.ts',
      "import { call } from './models/index.js';\nimport { save } from './store/index.js';\nexport const flow = [call, save];\n",
      [],
    ],
    ['src/acp/serve.ts', "import { flow } from '../flow.js';\nexport const serve = flow;\n", []],
    // Off the map. The map is of src/, so the bin and the root's tool configs are outside it.
    ['src/stray.ts', leaf('stray'), ['coverage']],
    ['bin/storyboard.js', leaf('bin'), []],
    ['vitest.config.ts', leaf('config'), []],
    // A core module's own tests are in the tests zone, not the core, so they may import any
    // module and read a fixture.
    [
      'src/brief/__tests__/clock.test.ts',
      "import { readFileSync } from 'node:fs';\nimport { save } from '../../store/index.js';\nexport const probe = [save, readFileSync('brief.md')];\n",
      [],
    ],
  ];

  // The entry imports every case, so each one is reachable and analyzed.
  const ENTRY: Case = [
    'src/index.ts',
    CASES.filter(([path]) => path.startsWith('src/') && !path.includes('__tests__'))
      .map(([path]) => `import '${path.replace(/^src/, '.').replace(/\.ts$/, '.js')}';\n`)
      .join(''),
    [],
  ];

  let root = '';
  let fired = new Map<string, string[]>();

  beforeAll(() => {
    root = buildTree('storyboard-rings-', ['fallow.toml', 'package.json', 'tsconfig.json', 'tsconfig.base.json'], [
      ...CASES,
      ENTRY,
    ]);
    const report = scan('fallow', ['dead-code', '--boundary-violations', '--root', root, '--format', 'json'], root) as {
      boundary_violations: ReadonlyArray<{ from_path: string; to_zone: string }>;
      boundary_call_violations: ReadonlyArray<{ path: string; callee: string }>;
      boundary_coverage_violations: ReadonlyArray<{ path: string }>;
    };
    fired = byFile([
      ...report.boundary_violations.map((v) => [v.from_path, `import:${v.to_zone}`] as const),
      ...report.boundary_call_violations.map((v) => [v.path, `call:${v.callee}`] as const),
      ...report.boundary_coverage_violations.map((v) => [v.path, 'coverage'] as const),
    ]);
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test.each([...CASES, ENTRY])('%s', (path, _body, expected) => {
    expect(fired.get(path) ?? []).toEqual(expected.toSorted());
  });
});

describe('the doors: rules/, scanned on a real tree', () => {
  const WRITE = "import { writeFileSync } from 'node:fs';\nwriteFileSync('a', 'b');\n";
  const SPAWN = "import { spawnSync } from 'node:child_process';\nspawnSync('keyframes', ['check']);\n";
  const MODEL = "import { model_step } from 'fascicle';\nexport const ask = model_step;\n";

  const CASES: readonly Case[] = [
    ['src/store.ts', WRITE, []],
    ['src/store/write.ts', WRITE, []],
    ['src/emit/write.ts', WRITE, ['writes-only-in-store']],
    ['src/keyframes.ts', SPAWN, []],
    ['src/keyframes/check.ts', SPAWN, []],
    ['src/repo/log.ts', SPAWN, ['subprocess-only-in-keyframes']],
    ['src/models.ts', MODEL, []],
    ['src/models/engine.ts', MODEL, []],
    ['src/flow/interview.ts', MODEL, ['model-calls-only-in-models']],
    // Tests may set up whatever they need.
    ['src/emit/__tests__/write.test.ts', `${WRITE}${SPAWN}${MODEL}`, []],
  ];

  let root = '';
  let fired = new Map<string, string[]>();

  beforeAll(() => {
    root = buildTree('storyboard-doors-', ['sgconfig.yml', 'rules'], CASES);
    const findings = scan('ast-grep', ['scan', '--json=compact'], root) as ReadonlyArray<{
      ruleId: string;
      file: string;
    }>;
    fired = byFile(findings.map(({ file, ruleId }) => [file, ruleId] as const));
  });

  afterAll(() => {
    rmSync(root, { recursive: true, force: true });
  });

  test.each(CASES)('%s', (path, _body, expected) => {
    expect(fired.get(path) ?? []).toEqual(expected.toSorted());
  });
});
