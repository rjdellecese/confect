import * as Path from "@effect/platform/Path";
import * as Ansi from "@effect/printer-ansi/Ansi";
import * as AnsiDoc from "@effect/printer-ansi/AnsiDoc";
import { pipe } from "effect/Function";
import * as Array from "effect/Array";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as String from "effect/String";
import * as esbuild from "esbuild";
import type {
  BuildError,
  BundleFailedError,
  ImportFailedError,
} from "./BuildError";
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

// --- Build message rendering ---

const cross = pipe(AnsiDoc.char("✘"), AnsiDoc.annotate(Ansi.red));

const warningSign = pipe(AnsiDoc.char("⚠"), AnsiDoc.annotate(Ansi.yellow));

const gutter = (color: Ansi.Ansi): string =>
  pipe(
    AnsiDoc.char("│"),
    AnsiDoc.annotate(color),
    AnsiDoc.render({ style: "pretty" }),
  );

const errorGutter = gutter(Ansi.red);

const withGutterBlock =
  (gutterDoc: string) =>
  (output: string): string =>
    pipe(
      String.split(output, "\n"),
      Array.map((line) =>
        pipe(line, String.trim) === "" ? gutterDoc : `${gutterDoc} ${line}`,
      ),
      Array.join("\n"),
      (guttered) => `${gutterDoc}\n${guttered}\n${gutterDoc}`,
    );

const withErrorGutterBlock = withGutterBlock(errorGutter);

const formatBuildMessage = (
  error: esbuild.Message | undefined,
  formattedMessage: string,
): string => {
  const lines = String.split(formattedMessage, "\n");
  const redErrorText = pipe(
    AnsiDoc.text(error?.text ?? ""),
    AnsiDoc.annotate(Ansi.red),
    AnsiDoc.render({ style: "pretty" }),
  );
  const replaced = pipe(
    Array.findFirstIndex(lines, (l) => pipe(l, String.trim, String.isNonEmpty)),
    Option.match({
      onNone: () => lines,
      onSome: (index) => Array.modify(lines, index, () => redErrorText),
    }),
  );
  return pipe(replaced, Array.join("\n"));
};

export const formatEsbuildMessages = (
  errors: readonly esbuild.Message[],
  formattedMessages: readonly string[],
): string =>
  pipe(
    formattedMessages,
    Array.map((message, i) => formatBuildMessage(errors[i], message)),
    Array.join(""),
    String.trimEnd,
    withErrorGutterBlock,
  );

const renderImportFailedError = (error: ImportFailedError): AnsiDoc.AnsiDoc => {
  const causeMessage =
    error.cause instanceof Error
      ? error.cause.message
      : typeof error.cause === "string"
        ? error.cause
        : globalThis.String(error.cause);
  const oneLineCause = pipe(
    String.split(causeMessage, "\n"),
    Array.findFirst((line) => pipe(line, String.trim, String.isNonEmpty)),
    Option.map(String.trim),
    Option.getOrElse(() => "unknown error"),
  );
  return pipe(
    cross,
    AnsiDoc.catWithSpace(
      AnsiDoc.hcat([
        AnsiDoc.text("Failed to load bundled module "),
        formatPathDoc(error.file),
        AnsiDoc.text(
          `: ${oneLineCause}; check the file's top-level imports and side effects.`,
        ),
      ]),
    ),
  );
};

/**
 * Render a {@link BundleFailedError} as a multi-line, ANSI-styled string:
 * a one-line `✘ <file>: build errors` header followed by the
 * gutter-prefixed esbuild diagnostic block. Multi-line is appropriate
 * here because a single `BundleFailedError` carries an array of distinct
 * esbuild messages.
 */
const renderBundleFailedError = (error: BundleFailedError): string => {
  const messages = error.errors as readonly esbuild.Message[];
  const formatted = esbuild.formatMessagesSync(messages as esbuild.Message[], {
    kind: "error",
    color: true,
    terminalWidth: 80,
  });
  const header = pipe(
    cross,
    AnsiDoc.catWithSpace(
      AnsiDoc.hcat([formatPathDoc(error.file), AnsiDoc.text(": build errors")]),
    ),
    AnsiDoc.render({ style: "pretty" }),
  );
  return `${header}\n${formatEsbuildMessages(messages, formatted)}`;
};

/**
 * Render any {@link BuildError} into a styled, ready-to-print string.
 * `ImportFailedError` collapses to a single line; `BundleFailedError`
 * expands to a header plus one diagnostic block per esbuild message.
 */
export const renderBuildError = (error: BuildError): string =>
  Match.value(error).pipe(
    Match.tag("BundleFailedError", renderBundleFailedError),
    Match.tag("ImportFailedError", (e) =>
      pipe(renderImportFailedError(e), AnsiDoc.render({ style: "pretty" })),
    ),
    Match.exhaustive,
  );

export const logBuildError = (error: BuildError) =>
  Effect.sync(() => console.error(renderBuildError(error)));

/**
 * Render a flat list of esbuild messages as a single error block with a
 * generic `✘ Build errors` header. Used by dev-mode when multiple
 * watchers surface the same underlying error and we want to log the
 * coalesced set rather than one block per watcher.
 */
const renderCoalescedBuildErrors = (
  messages: readonly esbuild.Message[],
): string => {
  const formatted = esbuild.formatMessagesSync(messages as esbuild.Message[], {
    kind: "error",
    color: true,
    terminalWidth: 80,
  });
  const header = pipe(
    cross,
    AnsiDoc.catWithSpace(AnsiDoc.text("Build errors")),
    AnsiDoc.render({ style: "pretty" }),
  );
  return `${header}\n${formatEsbuildMessages(messages, formatted)}`;
};

export const logCoalescedBuildErrors = (messages: readonly esbuild.Message[]) =>
  Effect.sync(() => {
    if (messages.length === 0) return;
    console.error(renderCoalescedBuildErrors(messages));
  });

const renderCoalescedBuildWarnings = (
  messages: readonly esbuild.Message[],
): string => {
  const formatted = esbuild.formatMessagesSync(messages as esbuild.Message[], {
    kind: "warning",
    color: true,
    terminalWidth: 80,
  });
  const header = pipe(
    warningSign,
    AnsiDoc.catWithSpace(AnsiDoc.text("Build warnings")),
    AnsiDoc.render({ style: "pretty" }),
  );
  const body = pipe(
    formatted,
    Array.join(""),
    String.trimEnd,
    withGutterBlock(gutter(Ansi.yellow)),
  );
  return `${header}\n${body}`;
};

export const logCoalescedBuildWarnings = (
  messages: readonly esbuild.Message[],
) =>
  Effect.sync(() => {
    if (messages.length === 0) return;
    console.error(renderCoalescedBuildWarnings(messages));
  });
