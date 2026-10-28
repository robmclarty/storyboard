/**
 * What reading something gave: its value, or the problem that refused it. A refusal from the
 * answers log names the line it's on.
 */
export type Read<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly problem: string; readonly line?: number };

// Reading a nested value refuses from deep inside it, so readers throw a refusal and `attempt`
// turns it back into a Read at the top. The cause marks it, so a bug's error still throws.
const REFUSED = Symbol('refused');

/** Refuses what's being read, saying why. */
export const refuse: (problem: string) => never = (problem) => {
  throw new Error(problem, { cause: REFUSED });
};

/** Runs `read`, turning a refusal it throws into a Read. Any other error is a bug, and throws. */
export const attempt = <T>(read: () => T): Read<T> => {
  try {
    return { ok: true, value: read() };
  } catch (error) {
    if (error instanceof Error && error.cause === REFUSED) {
      return { ok: false, problem: error.message };
    }
    throw error;
  }
};
