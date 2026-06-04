import * as Command from "@effect/cli/Command";
import packageJson from "../package.json" with { type: "json" };
import { confect } from "./confect";

export const cliApp = Command.run(confect, {
  name: "Confect",
  version: packageJson.version,
});
