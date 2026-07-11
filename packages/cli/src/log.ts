import { pipe } from "effect/Function";
import * as Array from "effect/Array";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Predicate from "effect/Predicate";
import * as String from "effect/String";
import * as esbuild from "esbuild";
import type {
  BuildError,
  BundleFailedError,
  ImportFailedError,
} from "./BuildError";
import * as Ansi from "./Ansi";
import type * as FunctionPath from "./FunctionPath";
import * as GroupPath from "./GroupPath";
import { ProjectRoot } from "./ProjectRoot";

// --- Path styling ---

/**
 * Render a relative path with the directory portion dimmed
 * (`Ansi.blackBright`) and the file leaf rendered in the default terminal
 * color.
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

// --- Build message rendering ---

const cross = Ansi.red("✘");

const warningSign = Ansi.yellow("⚠");

const gutter = (color: Ansi.Style): string => color("│");

const errorGutter = gutter(Ansi.red);

const withGutterBlock =
  (gutterChar: string) =>
  (output: string): string =>
    pipe(
      String.split(output, "\n"),
      Array.map((line) =>
        pipe(line, String.trim) === "" ? gutterChar : `${gutterChar} ${line}`,
      ),
      Array.join("\n"),
      (guttered) => `${gutterChar}\n${guttered}\n${gutterChar}`,
    );

const withErrorGutterBlock = withGutterBlock(errorGutter);

const formatBuildMessage = (
  error: esbuild.Message | undefined,
  formattedMessage: string,
): string => {
  const lines = String.split(formattedMessage, "\n");
  const redErrorText = Ansi.red(error?.text ?? "");
  const replaced = pipe(
    Array.findFirstIndex(lines, (l) => pipe(l, String.trim, String.isNonEmpty)),
    Option.flatMap((index) => Array.modify(lines, index, () => redErrorText)),
    Option.getOrElse(() => lines),
  );
  return pipe(replaced, Array.join("\n"));
};

/**
 * Render a list of esbuild messages into a styled, gutter-prefixed block.
 */
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

const renderImportFailedError = (error: ImportFailedError): string => {
  const causeMessage = Predicate.isError(error.cause)
    ? error.cause.message
    : Predicate.isString(error.cause)
      ? error.cause
      : globalThis.String(error.cause);
  const oneLineCause = pipe(
    String.split(causeMessage, "\n"),
    Array.findFirst((line) => pipe(line, String.trim, String.isNonEmpty)),
    Option.map(String.trim),
    Option.getOrElse(() => "unknown error"),
  );
  return `${cross} Failed to load bundled module ${formatPath(
    error.file,
  )}: ${oneLineCause}; check the file's top-level imports and side effects.`;
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
  const header = `${cross} ${formatPath(error.file)}: build errors`;
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
    Match.tag("ImportFailedError", renderImportFailedError),
    Match.exhaustive,
  );

export const logBuildError = (error: BuildError) =>
  Effect.sync(() => console.error(renderBuildError(error)));

/**
 * Render a flat list of esbuild messages as a single error block with a
 * generic `✘ Build errors` header.
 */
const renderCoalescedBuildErrors = (
  messages: readonly esbuild.Message[],
): string => {
  const formatted = esbuild.formatMessagesSync(messages as esbuild.Message[], {
    kind: "error",
    color: true,
    terminalWidth: 80,
  });
  const header = `${cross} Build errors`;
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
  const header = `${warningSign} Build warnings`;
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
