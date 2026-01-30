import { Command } from "@effect/cli";
import { codegen } from "./confect/codegen";

export const confect = Command.make("confect").pipe(
  Command.withDescription("Confect - Use Effect with Convex!"),
  Command.withSubcommands([codegen]),
);
