import { Path } from "@effect/platform";
import { Ansi, AnsiDoc } from "@effect/printer-ansi";
import { Console, Effect, pipe, String } from "effect";
import type * as FunctionPath from "./FunctionPath";
import * as GroupPath from "./GroupPath";
import { ProjectRoot } from "./services/ProjectRoot";

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

const logStatus =
  (
    char: string,
    charColor: Ansi.Ansi,
    messageText: string,
    messageColor: Ansi.Ansi,
  ) =>
  (message: string) =>
    Console.log(
      pipe(
        AnsiDoc.char(char),
        AnsiDoc.annotate(charColor),
        AnsiDoc.catWithSpace(
          pipe(
            AnsiDoc.char(" "),
            AnsiDoc.cat(AnsiDoc.text(messageText)),
            AnsiDoc.cat(AnsiDoc.char(" ")),
            AnsiDoc.annotate(messageColor),
          ),
        ),
        AnsiDoc.catWithSpace(AnsiDoc.text(message)),
        AnsiDoc.render({ style: "pretty" }),
      ),
    );

export const logCompleted = logStatus(
  "✔︎",
  Ansi.green,
  "SUCCESS",
  Ansi.combine(Ansi.green, Ansi.bgGreenBright),
);

export const logFailed = logStatus(
  "✘",
  Ansi.red,
  "FAILURE",
  Ansi.combine(Ansi.red, Ansi.bgRedBright),
);
