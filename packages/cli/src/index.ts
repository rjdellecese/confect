#!/usr/bin/env node

import * as NodeContext from "@effect/platform-node/NodeContext";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as Effect from "effect/Effect";
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

cliApp(process.argv).pipe(
  Effect.provide(NodeContext.layer),
  NodeRuntime.runMain,
);
