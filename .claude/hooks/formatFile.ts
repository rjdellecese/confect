import * as BunRuntime from "@effect/platform-bun/BunRuntime";
import * as BunServices from "@effect/platform-bun/BunServices";
import * as Cause from "effect/Cause";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import { Stdio } from "effect/Stdio";
import * as Stream from "effect/Stream";
import * as String from "effect/String";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner";

/**
 * @see https://docs.claude.com/en/docs/claude-code/hooks
 */
const PostToolUseInput = Schema.fromJsonString(
  Schema.Struct({
    tool_input: Schema.Struct({
      file_path: Schema.String,
    }),
  }),
);

/**
 * File extensions that Oxfmt supports
 *
 * @see https://oxc.rs/docs/guide/usage/formatter
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
  // JSON
  ".json",
  ".jsonc",
  ".json5",
  // YAML
  ".yaml",
  ".yml",
  // TOML
  ".toml",
  // HTML/Angular/Vue
  ".html",
  ".htm",
  ".vue",
  // CSS/SCSS/Less
  ".css",
  ".scss",
  ".less",
  // Markdown/MDX
  ".md",
  ".mdx",
  // GraphQL
  ".graphql",
  ".gql",
  // Handlebars/Ember
  ".hbs",
]);

const isSupportedFileType = Effect.fnUntraced(function* (filePath: string) {
  const path = yield* Path.Path;

  const ext = String.toLowerCase(path.extname(filePath));
  return SUPPORTED_EXTENSIONS.has(ext);
});

const program = Effect.gen(function* () {
  const stdio = yield* Stdio;
  const jsonString = yield* stdio.stdin.pipe(
    Stream.decodeText(),
    Stream.mkString,
  );

  const input = yield* Schema.decodeEffect(PostToolUseInput)(jsonString);
  const filePath = input.tool_input.file_path;

  if (yield* isSupportedFileType(filePath)) {
    const spawner = yield* ChildProcessSpawner;

    const exitCode = yield* spawner.exitCode(
      ChildProcess.make("pnpm", ["oxfmt", "--write", filePath], {
        stderr: "inherit",
      }),
    );

    if (exitCode === 0) {
      yield* Console.log("{}");
    }
  }
});

BunRuntime.runMain(
  program.pipe(
    Effect.tapCause((cause) => Console.error(Cause.pretty(cause))),
    Effect.provide(BunServices.layer),
  ),
);
