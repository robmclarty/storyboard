import { constants } from 'node:fs';
import { appendFile, copyFile, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { readLog, renderBrief, writeEntry, type Brief, type Entry, type Read } from './brief/index.js';

// The store, the only module that writes files. During an interview it writes only inside the
// session's folder, `.storyboard/<slug>/` in the project: the answers log, `brief.md` and the
// staged draft. Accepting is the one write outside it, a copy of the staged draft to the project's
// `keyframes.md` that never lands over one already there (C4 (write-on-accept)).

/** The plan's file name, staged and accepted alike. */
const PLAN = 'keyframes.md';

/** A session's files on disk. Every call writes only the paths it names, and creates the folder it needs. */
export type Store = {
  /** The answers log's entries, in order, or none before the session's first write. It writes nothing. */
  readonly load: () => Promise<Read<readonly Entry[]>>;
  /** Adds one entry to the end of the log, leaving every line before it as it was (D11 (log-is-truth)). */
  readonly append: (entry: Entry) => Promise<Read<void>>;
  /** Writes `brief.md`, rendered from the brief, over the one before. */
  readonly render: (brief: Brief) => Promise<Read<void>>;
  /**
   * Writes a draft to `draft/keyframes.md`, over the one before, and gives the folder it's in for
   * `keyframes check`, which reads a folder (D3 (staged-draft)).
   */
  readonly stage: (text: string) => Promise<Read<string>>;
  /** Copies the staged draft to the project's `keyframes.md`, and gives its path. */
  readonly accept: () => Promise<Read<string>>;
};

const DONE: Read<void> = { ok: true, value: undefined };

/** A slug is one plain name, so its folder can only be inside `.storyboard/`. */
const SLUG = /^(?!\.{1,2}$)[^/\\\0]+$/;

/** The code a failed file call gives, such as `ENOENT`. */
const codeOf = (error: unknown): unknown => (error instanceof Error && 'code' in error ? error.code : undefined);

/** Runs a file call, giving `missing` when there's nothing at the path it reads. */
const unlessMissing = async <T, U>(call: () => Promise<T>, missing: U): Promise<T | U> => {
  try {
    return await call();
  } catch (error) {
    if (codeOf(error) === 'ENOENT') {
      return missing;
    }
    throw error;
  }
};

/**
 * Opens the store for the session `slug` in the project folder `project`. Opening writes nothing,
 * and a slug that isn't one plain name is refused, since its folder could land outside the session's.
 */
export const openStore = (project: string, slug: string): Read<Store> => {
  if (!SLUG.test(slug)) {
    return { ok: false, problem: `the slug ${JSON.stringify(slug)} can't name a session: it must be one name, with no slashes` };
  }
  const dir = join(project, '.storyboard', slug);
  const log = join(dir, 'answers.jsonl');
  const draft = join(dir, 'draft');

  /** Creates the session's folder, refusing when the project's isn't there, so nothing else is created. */
  const create = async (): Promise<Read<void>> => {
    const found = await unlessMissing(() => stat(project), undefined);
    if (found?.isDirectory() !== true) {
      return { ok: false, problem: `the project folder ${project} isn't there` };
    }
    await mkdir(dir, { recursive: true });
    return DONE;
  };

  return {
    ok: true,
    value: {
      load: async () => {
        const text = await unlessMissing(() => readFile(log, 'utf8'), '');
        return readLog(text);
      },
      append: async (entry) => {
        const line = writeEntry(entry);
        if (!line.ok) {
          return line;
        }
        const created = await create();
        if (created.ok) {
          await appendFile(log, line.value);
        }
        return created;
      },
      render: async (brief) => {
        const created = await create();
        if (created.ok) {
          await writeFile(join(dir, 'brief.md'), renderBrief(brief));
        }
        return created;
      },
      stage: async (text) => {
        const created = await create();
        if (!created.ok) {
          return created;
        }
        await mkdir(draft, { recursive: true });
        await writeFile(join(draft, PLAN), text);
        return { ok: true, value: draft };
      },
      accept: async () => {
        const target = join(project, PLAN);
        try {
          await copyFile(join(draft, PLAN), target, constants.COPYFILE_EXCL);
        } catch (error) {
          if (codeOf(error) === 'EEXIST') {
            return { ok: false, problem: `there's already a keyframes.md at ${target}, and accepting never writes over one` };
          }
          if (codeOf(error) === 'ENOENT') {
            return { ok: false, problem: 'no draft is staged to accept' };
          }
          throw error;
        }
        return { ok: true, value: target };
      },
    },
  };
};
