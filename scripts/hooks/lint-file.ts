import { Command, Path } from "@effect/platform";
import { BunContext, BunRuntime, BunStream } from "@effect/platform-bun";
import { Cause, Console, Effect, Schema, Stream, String } from "effect";

/**
 * @see https://docs.claude.com/en/docs/claude-code/hooks
 */
const PostToolUseInput = Schema.parseJson(
  Schema.Struct({
    tool_input: Schema.Struct({
      file_path: Schema.String,
    }),
  }),
);

/**
 * File extensions that ESLint supports in this project
 *
 * @see eslint.config.mjs
 */
const SUPPORTED_EXTENSIONS = new Set([
  // JavaScript
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  // TypeScript
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
  // Markdown/MDX (apps/docs)
  ".md",
  ".mdx",
]);

const isSupportedFileType = (filePath: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;

    const ext = String.toLowerCase(path.extname(filePath));
    return SUPPORTED_EXTENSIONS.has(ext);
  });

const program = Effect.gen(function* () {
  const jsonString = yield* BunStream.stdin.pipe(
    Stream.decodeText(),
    Stream.mkString,
  );

  const input = yield* Schema.decode(PostToolUseInput)(jsonString);
  const filePath = input.tool_input.file_path;

  if ((yield* isSupportedFileType(filePath)) === true) {
    const command = Command.make(
      "pnpm",
      "eslint",
      "--fix",
      "--cache",
      "--cache-strategy",
      "content",
      filePath,
    ).pipe(Command.stderr("inherit"));

    const exitCode = yield* Command.exitCode(command);

    // https://eslint.org/docs/latest/use/command-line-interface#exit-codes
    if (exitCode === 2) {
      return yield* Effect.dieMessage(
        "ESLint encountered a configuration problem or internal error",
      );
    }

    yield* Console.log("{}");
  }
});

BunRuntime.runMain(
  program.pipe(
    Effect.tapErrorCause((cause) => Console.error(Cause.pretty(cause))),
    Effect.provide(BunContext.layer),
  ),
);
