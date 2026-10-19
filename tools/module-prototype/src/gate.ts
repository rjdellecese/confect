import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Compatibility from "../test/integration/compatibility.ts";

const report = await Effect.runPromise(
  Compatibility.run.pipe(Effect.provide(NodeServices.layer)),
);
process.stdout.write(
  Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))(report) + "\n",
);
process.exitCode = report.qualified ? 0 : 1;
