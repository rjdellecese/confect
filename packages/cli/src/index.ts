#!/usr/bin/env node

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as NodeStream from "@effect/platform-node/NodeStream";
import * as Effect from "effect/Effect";
import * as PlatformError from "effect/PlatformError";
import * as Stdio from "effect/Stdio";
import { cliApp } from "./cliApp";

// Track if we received SIGINT so we can re-raise it after cleanup.
// This ensures proper terminal state restoration when run via e.g. `pnpm`.
const canReRaiseSignals = process.platform !== "win32";

let interrupted = false;
process.prependListener("SIGINT", () => {
  interrupted = true;
});
process.on("exit", () => {
  if (interrupted && canReRaiseSignals) {
    process.kill(process.pid, "SIGINT");
  }
});

cliApp.pipe(
  Effect.updateService(Stdio.Stdio, (stdio) =>
    Stdio.make({
      ...stdio,
      stdin: NodeStream.fromReadable({
        evaluate: () => process.stdin,
        onError: (cause) =>
          PlatformError.systemError({
            _tag: "Unknown",
            module: "Stdio",
            method: "stdin",
            cause,
          }),
      }),
    }),
  ),
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
);
