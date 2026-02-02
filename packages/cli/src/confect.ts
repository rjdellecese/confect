import { Command } from "@effect/cli";
import { Layer } from "effect";
import { codegen } from "./confect/codegen";
import { dev } from "./confect/dev";
import { ConfectDirectory } from "./services/ConfectDirectory";
import { ConvexDirectory } from "./services/ConvexDirectory";
import { ProjectRoot } from "./services/ProjectRoot";

export const confect = Command.make("confect").pipe(
  Command.withDescription("Confect - Use Effect with Convex!"),
  Command.withSubcommands([codegen, dev]),
  Command.provide(
    // TODO: Are we constructing duplicate dependencies here? Should we be building the dependency graph more explicitly?
    Layer.mergeAll(
      ProjectRoot.Default,
      ConvexDirectory.Default,
      ConfectDirectory.Default,
    ),
  ),
);
