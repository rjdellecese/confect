/**
 * Run external commands via Node's `child_process` exposed as Effects.
 *
 * Used by the Confect CLI to invoke `npx convex codegen` and friends. Effect 4
 * shipped `effect/unstable/process/ChildProcess`, but it targets long-lived
 * child processes; for short-lived "run and wait" semantics we just use
 * `spawn` directly.
 */
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { spawn, type SpawnOptions } from "node:child_process";

export class CommandError extends Schema.TaggedErrorClass<CommandError>()(
  "CommandError",
  {
    command: Schema.String,
    args: Schema.Array(Schema.String),
    exitCode: Schema.optionalKey(Schema.Number),
    signal: Schema.optionalKey(Schema.String),
    message: Schema.String,
  },
) {}

export const run = (
  command: string,
  args: ReadonlyArray<string>,
  options?: SpawnOptions,
): Effect.Effect<void, CommandError> =>
  Effect.callback<void, CommandError>((resume) => {
    const child = spawn(command, [...args], {
      stdio: "inherit",
      ...options,
    });

    child.on("error", (error) => {
      resume(
        Effect.fail(
          new CommandError({
            command,
            args: [...args],
            message: error.message,
          }),
        ),
      );
    });

    child.on("exit", (code, signal) => {
      if (code === 0) {
        resume(Effect.void);
      } else {
        resume(
          Effect.fail(
            new CommandError({
              command,
              args: [...args],
              ...(code !== null ? { exitCode: code } : {}),
              ...(signal !== null ? { signal } : {}),
              message: `Command failed: ${command} ${[...args].join(" ")}`,
            }),
          ),
        );
      }
    });

    return Effect.sync(() => {
      if (!child.killed) {
        child.kill("SIGTERM");
      }
    });
  });
