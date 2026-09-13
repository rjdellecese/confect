import * as Command from "effect/unstable/cli/Command";
import { codegen } from "./confect/codegen";
import { dev } from "./confect/dev";

export const confect = Command.make("confect").pipe(
  Command.withDescription("Generate and sync Confect files with Convex"),
  Command.withSubcommands([codegen, dev]),
);
