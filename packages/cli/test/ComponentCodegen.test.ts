import { assert, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { codegenHandler } from "@confect/cli/confect/codegen";
import * as DirectoryOptions from "@confect/cli/DirectoryOptions";

const fixture = `${import.meta.dirname}/fixtures/authored-component`;
const freshFixture = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  // Keep package resolution inside the workspace, but isolate all generated writes.
  const directory = yield* fs.makeTempDirectoryScoped({
    directory: path.dirname(fixture),
  });
  yield* fs.copy(fixture, directory, { overwrite: true });
  yield* fs.remove(path.join(directory, "confect", "_generated"), {
    recursive: true,
  });
  return directory;
});

it.effect(
  "generates a component contract and scoped services from a clean source tree",
  () =>
    Effect.gen(function* () {
      const directory = yield* freshFixture;
      const fs = yield* FileSystem.FileSystem;
      const dirs = DirectoryOptions.layer({
        componentDir: Option.some(`${directory}/convex`),
      });
      const first = yield* codegenHandler.pipe(Effect.provide(dirs));
      expect(first.anyWritesHappened).toBe(true);
      const id = yield* fs.readFileString(
        `${directory}/confect/_generated/id.ts`,
      );
      expect(id).toContain(
        'scope = IdScope.component("@confect-fixtures/counter:convex")',
      );
      const services = yield* fs.readFileString(
        `${directory}/confect/_generated/services.ts`,
      );
      expect(services).not.toContain("Auth");
      expect(services).toContain("Scheduler_.forScope<typeof scope>()");
      expect(services).toContain("MutationCtx_.MutationCtx<");
      const contract = yield* fs.readFileString(
        `${directory}/confect/_generated/component.ts`,
      );
      expect(contract).toContain("Component.make(spec, scope,");
      expect(contract).not.toContain("impl");
      expect(
        (yield* codegenHandler.pipe(Effect.provide(dirs))).anyWritesHappened,
      ).toBe(false);
    }).pipe(Effect.provide(NodeServices.layer)),
);

it.effect(
  "rejects application authentication configuration for a component",
  () =>
    Effect.gen(function* () {
      const directory = yield* freshFixture;
      const fs = yield* FileSystem.FileSystem;
      yield* fs.writeFileString(
        `${directory}/confect/auth.ts`,
        "export default { providers: [] };\n",
      );
      const result = yield* Effect.result(
        codegenHandler.pipe(
          Effect.provide(
            DirectoryOptions.layer({
              componentDir: Option.some(`${directory}/convex`),
            }),
          ),
        ),
      );
      assert(Result.isFailure(result));
      expect(result.failure).toMatchObject({
        _tag: "InvalidConvexConfigError",
        reason: expect.stringContaining("authentication"),
      });
    }).pipe(Effect.provide(NodeServices.layer)),
);
