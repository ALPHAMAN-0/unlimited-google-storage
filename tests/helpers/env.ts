/**
 * Test helpers for manipulating `process.env.NODE_ENV`.
 *
 * `NODE_ENV` is typed as read-only by `@types/node`, so a direct assignment
 * is a compile error. These helpers keep the intent explicit and cast in one
 * place instead of scattering `as` casts through the test files.
 */

/** Set `NODE_ENV`, returning a function that restores the previous value. */
export function setNodeEnv(value: string): () => void {
  const prev = process.env.NODE_ENV;
  (process.env as Record<string, string | undefined>).NODE_ENV = value;
  return () => {
    (process.env as Record<string, string | undefined>).NODE_ENV = prev;
  };
}

/** Run `fn` with `NODE_ENV` set to `value`, then restore it. */
export async function withNodeEnv<T>(value: string, fn: () => T | Promise<T>): Promise<T> {
  const restore = setNodeEnv(value);
  try {
    return await fn();
  } finally {
    restore();
  }
}
