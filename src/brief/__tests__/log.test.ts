import { describe, expect, test } from 'vitest';

import { readLog, writeEntry, type Entry } from '../index.js';
import { AT, SESSION } from './fixture.js';

/** The line an entry writes as; an entry that won't write fails the test. */
const line = (entry: Entry): string => {
  const written = writeEntry(entry);
  if (!written.ok) {
    throw new Error(written.problem);
  }
  return written.value;
};

/** The log a list of entries writes as, one line each. */
const log = (entries: readonly Entry[]): string => entries.map(line).join('');

/** What reading a log of these lines refuses, as its line and problem. */
const refusal = (...lines: string[]): { line: number | undefined; problem: string } | undefined => {
  const read = readLog(lines.map((each) => `${each}\n`).join(''));
  return read.ok ? undefined : { line: read.line, problem: read.problem };
};

/** One entry of every kind. */
const EVERY: readonly Entry[] = [
  ...SESSION,
  {
    kind: 'corrected',
    at: AT,
    chunk: 2,
    text: 'C1 is wrong: it may write inside its own folder.\nAnd D2 needs a reason.',
    items: ['C1', 'D2'],
    updates: [
      { slot: 'no-gos', status: 'partial', value: ['Never write into a pilot repo.'] },
      { slot: 'decisions', status: 'missing', value: [] },
    ],
  },
];

describe('writeEntry and readLog', () => {
  test('the session holds an entry of every kind', () => {
    expect(new Set(EVERY.map((entry) => entry.kind))).toEqual(
      new Set(['asked', 'answered', 'classified', 'done', 'drafted', 'passed', 'corrected', 'accepted']),
    );
  });

  test.each(EVERY.map((entry, index) => [`${index + 1}: ${entry.kind}`, entry] as const))(
    'entry %s writes one line and reads back unchanged',
    (_name, entry) => {
      const written = line(entry);
      expect(written.endsWith('\n')).toBe(true);
      expect(written.slice(0, -1)).not.toContain('\n');
      expect(readLog(written)).toEqual({ ok: true, value: [entry] });
    },
  );

  test('a whole log reads back as its entries, in order, and writes back byte for byte', () => {
    const text = log(EVERY);
    const read = readLog(text);
    expect(read).toEqual({ ok: true, value: EVERY });
    expect(read.ok && log(read.value)).toBe(text);
  });

  test('answers and corrections keep their words exactly, spaces and line breaks included', () => {
    const entry: Entry = {
      kind: 'answered',
      at: AT,
      answers: [{ question: 'intake-1', text: '  a planner — für mich 🎬\n\twith "quotes" ' }],
      updates: [],
    };
    expect(readLog(line(entry))).toEqual({ ok: true, value: [entry] });
  });

  test('fields in another order read, and write back in their usual order', () => {
    const read = readLog(`{"at":"${AT}","size":"small","work":"game","kind":"classified"}\n`);
    expect(read.ok && log(read.value)).toBe(`{"kind":"classified","at":"${AT}","work":"game","size":"small"}\n`);
  });

  test('an empty log has no entries, and a last line without its newline still reads', () => {
    expect(readLog('')).toEqual({ ok: true, value: [] });
    expect(readLog(line({ kind: 'done', at: AT }).trimEnd())).toEqual({ ok: true, value: [{ kind: 'done', at: AT }] });
  });

  test('an entry the log could not read back is refused, not written', () => {
    expect(writeEntry({ kind: 'asked', at: AT, questions: [] })).toEqual({
      ok: false,
      problem: '"questions" has 0 items, and it holds 1 to 4',
    });
  });
});

/** An asked entry's line whose one question ends with `fields`. */
const question = (fields: string): string =>
  `{"kind":"asked","at":"${AT}","questions":[{"id":"q1","slots":["problem"],"text":"Why?",${fields}}]}`;

/** An answered entry's line whose updates are `fields`. */
const update = (fields: string): string =>
  `{"kind":"answered","at":"${AT}","answers":[{"question":"q1","text":"Yes."}],"updates":[${fields}]}`;

