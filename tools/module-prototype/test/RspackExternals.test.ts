import { assert, describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as CompilationInputs from "../../../packages/cli/src/CompilationInputs.ts";
import * as RspackExternals from "../src/RspackExternals.ts";

describe("RspackExternals capture-scoped discovery", () => {
  it.effect(
    "deduplicates concurrent directory checks but keeps negative PnP evidence live",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const entry = path.join(root, "entry.ts");
        const loader = path.join(root, ".pnp.cjs");
        const inputs = yield* CompilationInputs.make("Once", []);
        const checked: string[] = [];
        const policy = yield* RspackExternals.make({
          inputs,
          conditions: [],
        }).pipe(
          Effect.provideService(FileSystem.FileSystem, {
            ...fs,
            exists: (file) =>
              Effect.sync(() => {
                checked.push(file);
              }).pipe(Effect.andThen(fs.exists(file))),
          }),
        );
        yield* Effect.forEach(
          Array.from({ length: 20 }, () => entry),
          policy.check,
          { concurrency: 20 },
        );
        expect(checked.filter((file) => file === loader)).toHaveLength(2);
        const count = checked.length;
        yield* policy.check(path.join(root, "other.ts"));
        expect(checked).toHaveLength(count);
        yield* fs.writeFileString(
          loader,
          "throw new Error('must not execute');",
        );
        const captured = yield* policy.capture.pipe(Effect.result);
        assert(Result.isFailure(captured));
        expect(captured.failure).toMatchObject({
          _tag: "CompilationRestartRequired",
          paths: expect.arrayContaining([loader]),
        });
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "does not share a previous capture's PnP permission with a later policy",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const entry = path.join(root, "entry.ts");
        const loader = path.join(root, ".pnp.cjs");
        const inputs = yield* CompilationInputs.make("Once", []);
        const first = yield* RspackExternals.make({ inputs, conditions: [] });
        yield* first.check(entry);
        const before = yield* first.capture;
        yield* fs.writeFileString(
          loader,
          "throw new Error('must not execute');",
        );
        const freshInputs = yield* CompilationInputs.make("Once", []);
        const second = yield* RspackExternals.make({
          inputs: freshInputs,
          conditions: [],
        });
        expect(yield* second.check(entry).pipe(Effect.result)).toMatchObject({
          _tag: "Failure",
          failure: {
            _tag: "RspackExternalsUnsupported",
            reason: "PnpProject",
            path: loader,
          },
        });
        expect(
          Result.isFailure(yield* before.validate.pipe(Effect.result)),
        ).toBe(true);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
