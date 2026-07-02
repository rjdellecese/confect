import * as Command from "effect/unstable/cli/Command";
import * as Layer from "effect/Layer";
import { codegen } from "./confect/codegen";
import { dev } from "./confect/dev";
import * as ConfectDirectory from "./ConfectDirectory";
import * as ConvexDirectory from "./ConvexDirectory";
import * as ProjectRoot from "./ProjectRoot";

export const confect = Command.make("confect").pipe(
  Command.withDescription("Generate and sync Confect files with Convex"),
  Command.withSubcommands([codegen, dev]),
  Command.provide(
    Layer.mergeAll(
      ConfectDirectory.layer,
      ProjectRoot.layer,
      ConvexDirectory.layer,
    ),
  ),
);
