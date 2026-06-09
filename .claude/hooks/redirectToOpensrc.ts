import * as BunContext from "@effect/platform-bun/BunContext";
import * as BunRuntime from "@effect/platform-bun/BunRuntime";
import * as BunStream from "@effect/platform-bun/BunStream";
import * as Array from "effect/Array";
import * as Cause from "effect/Cause";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Match from "effect/Match";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";

/**
 * Discriminated union of preToolUse inputs for the tools we gate.
 *
 * @see https://cursor.com/docs/hooks#pretooluse
 * @see https://cursor.com/docs/hooks#common-schema
 */
const ReadInput = Schema.Struct({
  tool_name: Schema.Literal("Read"),
  tool_input: Schema.Struct({
    path: Schema.optional(Schema.String),
  }),
});

const GrepInput = Schema.Struct({
  tool_name: Schema.Literal("Grep"),
  tool_input: Schema.Struct({
    path: Schema.optional(Schema.String),
  }),
});

const GlobInput = Schema.Struct({
  tool_name: Schema.Literal("Glob"),
  tool_input: Schema.Struct({
    glob_pattern: Schema.String,
    target_directory: Schema.optional(Schema.String),
  }),
});

const PreToolUseInput = Schema.parseJson(
  Schema.Union(ReadInput, GrepInput, GlobInput),
);

type PreToolUseInput = typeof PreToolUseInput.Type;

const BLOCKED_PATH_PATTERN = /node_modules|\.pnpm-store|\.pnpm(?:\/|$)/;

const program = Effect.gen(function* () {
  const jsonString = yield* BunStream.stdin.pipe(
    Stream.decodeText(),
    Stream.mkString,
  );

  const inputOption = yield* Schema.decode(PreToolUseInput)(jsonString).pipe(
    Effect.option,
  );

  if (Option.isNone(inputOption)) {
    yield* Console.log("{}");
    return;
  }

  const input = inputOption.value;

  const pathValues = Match.value(input).pipe(
    Match.when({ tool_name: "Read" }, ({ tool_input }) =>
      Array.filterMap([tool_input.path], Option.fromNullable),
    ),
    Match.when({ tool_name: "Grep" }, ({ tool_input }) =>
      Array.filterMap([tool_input.path], Option.fromNullable),
    ),
    Match.when({ tool_name: "Glob" }, ({ tool_input }) =>
      Array.filterMap(
        [tool_input.glob_pattern, tool_input.target_directory],
        Option.fromNullable,
      ),
    ),
    Match.exhaustive,
  );

  const referencesBlockedPath = Array.some(pathValues, (value) =>
    BLOCKED_PATH_PATTERN.test(value),
  );

  if (referencesBlockedPath) {
    yield* Console.log(
      JSON.stringify({
        permission: "deny",
        user_message:
          "Use `pnpm opensrc path <package>` instead of reading from `node_modules` or `.pnpm-store`.",
        agent_message: Array.join(
          [
            "Do not read source code from `node_modules` or `.pnpm-store`.",
            "Use the opensrc tool to resolve dependency source code in the global `~/.opensrc/` cache instead.",
            "",
            "1. Run: `pnpm opensrc path <package-name>`",
            "2. Use the returned absolute path with read or search commands.",
            "3. Check `~/.opensrc/sources.json` to see cached packages and versions.",
          ],
          "\n",
        ),
      }),
    );
  } else {
    yield* Console.log("{}");
  }
});

BunRuntime.runMain(
  program.pipe(
    Effect.tapErrorCause((cause) => Console.error(Cause.pretty(cause))),
    Effect.provide(BunContext.layer),
  ),
);
