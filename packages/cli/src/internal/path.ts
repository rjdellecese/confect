/**
 * Thin re-export of Node's `node:path` so the Confect CLI can resolve
 * paths without depending on an Effect platform layer.
 */
import nodePath from "node:path";

export const join = (...segments: ReadonlyArray<string>): string =>
  nodePath.join(...segments);

export const resolve = (...segments: ReadonlyArray<string>): string =>
  nodePath.resolve(...segments);

export const dirname = (path: string): string => nodePath.dirname(path);

export const basename = (path: string, ext?: string): string =>
  nodePath.basename(path, ext);

export const extname = (path: string): string => nodePath.extname(path);

export const relative = (from: string, to: string): string =>
  nodePath.relative(from, to);

export const isAbsolute = (path: string): boolean => nodePath.isAbsolute(path);

export const parse = (
  path: string,
): {
  readonly root: string;
  readonly dir: string;
  readonly base: string;
  readonly ext: string;
  readonly name: string;
} => nodePath.parse(path);

export const sep = nodePath.sep;
