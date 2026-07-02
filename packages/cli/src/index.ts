#!/usr/bin/env node

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as NodeRuntime from "@effect/platform-node/NodeRuntime";
import * as Effect from "effect/Effect";
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

cliApp.pipe(
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
);
