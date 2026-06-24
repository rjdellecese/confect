import * as Ansi from "@effect/printer-ansi/Ansi";
import * as AnsiDoc from "@effect/printer-ansi/AnsiDoc";
import { pipe } from "effect/Function";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as String from "effect/String";
import * as esbuild from "esbuild";
import { formatPathDoc } from "./log";

// --- Variants ---

export class BundleFailedError extends Schema.TaggedError<BundleFailedError>()(
  "BundleFailedError",
  {
    file: Schema.String,
    errors: Schema.Array(Schema.Unknown),
  },
) {}

export class ImportFailedError extends Schema.TaggedError<ImportFailedError>()(
  "ImportFailedError",
  {
    file: Schema.String,
    cause: Schema.Unknown,
  },
) {}

export const BuildError = Schema.Union(BundleFailedError, ImportFailedError);
export type BuildError = typeof BuildError.Type;

export const isBuildError = (error: unknown): error is BuildError =>
  Schema.is(BuildError)(error);

// --- Bundler adapter ---

/**
 * Internal failure produced by the esbuild bundle/import pipeline. Always
 * remapped to a {@link BuildError} (which carries enough context for the CLI
 * to render it) before reaching a user-surface boundary.
 */
export class BundlerError extends Schema.TaggedError<BundlerError>()(
  "BundlerError",
  {
    cause: Schema.Unknown,
  },
) {}

const isEsbuildBuildFailure = (error: unknown): error is esbuild.BuildFailure =>
  typeof error === "object" &&
  error !== null &&
  "errors" in error &&
  globalThis.Array.isArray((error as esbuild.BuildFailure).errors);

export const fromBundlerError = (
  file: string,
  error: BundlerError,
): BuildError =>
  isEsbuildBuildFailure(error.cause)
    ? new BundleFailedError({ file, errors: error.cause.errors })
    : new ImportFailedError({ file, cause: error.cause });

// --- Rendering ---

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

/**
 * Render a list of esbuild messages into a styled, gutter-prefixed block.
 * Used by both {@link renderBundleFailedError} and the dev-mode esbuild
 * watcher's `onEnd` hook (where the messages don't flow through the
 * tagged-error pipeline).
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

/**
 * Render a flat list of esbuild warnings as a single warning block with a
 * `⚠ Build warnings` header. Unlike errors, warnings never block a build;
 * they surface non-fatal diagnostics such as a workspace dependency that
 * {@link import("./Bundler").bundleWorkspacePlugin} couldn't resolve and had
 * to leave external. esbuild's own `formatMessagesSync` already styles each
 * message in yellow, so (unlike the error path) we don't re-annotate the text.
 */
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
