#!/usr/bin/env node

import * as NodeContext from "@effect/platform-node/NodeContext";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as Effect from "effect/Effect";
import { cliApp } from "./cliApp";

// Track if we received SIGINT so we can re-raise it after cleanup.
// This ensures proper terminal state restoration when run via e.g. `pnpm`.
//
// Skipped on Windows, which has no signal semantics to re-raise: there
// `process.kill` terminates the target unconditionally for any signal other
// than `0`, so this would abort teardown rather than complete it.
let interrupted = false;
process.prependListener("SIGINT", () => {
  interrupted = true;
});
process.on("exit", () => {
  if (interrupted && process.platform !== "win32") {
    process.kill(process.pid, "SIGINT");
  }
});

cliApp(process.argv).pipe(
  Effect.provide(NodeContext.layer),
  NodeRuntime.runMain,
);
