import { Command } from "@effect/platform";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Cause, Console, Effect, Schema, String } from "effect";
import { readFileSync } from "node:fs";
import { extname } from "node:path";

/**
 * @see https://cursor.com/docs/agent/hooks#afterfileedit
 */
const AfterFileEditInput = Schema.parseJson(
  Schema.Struct({
    file_path: Schema.String,
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
  // Markdown / MDX (apps/docs)
  ".md",
  ".mdx",
]);

const isSupportedFileType = (filePath: string) =>
  SUPPORTED_EXTENSIONS.has(String.toLowerCase(extname(filePath)));

const program = Effect.gen(function* () {
  const jsonString = readFileSync(0, "utf-8");
  const input = yield* Schema.decode(AfterFileEditInput)(jsonString);

  if (isSupportedFileType(input.file_path)) {
    const command = Command.make(
      "pnpm",
      "exec",
      "eslint",
      "--fix",
      input.file_path,
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

NodeRuntime.runMain(
  program.pipe(
    Effect.tapErrorCause((cause) => Console.error(Cause.pretty(cause))),
    Effect.provide(NodeContext.layer),
  ),
);
