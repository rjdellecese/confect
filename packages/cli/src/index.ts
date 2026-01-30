#!/usr/bin/env node

import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Effect } from "effect";
import { cliApp } from "./cliApp";

cliApp(process.argv).pipe(
  Effect.provide(NodeContext.layer),
  NodeRuntime.runMain,
);
