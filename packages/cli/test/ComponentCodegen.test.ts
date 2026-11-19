import { expect, expectTypeOf, it as test, layer } from "@effect/vitest";
import type { GenericId } from "@confect/core/GenericId";
import type { scope } from "./fixtures/authored-component/confect/_generated/id";
import { Id } from "./fixtures/authored-component/confect/_generated/id";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { codegenHandler } from "@confect/cli/confect/codegen";
import * as DirectoryOptions from "@confect/cli/DirectoryOptions";
import { ConvexDirectory } from "@confect/cli/ConvexDirectory";

const fixture = `${import.meta.dirname}/fixtures/authored-component`;

test("keeps generated component ID types consistent with their schemas", () => {
  expectTypeOf<Id<"counters">>().toEqualTypeOf<
    GenericId<"counters", typeof scope>
  >();
  expectTypeOf(Id("counters").Type).toEqualTypeOf<Id<"counters">>();
  expectTypeOf(Id("_storage").Type).toEqualTypeOf<Id<"_storage">>();
});
const generatedModificationTimes = Effect.fnUntraced(function* (
  directory: string,
) {
  const fs = yield* FileSystem.FileSystem;
  const generated = `${directory}/confect/_generated`;
  const files = yield* fs.readDirectory(generated, { recursive: true });
  return yield* Effect.forEach(
    files.sort(),
    (file) =>
      fs
        .stat(`${generated}/${file}`)
        .pipe(
          Effect.map((stat) => [
            file,
            Option.map(stat.mtime, (time) => time.getTime()),
          ]),
        ),
    { concurrency: 1 },
  );
});
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

