import * as Command from "@effect/platform/Command";
import * as Path from "@effect/platform/Path";
import * as BunContext from "@effect/platform-bun/BunContext";
import * as BunRuntime from "@effect/platform-bun/BunRuntime";
import * as BunStream from "@effect/platform-bun/BunStream";
import * as Cause from "effect/Cause";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as String from "effect/String";

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
 * File extensions that Oxlint lints in this project
 *
 * @see .oxlintrc.json
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
    const command = Command.make("pnpm", "oxlint", "--fix", filePath).pipe(
      Command.stderr("inherit"),
    );

    // Oxlint exits non-zero when lint problems remain after fixing; that is not
    // a hook failure (the edit still succeeds), so we only surface its stderr.
    yield* Command.exitCode(command);

    yield* Console.log("{}");
  }
});

BunRuntime.runMain(
  program.pipe(
    Effect.tapErrorCause((cause) => Console.error(Cause.pretty(cause))),
    Effect.provide(BunContext.layer),
  ),
);
