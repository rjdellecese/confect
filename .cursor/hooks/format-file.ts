import { Command, Path } from "@effect/platform";
import { BunContext, BunRuntime, BunStream } from "@effect/platform-bun";
import { Cause, Console, Effect, Schema, Stream, String } from "effect";

/**
 * @see https://cursor.com/docs/agent/hooks#afterfileedit
 */
const AfterFileEditInput = Schema.parseJson(
  Schema.Struct({
    file_path: Schema.String,
  }),
);

/**
 * File extensions that Prettier supports
 *
 * @see https://prettier.io/docs/en/options.html
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

  const input = yield* Schema.decode(AfterFileEditInput)(jsonString);

  if ((yield* isSupportedFileType(input.file_path)) === true) {
    const command = Command.make(
      "pnpm",
      "prettier",
      "--write",
      input.file_path,
    ).pipe(Command.stderr("inherit"));

    const exitCode = yield* Command.exitCode(command);

    if (exitCode === 0) {
      yield* Console.log("{}");
    }
  }
});

BunRuntime.runMain(
  program.pipe(
    Effect.tapErrorCause((cause) => Console.error(Cause.pretty(cause))),
    Effect.provide(BunContext.layer),
  ),
);
