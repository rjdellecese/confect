import { Command } from "@effect/platform";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Cause, Console, Effect, Schema, String } from "effect";
import { readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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
  // HTML / Angular / Vue
  ".html",
  ".htm",
  ".vue",
  // CSS / SCSS / Less
  ".css",
  ".scss",
  ".less",
  // Markdown / MDX
  ".md",
  ".mdx",
  // GraphQL
  ".graphql",
  ".gql",
  // Handlebars / Ember
  ".hbs",
]);

const isSupportedFileType = (filePath: string) =>
  SUPPORTED_EXTENSIONS.has(String.toLowerCase(extname(filePath)));

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PRETTIER_BIN = resolve(REPO_ROOT, "node_modules/.bin/prettier");

const program = Effect.gen(function* () {
  const jsonString = readFileSync(0, "utf-8");
  const input = yield* Schema.decode(AfterFileEditInput)(jsonString);

  if (isSupportedFileType(input.file_path)) {
    const command = Command.make(PRETTIER_BIN, "--write", input.file_path).pipe(
      Command.workingDirectory(REPO_ROOT),
      Command.stderr("inherit"),
    );

    const exitCode = yield* Command.exitCode(command);

    if (exitCode === 0) {
      yield* Console.log("{}");
    }
  }
});

NodeRuntime.runMain(
  program.pipe(
    Effect.tapErrorCause((cause) => Console.error(Cause.pretty(cause))),
    Effect.provide(NodeContext.layer),
  ),
);
