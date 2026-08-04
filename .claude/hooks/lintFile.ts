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
  const stdio = yield* Stdio;
  const jsonString = yield* stdio.stdin.pipe(
    Stream.decodeText(),
    Stream.mkString,
  );

  const input = yield* Schema.decodeEffect(PostToolUseInput)(jsonString);
  const filePath = input.tool_input.file_path;

  if ((yield* isSupportedFileType(filePath)) === true) {
    const spawner = yield* ChildProcessSpawner;

    // Oxlint exits non-zero when lint problems remain after fixing; that is not
    // a hook failure (the edit still succeeds), so we only surface its stderr.
    yield* spawner.exitCode(
      ChildProcess.make("pnpm", ["oxlint", "--fix", filePath], {
        stderr: "inherit",
      }),
    );

    yield* Console.log("{}");
  }
});

BunRuntime.runMain(
  program.pipe(
    Effect.tapCause((cause) => Console.error(Cause.pretty(cause))),
    Effect.provide(BunServices.layer),
  ),
);
