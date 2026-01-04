#!/usr/bin/env node

import { Command } from "@effect/cli";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Effect } from "effect";
import packageJson from "../../package.json" with { type: "json" };
import { confect } from "./confect";

Command.run(confect, {
  name: "Confect",
  version: packageJson.version,
})(process.argv).pipe(Effect.provide(NodeContext.layer), NodeRuntime.runMain);
