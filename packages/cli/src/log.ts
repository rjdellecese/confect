import * as Path from "@effect/platform/Path";
import * as Ansi from "@effect/printer-ansi/Ansi";
import * as AnsiDoc from "@effect/printer-ansi/AnsiDoc";
import { pipe } from "effect/Function";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as String from "effect/String";
import type * as FunctionPath from "./FunctionPath";
import * as GroupPath from "./GroupPath";
import { ProjectRoot } from "./ProjectRoot";

// --- Path styling ---

/**
 * Render a relative path as an AnsiDoc with the directory portion
 * dimmed (`Ansi.blackBright`) and the file leaf rendered in the
 * default terminal color. Used inline anywhere a file path appears
 * in a CLI message.
 */
export const formatPathDoc = (relativePath: string): AnsiDoc.AnsiDoc => {
  const lastSep = Math.max(
    relativePath.lastIndexOf("/"),
    relativePath.lastIndexOf("\\"),
  );
  const dir = lastSep < 0 ? "" : relativePath.slice(0, lastSep + 1);
  const leaf = lastSep < 0 ? relativePath : relativePath.slice(lastSep + 1);
  return AnsiDoc.hcat([
    pipe(AnsiDoc.text(dir), AnsiDoc.annotate(Ansi.blackBright)),
    AnsiDoc.text(leaf),
  ]);
};

// --- File operation logs ---

const logFile = (char: string, color: Ansi.Ansi) => (fullPath: string) =>
  Effect.gen(function* () {
    const projectRoot = yield* ProjectRoot.get;
    const path = yield* Path.Path;

    const prefix = projectRoot + path.sep;
    const suffix = pipe(fullPath, String.startsWith(prefix))
      ? pipe(fullPath, String.slice(prefix.length))
      : fullPath;

    yield* Console.log(
      pipe(
        AnsiDoc.char(char),
        AnsiDoc.annotate(color),
        AnsiDoc.catWithSpace(
          AnsiDoc.hcat([
            pipe(AnsiDoc.text(prefix), AnsiDoc.annotate(Ansi.blackBright)),
            pipe(AnsiDoc.text(suffix), AnsiDoc.annotate(color)),
          ]),
        ),
        AnsiDoc.render({ style: "pretty" }),
      ),
    );
  });

export const logFileAdded = logFile("+", Ansi.green);

export const logFileRemoved = logFile("-", Ansi.red);

export const logFileModified = logFile("~", Ansi.yellow);

// --- Function subline logs ---

const logFunction =
  (char: string, color: Ansi.Ansi) =>
  (functionPath: FunctionPath.FunctionPath) =>
    Console.log(
      pipe(
        AnsiDoc.text("  "),
        AnsiDoc.cat(pipe(AnsiDoc.char(char), AnsiDoc.annotate(color))),
        AnsiDoc.catWithSpace(
          AnsiDoc.hcat([
            pipe(
              AnsiDoc.text(GroupPath.toString(functionPath.groupPath) + "."),
              AnsiDoc.annotate(Ansi.blackBright),
            ),
            pipe(AnsiDoc.text(functionPath.name), AnsiDoc.annotate(color)),
          ]),
        ),
        AnsiDoc.render({ style: "pretty" }),
      ),
    );

export const logFunctionAdded = logFunction("+", Ansi.green);

export const logFunctionRemoved = logFunction("-", Ansi.red);

// --- Process status logs ---

const logStatus = (char: string, charColor: Ansi.Ansi) => (message: string) =>
  Console.log(
    pipe(
      AnsiDoc.char(char),
      AnsiDoc.annotate(charColor),
      AnsiDoc.catWithSpace(AnsiDoc.text(message)),
      AnsiDoc.render({ style: "pretty" }),
    ),
  );

export const logSuccess = logStatus("✔︎", Ansi.green);

export const logFailure = logStatus("✘", Ansi.red);

export const logPending = logStatus("⭘", Ansi.yellow);

export const logWarn = logStatus("⚠", Ansi.yellow);
