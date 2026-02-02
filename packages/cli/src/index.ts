#!/usr/bin/env node

import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Effect } from "effect";
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

cliApp(process.argv).pipe(
  Effect.provide(NodeContext.layer),
  NodeRuntime.runMain,
);
