import { Ansi, AnsiDoc } from "@effect/printer-ansi";
import { Console, Effect } from "effect";
import { Array, Option, pipe, String } from "effect";
import * as esbuild from "esbuild";
import type { SpecBuildError} from "./codegenErrors";
import { type CodegenUserError } from "./codegenErrors";
import { logFailure } from "./log";

const errorGutter = pipe(
  AnsiDoc.char("│"),
  AnsiDoc.annotate(Ansi.red),
  AnsiDoc.render({ style: "pretty" }),
);

const withErrorGutterBlock = (output: string): string =>
  pipe(
    output,
    (content) =>
      pipe(
        String.split(content, "\n"),
        Array.map((line) =>
          pipe(line, String.trim) === ""
            ? errorGutter
            : `${errorGutter} ${line}`,
        ),
        Array.join("\n"),
      ),
    (guttered) => `${errorGutter}\n${guttered}\n${errorGutter}`,
  );

export const formatBuildError = (
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

export const formatBuildErrors = (
  errors: readonly esbuild.Message[],
  formattedMessages: readonly string[],
): string =>
  pipe(
    formattedMessages,
    Array.map((message, i) => formatBuildError(errors[i], message)),
    Array.join(""),
    String.trimEnd,
    withErrorGutterBlock,
  );

export const logSpecBuildError = (error: SpecBuildError) =>
  Effect.gen(function* () {
    const formatted = yield* Effect.tryPromise(() =>
      esbuild.formatMessages(error.errors as esbuild.Message[], {
        kind: "error",
        color: true,
        terminalWidth: 80,
      }),
    ).pipe(Effect.orElseSucceed(() => [] as string[]));
    const output = formatBuildErrors(
      error.errors as esbuild.Message[],
      formatted,
    );
    yield* logFailure(`${error.file}: build errors`);
    yield* Console.error(output);
  });

export const logCodegenUserError = (error: CodegenUserError) =>
  error._tag === "SpecBuildError"
    ? logSpecBuildError(error)
    : logFailure(error.message);
