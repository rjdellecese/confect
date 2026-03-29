import { Command } from "@effect/cli";
import { Layer } from "effect";
import { codegen } from "./confect/codegen";
import { dev } from "./confect/dev";
import { ConfectDirectory } from "./ConfectDirectory";
import { ConvexDirectory } from "./ConvexDirectory";
import { ProjectRoot } from "./ProjectRoot";

export const confect = Command.make("confect").pipe(
  Command.withDescription("Generate and sync Confect files with Convex"),
  Command.withSubcommands([codegen, dev]),
  Command.provide(
    Layer.mergeAll(
      ConfectDirectory.Default,
      ProjectRoot.Default,
      ConvexDirectory.Default,
    ),
  ),
);
