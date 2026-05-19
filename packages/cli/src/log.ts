/**
 * Pretty-printer for CLI output.
 *
 * Effect 4 dropped `@effect/printer` and `@effect/printer-ansi`. We inline a
 * tiny ANSI-escape helper so this module stays self-contained and dep-free.
 */
import { Console, Effect, pipe, String } from "effect";
import type * as FunctionPath from "./FunctionPath";
import * as GroupPath from "./GroupPath";
import * as Path from "./internal/path";
import { findProjectRoot } from "./ProjectRoot";

// --- ANSI helpers -----------------------------------------------------------

const ESC = "[";
const RESET = ESC + "0m";

const wrap = (code: string) => (s: string) => `${ESC}${code}m${s}${RESET}`;

const ansi = {
  green: wrap("32"),
  red: wrap("31"),
  yellow: wrap("33"),
  blackBright: wrap("90"),
} as const;

type AnsiFn = (s: string) => string;

// --- File operation logs ----------------------------------------------------

const logFile = (char: string, color: AnsiFn) => (fullPath: string) =>
  Effect.gen(function* () {
    const projectRoot = yield* findProjectRoot;

    const prefix = projectRoot + Path.sep;
    const suffix = pipe(fullPath, String.startsWith(prefix))
      ? pipe(fullPath, String.slice(prefix.length))
      : fullPath;

    yield* Console.log(
      `${color(char)} ${ansi.blackBright(prefix)}${color(suffix)}`,
    );
  });

export const logFileAdded = logFile("+", ansi.green);

export const logFileRemoved = logFile("-", ansi.red);

export const logFileModified = logFile("~", ansi.yellow);

// --- Function subline logs --------------------------------------------------

const logFunction =
  (char: string, color: AnsiFn) => (functionPath: FunctionPath.FunctionPath) =>
    Console.log(
      `  ${color(char)} ${ansi.blackBright(
        GroupPath.toString(functionPath.groupPath) + ".",
      )}${color(functionPath.name)}`,
    );

export const logFunctionAdded = logFunction("+", ansi.green);

export const logFunctionRemoved = logFunction("-", ansi.red);

// --- Process status logs ----------------------------------------------------

const logStatus = (char: string, charColor: AnsiFn) => (message: string) =>
  Console.log(`${charColor(char)} ${message}`);

export const logSuccess = logStatus("✔︎", ansi.green);

export const logFailure = logStatus("✘", ansi.red);

export const logPending = logStatus("⚯", ansi.yellow);

// Re-export ANSI helpers for callers that need the same coloring.
export const colors = ansi;