describe('a malformed entry is refused with its line number', () => {
  const DONE = `{"kind":"done","at":"${AT}"}`;

  test.each([
    ['not JSON', '{"kind":"done"', "the line isn't JSON"],
    ['an empty line', '', 'the line is empty'],
    ['a list', '[]', "the entry isn't an object"],
    ['a string', '"done"', "the entry isn't an object"],
    ['an unknown kind', `{"kind":"asks","at":"${AT}"}`, '"kind" is "asks", which isn\'t one of asked, answered,'],
    ['no kind', `{"at":"${AT}"}`, '"kind" is missing'],
    ['no time', '{"kind":"done"}', 'the entry has no "at"'],
    ['a blank time', '{"kind":"done","at":" "}', '"at" isn\'t text'],
    ['an extra field', `{"kind":"done","at":"${AT}","by":"rob"}`, 'the entry has a field it shouldn\'t: "by"'],
    ['no questions', `{"kind":"asked","at":"${AT}","questions":[]}`, '"questions" has 0 items, and it holds 1 to 4'],
    [
      'five questions',
      `{"kind":"asked","at":"${AT}","questions":[${Array.from({ length: 5 }, (_, n) => `{"id":"q${n}","slots":["problem"],"text":"Why?","options":[],"recommended":null}`).join(',')}]}`,
      '"questions" has 5 items, and it holds 1 to 4',
    ],
    ['a question with no slots', question('"options":[],"recommended":null').replace('["problem"]', '[]'), '"questions"[0].slots has 0 items'],
    ['a question naming a slot twice', question('"options":[],"recommended":null').replace('["problem"]', '["a","a"]'), '"questions"[0].slots names "a" twice'],
    ['a menu of one', question('"options":["Yes"],"recommended":null'), '"questions"[0].options has one option, and a menu has two to four'],
    ['a menu of five', question('"options":["a","b","c","d","e"],"recommended":null'), '"questions"[0].options has 5 items, and it holds 0 to 4'],
    ['a numbered recommendation', question('"options":[],"recommended":1'), '"questions"[0].recommended isn\'t text'],
    ['no recommendation field', question('"options":[]'), '"questions"[0] has no "recommended"'],
    ['an id with a space', question('"options":[],"recommended":null').replace('"q1"', '"q 1"'), '"questions"[0].id has a space in it'],
    [
      'two questions with one id',
      `{"kind":"asked","at":"${AT}","questions":[${['a', 'b'].map((text) => `{"id":"q1","slots":["problem"],"text":"${text}","options":[],"recommended":null}`).join(',')}]}`,
      '"questions" names "q1" twice',
    ],
    ['no answers', `{"kind":"answered","at":"${AT}","answers":[],"updates":[]}`, '"answers" has 0 items, and it holds at least 1'],
    [
      'two answers to one question',
      `{"kind":"answered","at":"${AT}","answers":[{"question":"q1","text":"a"},{"question":"q1","text":"b"}],"updates":[]}`,
      '"answers" names "q1" twice',
    ],
    ['a blank answer', `{"kind":"answered","at":"${AT}","answers":[{"question":"q1","text":"  "}],"updates":[]}`, '"answers"[0].text isn\'t text'],
    ['an unknown status', update('{"slot":"problem","status":"done","value":["x"]}'), '"updates"[0].status is "done", which isn\'t one of clear, partial, missing'],
    ['a Missing slot with a value', update('{"slot":"problem","status":"missing","value":["x"]}'), 'must be empty exactly when the status is missing'],
    ['a Clear slot with no value', update('{"slot":"problem","status":"clear","value":[]}'), 'must be empty exactly when the status is missing'],
    ['a blank statement', update('{"slot":"problem","status":"partial","value":[""]}'), '"updates"[0].value[0] isn\'t text'],
    [
      'two updates to one slot',
      update('{"slot":"problem","status":"partial","value":["x"]},{"slot":"problem","status":"clear","value":["y"]}'),
      '"updates" names "problem" twice',
    ],
    ['an unknown work', `{"kind":"classified","at":"${AT}","work":"app","size":"small"}`, '"work" is "app", which isn\'t one of product, feature, library, game, content, event'],
    ['an unknown size', `{"kind":"classified","at":"${AT}","work":"game","size":"huge"}`, '"size" is "huge", which isn\'t one of tiny, small, medium, large'],
    ['a draft with no chunks', `{"kind":"drafted","at":"${AT}","chunks":[]}`, '"chunks" has 0 items'],
    ['a negative chunk', `{"kind":"passed","at":"${AT}","chunk":-1}`, '"chunk" isn\'t a whole number'],
    ['a fractional chunk', `{"kind":"passed","at":"${AT}","chunk":1.5}`, '"chunk" isn\'t a whole number'],
    ['a chunk as text', `{"kind":"passed","at":"${AT}","chunk":"1"}`, '"chunk" isn\'t a whole number'],
    ['a blank correction', `{"kind":"corrected","at":"${AT}","chunk":0,"text":"","items":[],"updates":[]}`, '"text" isn\'t text'],
  ])('%s', (_name, bad, problem) => {
    const found = refusal(DONE, DONE, bad, DONE);
    expect(found?.line).toBe(3);
    expect(found?.problem).toContain(problem);
  });

  test('the first malformed line is the one named', () => {
    expect(refusal(DONE, '{', '[]')).toEqual({ line: 2, problem: "the line isn't JSON" });
  });
});
