import { Command } from "effect/unstable/cli";
import packageJson from "../package.json" with { type: "json" };
import { confect } from "./confect";

export const cliApp = Command.run(confect, {
  version: packageJson.version,
});
