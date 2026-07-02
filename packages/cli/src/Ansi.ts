/**
 * Minimal ANSI styling helpers for CLI output, replacing the retired
 * `@effect/printer-ansi` dependency (Effect v4 folds the CLI into
 * `effect/unstable/cli` and keeps its ANSI helpers internal). Styles are
 * functions from text to a styled string with a trailing reset, mirroring how
 * the v4 CLI internals compose escape sequences.
 */

const ESC = "\x1B[";

const RESET = `${ESC}0m`;

const style =
  (code: number) =>
  (text: string): string =>
    `${ESC}${code}m${text}${RESET}`;

export type Style = (text: string) => string;

export const red: Style = style(31);

export const green: Style = style(32);

export const yellow: Style = style(33);

export const magenta: Style = style(35);

export const blackBright: Style = style(90);