layer(NodeServices.layer)("component codegen", (it) => {
  it.effect(
    "generates a component contract and scoped services from a clean source tree",
    () =>
      Effect.gen(function* () {
        const directory = yield* freshFixture;
        const fs = yield* FileSystem.FileSystem;
        const dirs = yield* Layer.build(
          DirectoryOptions.layer({
            componentDir: Option.some(`${directory}/convex`),
          }),
        );
        yield* codegenHandler.pipe(Effect.provideContext(dirs));
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
        expect(services).toContain("Storage_.Storage.forScope<typeof scope>()");
        expect(services).toContain("MutationCtx_.MutationCtx<");
        const contract = yield* fs.readFileString(
          `${directory}/confect/_generated/component.ts`,
        );
        expect(contract).toContain("Component.make(spec, scope,");
        expect(contract).not.toContain("impl");
        const before = yield* generatedModificationTimes(directory);
        yield* codegenHandler.pipe(Effect.provideContext(dirs));
        const after = yield* generatedModificationTimes(directory);
        expect(after).toEqual(before);
      }).pipe(Effect.scoped),
    { timeout: 30000 },
  );

  it.effect(
    "preserves scoped IDs on a rejected target and cleans obsolete outputs on target switches",
    () =>
      Effect.gen(function* () {
        const directory = yield* freshFixture;
        const fs = yield* FileSystem.FileSystem;
        const dirs = yield* Layer.build(
          DirectoryOptions.layer({
            componentDir: Option.some(`${directory}/convex`),
          }),
        );
        const component = codegenHandler.pipe(Effect.provideContext(dirs));
        const app = codegenHandler.pipe(
          Effect.provideService(ConvexDirectory, {
            get: Effect.succeed(`${directory}/convex`),
          }),
          Effect.provideContext(dirs),
        );
        const config = `${directory}/convex/convex.config.ts`;
        const original = yield* fs.readFileString(config);
        const id = `${directory}/confect/_generated/id.ts`;
        const contract = `${directory}/confect/_generated/component.ts`;
        const auth = `${directory}/confect/auth.ts`;
        const authConfig = `${directory}/convex/auth.config.ts`;
        const targetFiles = Effect.all(
          { contract: fs.exists(contract), authConfig: fs.exists(authConfig) },
          { concurrency: 1 },
        );
        yield* component;
        const scopedId = yield* fs.readFileString(id);
        const rejected = yield* Effect.result(app);
        expect(rejected).toMatchObject({
          _tag: "Failure",
          failure: { _tag: "InvalidConvexConfigError" },
        });
        const idAfterRejection = yield* fs.readFileString(id);
        expect(idAfterRejection).toBe(scopedId);
        yield* fs.writeFileString(config, `import "./missing";\n${original}`);
        const broken = yield* Effect.result(app);
        expect(broken).toMatchObject({
          _tag: "Failure",
          failure: { _tag: "BundleFailedError" },
        });
        const idAfterBuildFailure = yield* fs.readFileString(id);
        expect(idAfterBuildFailure).toBe(scopedId);
        yield* fs.writeFileString(
          config,
          'import { defineApp } from "convex/server"; export default defineApp();',
        );
        yield* fs.writeFileString(auth, "export default { providers: [] };");
        yield* app;
        const appFiles = yield* targetFiles;
        expect(appFiles).toEqual({ contract: false, authConfig: true });
        yield* fs.remove(auth);
        yield* fs.writeFileString(config, original);
        yield* component;
        const componentFiles = yield* targetFiles;
        expect(componentFiles).toEqual({ contract: true, authConfig: false });
        const customAuth = "export default { providers: [] };";
        yield* fs.writeFileString(authConfig, customAuth);
        yield* component;
        const preserved = yield* fs.readFileString(authConfig);
        expect(preserved).toBe(customAuth);
      }).pipe(Effect.scoped),
    { timeout: 30000 },
  );

  it.effect(
    "keeps a table named target distinct from the component execution target",
    () =>
      Effect.gen(function* () {
        const directory = yield* freshFixture;
        const fs = yield* FileSystem.FileSystem;
        yield* fs.writeFileString(
          `${directory}/confect/tables/target.ts`,
          `import { Table } from "@confect/core";
import * as Schema from "effect/Schema";
export default Table.make(() => Schema.Struct({ name: Schema.String }));
`,
        );
        const dirs = yield* Layer.build(
          DirectoryOptions.layer({
            componentDir: Option.some(`${directory}/convex`),
          }),
        );
        yield* codegenHandler.pipe(Effect.provideContext(dirs));
        const schema = yield* fs.readFileString(
          `${directory}/confect/_generated/schema.ts`,
        );
        expect(schema).toContain('import target from "./tables/target";');
        expect(schema).toContain('import { target as $target } from "./id";');
        expect(schema).toContain("typeof $target");
        expect(schema).toContain("}, $target)");
        const before = yield* generatedModificationTimes(directory);
        yield* codegenHandler.pipe(Effect.provideContext(dirs));
        const after = yield* generatedModificationTimes(directory);
        expect(after).toEqual(before);
      }).pipe(Effect.scoped),
    { timeout: 30000 },
  );

  it.effect(
    "generates the component registry before loading tables with child IDs",
    () =>
      Effect.gen(function* () {
        const directory = yield* freshFixture;
        const fs = yield* FileSystem.FileSystem;
        const configPath = yield* Schema.encodeEffect(
          Schema.fromJsonString(Schema.String),
        )(`${fixture}/convex/convex.config`);
        const contractPath = yield* Schema.encodeEffect(
          Schema.fromJsonString(Schema.String),
        )(`${fixture}/confect/_generated/component`);
        yield* fs.writeFileString(
          `${directory}/convex/convex.config.ts`,
          `import { defineComponent } from "convex/server";
import counter from ${configPath};
const parent = defineComponent("parent");
parent.use(counter, { name: "child" });
export default parent;
`,
        );
        yield* fs.writeFileString(
          `${directory}/confect/tables/foreign.ts`,
          `import { Component, Table } from "@confect/core";
import * as Schema from "effect/Schema";
import counter from ${contractPath};
import { components } from "../_generated/components";
import { scope } from "../_generated/id";
const child = Component.bind(counter, components.child, { parentScope: scope });
export default Table.make(() => Schema.Struct({ id: Component.id(child, "counters") }));
`,
        );
        const dirs = yield* Layer.build(
          DirectoryOptions.layer({
            componentDir: Option.some(`${directory}/convex`),
          }),
        );
        yield* codegenHandler.pipe(Effect.provideContext(dirs));
        const components = yield* fs.readFileString(
          `${directory}/confect/_generated/components.ts`,
        );
        expect(components).toContain("Component.Mounted<import(");
        expect(components).toContain('ComponentApi<"child">, "child">');
        const before = yield* generatedModificationTimes(directory);
        yield* codegenHandler.pipe(Effect.provideContext(dirs));
        const after = yield* generatedModificationTimes(directory);
        expect(after).toEqual(before);
      }).pipe(Effect.scoped),
    { timeout: 30000 },
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
        const dirs = yield* Layer.build(
          DirectoryOptions.layer({
            componentDir: Option.some(`${directory}/convex`),
          }),
        );
        const result = yield* codegenHandler.pipe(
          Effect.provideContext(dirs),
          Effect.result,
        );
        expect(result).toMatchObject({
          _tag: "Failure",
          failure: {
            _tag: "InvalidConvexConfigError",
            reason: expect.stringContaining("authentication"),
          },
        });
      }).pipe(Effect.scoped),
  );
});
