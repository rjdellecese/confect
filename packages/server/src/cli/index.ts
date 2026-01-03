#!/usr/bin/env node

import { NodeContext, NodeRuntime } from "@effect/platform-node";
import { Effect } from "effect";
import { cli } from "./cli";

cli(process.argv).pipe(Effect.provide(NodeContext.layer), NodeRuntime.runMain);
