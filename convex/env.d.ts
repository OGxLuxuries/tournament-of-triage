/**
 * The Convex runtime exposes `process.env` for deployment environment
 * variables, but it is not Node — so declare just that surface instead of
 * pulling in @types/node globals that don't exist in the isolate.
 */
declare const process: {
  env: Record<string, string | undefined>;
};
