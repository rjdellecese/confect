#!/usr/bin/env node

import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Sink from "effect/Sink";
import * as Stdio from "effect/Stdio";
import * as Stream from "effect/Stream";
import * as Terminal from "effect/Terminal";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";
import { cliApp } from "./cliApp";

// Track if we received SIGINT so we can re-raise it after cleanup.
// This ensures proper terminal state restoration when run via e.g. `pnpm`.
let interrupted = false;
process.prependListener("SIGINT", () => {
  interrupted = true;
});
process.on("exit", () => {
  if (interrupted) {
    process.kill(process.pid, "SIGINT");
  }
});

/**
 * Node-backed `Stdio` service.
 *
 * Effect 4 dropped `@effect/platform-node`'s `NodeStdio.layer`. The CLI only
 * needs `args` (so the `Command.run` entry point can read `process.argv`);
 * `stdout`/`stderr` are wired straight through to `process.stdout`/`stderr`,
 * and `stdin` is left as an empty stream because the CLI never reads it.
 */
const nodeStdio = Stdio.make({
  args: Effect.sync(() => process.argv.slice(2)),
  stdout: () =>
    Sink.forEach((input: string | Uint8Array) =>
      Effect.sync(() => {
        process.stdout.write(input);
      }),
    ),
  stderr: () =>
    Sink.forEach((input: string | Uint8Array) =>
      Effect.sync(() => {
        process.stderr.write(input);
      }),
    ),
  stdin: Stream.empty,
});

const stdioLayer = Layer.succeed(Stdio.Stdio, nodeStdio);

/**
 * Local layers for the rest of the CLI runner's `Environment` dependencies.
 * The Confect CLI doesn't use path-typed flags, file-typed flags, interactive
 * prompts, or child-process spawning, so noop/empty implementations satisfy
 * the current command surface without extra runtime work.
 */
const fileSystemLayer = FileSystem.layerNoop({});
const pathLayer = Path.layer;
const terminalLayer = Layer.succeed(
  Terminal.Terminal,
  Terminal.make({
    columns: Effect.sync(() => process.stdout.columns ?? 80),
    rows: Effect.sync(() => process.stdout.rows ?? 24),
    readInput: Effect.die("Terminal.readInput is not supported"),
    readLine: Effect.die("Terminal.readLine is not supported"),
    display: (text: string) =>
      Effect.sync(() => {
        process.stdout.write(text);
      }),
  }),
);
const childProcessSpawnerLayer = Layer.succeed(
  ChildProcessSpawner.ChildProcessSpawner,
  ChildProcessSpawner.make(() =>
    Effect.die("ChildProcessSpawner is not supported in @confect/cli"),
  ),
);

const cliEnvironment = Layer.mergeAll(
  stdioLayer,
  fileSystemLayer,
  pathLayer,
  terminalLayer,
  childProcessSpawnerLayer,
);

Effect.runPromise(cliApp.pipe(Effect.provide(cliEnvironment))).catch(
  (error: unknown) => {
    console.error(error);
    process.exit(1);
  },
);
