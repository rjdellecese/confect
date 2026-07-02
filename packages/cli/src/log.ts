import { pipe } from "effect/Function";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as String from "effect/String";
import * as Ansi from "./Ansi";
import type * as FunctionPath from "./FunctionPath";
import * as GroupPath from "./GroupPath";
import { ProjectRoot } from "./ProjectRoot";

// --- Path styling ---

/**
 * Render a relative path with the directory portion dimmed
 * (`Ansi.blackBright`) and the file leaf rendered in the default terminal
 * color. Used inline anywhere a file path appears in a CLI message.
 */
export const formatPath = (relativePath: string): string => {
  const lastSep = Math.max(
    relativePath.lastIndexOf("/"),
    relativePath.lastIndexOf("\\"),
  );
  const dir = lastSep < 0 ? "" : relativePath.slice(0, lastSep + 1);
  const leaf = lastSep < 0 ? relativePath : relativePath.slice(lastSep + 1);
  return Ansi.blackBright(dir) + leaf;
};

// --- File operation logs ---

const logFile = (char: string, color: Ansi.Style) => (fullPath: string) =>
  Effect.gen(function* () {
    const projectRoot = yield* ProjectRoot.get;
    const path = yield* Path.Path;

    const prefix = projectRoot + path.sep;
    const suffix = pipe(fullPath, String.startsWith(prefix))
      ? pipe(fullPath, String.slice(prefix.length))
      : fullPath;

    yield* Console.log(
      `${color(char)} ${Ansi.blackBright(prefix)}${color(suffix)}`,
    );
  });

export const logFileAdded = logFile("+", Ansi.green);

export const logFileRemoved = logFile("-", Ansi.red);

export const logFileModified = logFile("~", Ansi.yellow);

// --- Function subline logs ---

const logFunction =
  (char: string, color: Ansi.Style) =>
  (functionPath: FunctionPath.FunctionPath) =>
    Console.log(
      `  ${color(char)} ${Ansi.blackBright(
        GroupPath.toString(functionPath.groupPath) + ".",
      )}${color(functionPath.name)}`,
    );

export const logFunctionAdded = logFunction("+", Ansi.green);

export const logFunctionRemoved = logFunction("-", Ansi.red);

// --- Process status logs ---

const logStatus = (char: string, charColor: Ansi.Style) => (message: string) =>
  Console.log(`${charColor(char)} ${message}`);

export const logSuccess = logStatus("✔︎", Ansi.green);

export const logFailure = logStatus("✘", Ansi.red);

export const logPending = logStatus("⭘", Ansi.yellow);

export const logWarn = logStatus("⚠", Ansi.yellow);
