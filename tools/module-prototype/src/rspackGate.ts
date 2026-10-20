import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Compatibility from "../test/integration/compatibility.ts";
import * as RspackCompiler from "./RspackCompiler.ts";
import * as Runner from "./Runner.ts";

const report = await Effect.runPromise(
  Compatibility.runWith((entry, invoke) =>
    Effect.gen(function* () {
      const prepared = yield* RspackCompiler.compile(entry, {
        observedExternals: true,
      });
      yield* prepared.validate;
      const value = yield* Runner.evaluateNative({
        _tag: "Native",
        url: prepared.url,
        exportName: "probe",
        invoke,
      });
      yield* prepared.validate;
      return value;
    }),
  ).pipe(Effect.provide(NodeServices.layer)),
);
process.stdout.write(
  Schema.encodeSync(Schema.fromJsonString(Schema.Unknown))({
    ...report,
    scope: "cold-semantic-gate",
    runtimeResolution: "observed-with-cold-fallback",
    productionQualified: false,
  }) + "\n",
);
process.exitCode = report.qualified ? 0 : 1;
