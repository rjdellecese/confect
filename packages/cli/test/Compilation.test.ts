import { fileURLToPath, pathToFileURL } from "node:url";
import * as Schema from "effect/Schema";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodePath from "@effect/platform-node/NodePath";
import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import * as Scope from "effect/Scope";
import * as Result from "effect/Result";
import * as Stream from "effect/Stream";
import * as Bundler from "@confect/cli/Bundler";
import * as Compilation from "@confect/cli/Compilation";
import * as CompilationState from "@confect/cli/CompilationState";
import * as CompiledModule from "@confect/cli/CompiledModule";

const observe = Effect.gen(function* () {
  const compiler = yield* Compilation.Service;
  const queue = yield* Queue.unbounded<CompilationState.Revision>();
  yield* compiler.events.pipe(
    Stream.runForEach((revision) => Queue.offer(queue, revision)),
    Effect.forkScoped,
  );
  return queue;
});

const compileAndLoad = Effect.fn("Compilation.test.compileAndLoad")(function* (
  entry: string,
) {
  const artifact = yield* Bundler.compile(entry);
  yield* CompiledModule.load(artifact);
  return artifact;
});

layer(Layer.mergeAll(NodeFileSystem.layer, NodePath.layer), {
  excludeTestServices: true,
})("Compilation", (it) => {
  it.effect(
    "acknowledges no-edit rebuilds without clearing a later native edit",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const entry = path.join(root, "entry.ts");
        yield* fs.writeFileString(entry, "export default 1;");
        yield* Effect.gen(function* () {
          const queue = yield* observe;
          const first = yield* Compilation.runJob(compileAndLoad(entry));
          expect(Exit.isSuccess(first.exit)).toBe(true);
          const initial = yield* Queue.take(queue);
          expect(CompilationState.acknowledged(initial, first.receipts)).toBe(
            true,
          );
          const second = yield* Compilation.runJob(compileAndLoad(entry));
          expect((yield* second.exit).url).toBe((yield* first.exit).url);
          const rebuilt = yield* Queue.take(queue);
          expect(rebuilt.affectedRoots).toEqual([]);
          expect(CompilationState.acknowledged(rebuilt, second.receipts)).toBe(
            true,
          );
          expect(yield* Queue.poll(queue)).toEqual(Option.none());
          expect(
            yield* Queue.take(queue).pipe(Effect.timeoutOption("400 millis")),
          ).toEqual(Option.none());
          yield* fs.writeFileString(entry, "export default 2;");
          const edited = yield* Queue.take(queue);
          expect(
            CompilationState.acknowledged(edited, [
              ...first.receipts,
              ...second.receipts,
            ]),
          ).toBe(false);
          expect(edited.context).toBe(initial.context);
        }).pipe(Effect.provide(Compilation.layer({ ownedDirectories: [] })));
      }).pipe(Effect.scoped, Effect.timeout("10 seconds")),
  );

  it.effect(
    "acknowledges failed revisions and watches a missing import becoming available",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const entry = path.join(root, "entry.ts");
        yield* fs.writeFileString(
          entry,
          'export { default } from "./missing";',
        );
        yield* Effect.gen(function* () {
          const queue = yield* observe;
          const failed = yield* Compilation.runJob(Bundler.compile(entry));
          expect(Exit.isFailure(failed.exit)).toBe(true);
          expect(failed.receipts).toEqual([]);
          const initial = yield* Queue.take(queue);
          expect(initial.errors.length).toBeGreaterThan(0);
          expect(
            CompilationState.acknowledged(initial, failed.failedReceipts),
          ).toBe(true);
          yield* fs.writeFileString(
            path.join(root, "missing.ts"),
            "export default 42;",
          );
          const repaired = yield* Queue.take(queue);
          expect(repaired.errors).toEqual([]);
          expect(
            CompilationState.acknowledged(repaired, failed.failedReceipts),
          ).toBe(false);
          const result = yield* Compilation.runJob(Bundler.bundle(entry));
          const loaded = yield* result.exit;
          expect(loaded.module.default).toBe(42);
        }).pipe(Effect.provide(Compilation.layer({ ownedDirectories: [] })));
      }).pipe(Effect.scoped, Effect.timeout("10 seconds")),
  );

  it.effect(
    "observes an absent tsconfig becoming available and changed alias keys",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const entry = path.join(root, "entry.ts");
        yield* fs.writeFileString(entry, 'export { default } from "~/value";');
        yield* fs.writeFileString(
          path.join(root, "value.ts"),
          "export default 7;",
        );
        yield* Effect.gen(function* () {
          const queue = yield* observe;
          const failed = yield* Compilation.runJob(Bundler.compile(entry));
          expect(Exit.isFailure(failed.exit)).toBe(true);
          yield* Queue.take(queue);
          yield* fs.writeFileString(
            path.join(root, "tsconfig.json"),
            '{ "compilerOptions": { "paths": { "~/*": ["./*"] } } }',
          );
          const created = yield* Queue.take(queue);
          expect(created.errors).toEqual([]);
          yield* fs.writeFileString(
            path.join(root, "tsconfig.json"),
            '{ "compilerOptions": { "paths": {} } }',
          );
          const removed = yield* Queue.take(queue);
          expect(removed.errors.length).toBeGreaterThan(0);
        }).pipe(Effect.provide(Compilation.layer({ ownedDirectories: [] })));
      }).pipe(Effect.scoped, Effect.timeout("10 seconds")),
  );

  it.effect(
    "observes self-reference exports changes without source edits",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const entry = path.join(root, "entry.ts");
        yield* fs.writeFileString(
          entry,
          'export { default } from "project/value";',
        );
        yield* fs.writeFileString(
          path.join(root, "one.ts"),
          "export default 1;",
        );
        yield* fs.writeFileString(
          path.join(root, "two.ts"),
          "export default 2;",
        );
        const manifest = (target: string) =>
          fs.writeFileString(
            path.join(root, "package.json"),
            JSON.stringify({
              name: "project",
              type: "module",
              exports: { "./value": target },
            }),
          );
        yield* manifest("./one.ts");
        yield* Effect.gen(function* () {
          const queue = yield* observe;
          const first = yield* Compilation.runJob(Bundler.bundle(entry));
          expect((yield* first.exit).module.default).toBe(1);
          yield* Queue.take(queue);
          yield* manifest("./two.ts");
          expect((yield* Queue.take(queue)).errors).toEqual([]);
          const next = yield* Compilation.runJob(Bundler.bundle(entry));
          expect((yield* next.exit).module.default).toBe(2);
        }).pipe(Effect.provide(Compilation.layer({ ownedDirectories: [] })));
      }).pipe(Effect.scoped, Effect.timeout("10 seconds")),
  );

  it.effect(
    "excludes generated content but watches authored exceptions and normalizes its graph",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const owned = path.join(root, "generated");
        yield* fs.makeDirectory(owned);
        const generated = path.join(owned, "value.ts");
        const authored = path.join(owned, "config.ts");
        const entry = path.join(root, "entry.ts");
        yield* fs.writeFileString(generated, "export const value = 1;");
        yield* fs.writeFileString(authored, "export const config = 1;");
        yield* fs.writeFileString(
          entry,
          'import { value } from "./generated/value"; import { config } from "./generated/config"; export default value + config;',
        );
        yield* Effect.gen(function* () {
          const queue = yield* observe;
          const first = yield* Compilation.runJob(Bundler.compile(entry));
          const artifact = yield* first.exit;
          expect(
            yield* Bundler.directlyImports(artifact, entry, generated),
          ).toBe(true);
          expect(Object.keys(artifact.metafile.inputs)).toContain(generated);
          yield* Queue.take(queue);
          yield* fs.writeFileString(generated, "export const value = 2;");
          const unexpected = yield* Queue.take(queue).pipe(
            Effect.timeoutOption("400 millis"),
          );
          expect(unexpected).toEqual(Option.none());
          yield* fs.writeFileString(authored, "export const config = 2;");
          expect((yield* Queue.take(queue)).errors).toEqual([]);
          const next = yield* Compilation.runJob(Bundler.bundle(entry));
          expect((yield* next.exit).module.default).toBe(4);
        }).pipe(
          Effect.provide(
            Compilation.layer({
              ownedDirectories: [owned],
              authoredFiles: [authored],
            }),
          ),
        );
      }).pipe(Effect.scoped, Effect.timeout("10 seconds")),
  );

  it.effect(
    "reuses a superset and keeps artifacts immutable until their owning scope closes",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const one = path.join(root, "one.ts");
        const two = path.join(root, "two.ts");
        yield* fs.writeFileString(one, "export default 1;");
        yield* fs.writeFileString(two, "export default 2;");
        yield* Effect.gen(function* () {
          const queue = yield* observe;
          const artifactScope = yield* Scope.make();
          yield* Effect.addFinalizer(() =>
            Scope.close(artifactScope, Exit.void),
          );
          const first = yield* Compilation.runJob(
            Bundler.withBatch([one, two], Bundler.compile(one)).pipe(
              Effect.scoped,
              Effect.provideService(
                CompiledModule.ArtifactScope,
                artifactScope,
              ),
            ),
          );
          const old = yield* first.exit;
          yield* Queue.take(queue);
          yield* fs.writeFileString(one, "export default 3;");
          yield* Queue.take(queue);
          const second = yield* Compilation.runJob(
            Bundler.withBatch([one], Bundler.compile(one)).pipe(
              Effect.provideService(
                CompiledModule.ArtifactScope,
                artifactScope,
              ),
            ),
          );
          const fresh = yield* second.exit;
          expect(old.origin?.context).toBe(fresh.origin?.context);
          expect(first.receipts).toEqual([]);
          expect(second.receipts).toEqual([]);
          yield* (yield* Compilation.Service).reset;
          expect((yield* CompiledModule.load(old)).module.default).toBe(1);
          expect((yield* CompiledModule.load(fresh)).module.default).toBe(3);
          yield* Scope.close(artifactScope, Exit.void);
          expect(yield* fs.exists(fileURLToPath(old.url))).toBe(false);
        }).pipe(Effect.provide(Compilation.layer({ ownedDirectories: [] })));
      }).pipe(Effect.scoped, Effect.timeout("10 seconds")),
  );
  it.effect(
    "does not acknowledge a changed sibling when only one superset entry is consumed",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const one = path.join(root, "one.ts");
        const two = path.join(root, "two.ts");
        yield* fs.writeFileString(one, "export default 1;");
        yield* fs.writeFileString(two, "export default 2;");
        yield* Effect.gen(function* () {
          const queue = yield* observe;
          const initial = yield* Compilation.runJob(
            Bundler.withBatch(
              [one, two],
              Effect.all([compileAndLoad(one), compileAndLoad(two)]),
            ),
          );
          yield* initial.exit;
          yield* Queue.take(queue);
          yield* fs.writeFileString(two, "export default 3;");
          const changed = yield* Queue.take(queue);
          expect(changed.affectedRoots).toEqual([two]);
          const partial = yield* Compilation.runJob(
            Bundler.withBatch([one, two], compileAndLoad(one)),
          );
          yield* partial.exit;
          expect(partial.receipts.flatMap((receipt) => receipt.roots)).toEqual([
            one,
          ]);
          expect(
            CompilationState.unacknowledgedRoots(changed, partial.receipts),
          ).toEqual([two]);
          expect((yield* Queue.take(queue)).affectedRoots).toEqual([]);
        }).pipe(Effect.provide(Compilation.layer({ ownedDirectories: [] })));
      }).pipe(Effect.scoped, Effect.timeout("10 seconds")),
  );

  it.effect(
    "preserves external provenance and the CommonJS-only fallback",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        yield* fs.makeDirectory(path.join(root, "node_modules", "legacy"), {
          recursive: true,
        });
        yield* fs.writeFileString(
          path.join(root, "node_modules", "legacy", "package.json"),
          '{ "name": "legacy", "main": "index.js" }',
        );
        yield* fs.writeFileString(
          path.join(root, "node_modules", "legacy", "index.js"),
          'module.exports = "main";',
        );
        yield* fs.writeFileString(
          path.join(root, "node_modules", "legacy", "sub.js"),
          'module.exports = "sub";',
        );
        const entry = path.join(root, "entry.ts");
        yield* fs.writeFileString(
          entry,
          'import main from "legacy"; export default main; export const load = () => import("legacy/sub");',
        );
        const original = yield* Bundler.bundle(entry);
        const settle = (load: () => Promise<unknown>) =>
          Effect.promise(() =>
            load().then(
              () => "loaded",
              () => "failed",
            ),
          );
        yield* Effect.gen(function* () {
          const result = yield* Compilation.runJob(Bundler.bundle(entry));
          const bundled = yield* result.exit;
          expect(bundled.module.default).toBe("main");
          expect(yield* settle(bundled.module.load)).toBe(
            yield* settle(original.module.load),
          );
          expect(
            Bundler.importersOfPackage(bundled, "legacy", () => true),
          ).toEqual([entry]);
        }).pipe(Effect.provide(Compilation.layer({ ownedDirectories: [] })));
      }).pipe(Effect.scoped, Effect.timeout("10 seconds")),
  );
  it.effect(
    "routes external export changes even when emitted import bytes stay equal",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const dependency = path.join(root, "node_modules", "dependency");
        yield* fs.makeDirectory(dependency, { recursive: true });
        yield* fs.writeFileString(
          path.join(dependency, "one.js"),
          "export default 1;",
        );
        yield* fs.writeFileString(
          path.join(dependency, "two.js"),
          "export default 2;",
        );
        const manifest = (target: string) =>
          fs.writeFileString(
            path.join(dependency, "package.json"),
            `{ "type": "module", "exports": "./${target}.js" }`,
          );
        yield* manifest("one");
        const entry = path.join(root, "entry.ts");
        yield* fs.writeFileString(
          entry,
          'export { default } from "dependency";',
        );
        yield* Effect.gen(function* () {
          const queue = yield* observe;
          const first = yield* Compilation.runJob(Bundler.compile(entry));
          const original = yield* first.exit;
          const bytes = yield* fs.readFileString(fileURLToPath(original.url));
          yield* Queue.take(queue);
          yield* manifest("two");
          const changed = yield* Queue.take(queue);
          expect(changed.affectedRoots).toEqual([entry]);
          const second = yield* Compilation.runJob(Bundler.compile(entry));
          const next = yield* second.exit;
          expect(yield* fs.readFileString(fileURLToPath(next.url))).toBe(bytes);
          expect(next.metafile.inputs[entry]?.imports[0]?.path).toBe(
            path.join(dependency, "two.js"),
          );
        }).pipe(Effect.provide(Compilation.layer({ ownedDirectories: [] })));
      }).pipe(Effect.scoped, Effect.timeout("10 seconds")),
  );
  it.effect(
    "retains native tsconfig metadata for authored imports reached through generated modules",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const owned = path.join(root, "generated");
        const nested = path.join(root, "nested");
        yield* fs.makeDirectory(owned);
        yield* fs.makeDirectory(nested);
        const entry = path.join(root, "entry.ts");
        yield* fs.writeFileString(
          entry,
          'export { default } from "./generated/value";',
        );
        yield* fs.writeFileString(
          path.join(owned, "value.ts"),
          'export default require("../nested/leaf");',
        );
        yield* fs.writeFileString(
          path.join(nested, "leaf.ts"),
          "module.exports = { value: 1 };",
        );
        const config = path.join(nested, "tsconfig.json");
        yield* fs.writeFileString(
          config,
          '{ "compilerOptions": { "strict": true } }',
        );
        yield* Effect.gen(function* () {
          const queue = yield* observe;
          const first = yield* Compilation.runJob(Bundler.compile(entry));
          const strict = yield* first.exit;
          expect(yield* fs.readFileString(fileURLToPath(strict.url))).toContain(
            '"use strict";',
          );
          yield* Queue.take(queue);
          yield* fs.writeFileString(
            config,
            '{ "compilerOptions": { "strict": false } }',
          );
          expect((yield* Queue.take(queue)).affectedRoots).toEqual([entry]);
          const second = yield* Compilation.runJob(Bundler.compile(entry));
          const loose = yield* second.exit;
          expect(
            yield* fs.readFileString(fileURLToPath(loose.url)),
          ).not.toContain('"use strict";');
        }).pipe(
          Effect.provide(Compilation.layer({ ownedDirectories: [owned] })),
        );
      }).pipe(Effect.scoped, Effect.timeout("10 seconds")),
  );

  it.effect(
    "uses canonical identities for symlinked entries and generated ownership",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const real = path.join(root, "real");
        const alias = path.join(root, "alias");
        yield* fs.makeDirectory(path.join(real, "generated"), {
          recursive: true,
        });
        yield* fs.symlink(real, alias);
        const entry = path.join(real, "entry.ts");
        const generated = path.join(real, "generated", "value.ts");
        yield* fs.writeFileString(
          entry,
          'export { default } from "./generated/value";',
        );
        yield* fs.writeFileString(generated, "export default 1;");
        yield* Effect.gen(function* () {
          const queue = yield* observe;
          const result = yield* Compilation.runJob(
            compileAndLoad(path.join(alias, "entry.ts")),
          );
          const artifact = yield* result.exit;
          const revision = yield* Queue.take(queue);
          expect(revision.affectedRoots).toEqual([entry]);
          expect(CompilationState.acknowledged(revision, result.receipts)).toBe(
            true,
          );
          expect(
            yield* Bundler.directlyImports(artifact, entry, generated),
          ).toBe(true);
          yield* fs.writeFileString(generated, "export default 2;");
          expect(
            yield* Queue.take(queue).pipe(Effect.timeoutOption("400 millis")),
          ).toEqual(Option.none());
        }).pipe(
          Effect.provide(
            Compilation.layer({
              ownedDirectories: [path.join(alias, "generated")],
            }),
          ),
        );
      }).pipe(Effect.scoped, Effect.timeout("10 seconds")),
  );
  it.effect(
    "preserves inline source-map locations after copying artifacts",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const entry = path.join(root, "entry.ts");
        yield* fs.writeFileString(entry, "export default 42;");
        yield* Effect.gen(function* () {
          const result = yield* Compilation.runJob(Bundler.compile(entry));
          const artifact = yield* result.exit;
          const contents = yield* fs.readFileString(
            fileURLToPath(artifact.url),
          );
          const encoded =
            /sourceMappingURL=data:application\/json;base64,([^\n]+)/.exec(
              contents,
            )?.[1];
          expect(encoded).toBeDefined();
          const map = yield* Schema.decodeEffect(
            Schema.fromJsonString(
              Schema.Struct({
                sourceRoot: Schema.String,
                sources: Schema.Array(Schema.String),
              }),
            ),
          )(Buffer.from(encoded ?? "", "base64").toString());
          expect(new URL(map.sources[0] ?? "", map.sourceRoot).href).toBe(
            pathToFileURL(entry).href,
          );
        }).pipe(Effect.provide(Compilation.layer({ ownedDirectories: [] })));
      }).pipe(Effect.scoped),
  );
  it.effect(
    "reports incompatible nested external scopes instead of resolving the wrong package",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const nested = path.join(root, "nested");
        for (const directory of [root, nested]) {
          const dependency = path.join(directory, "node_modules", "dependency");
          yield* fs.makeDirectory(dependency, { recursive: true });
          yield* fs.writeFileString(
            path.join(dependency, "package.json"),
            '{ "type": "module", "exports": "./index.js" }',
          );
          yield* fs.writeFileString(
            path.join(dependency, "index.js"),
            "export default 1;",
          );
          yield* fs.writeFileString(
            path.join(directory, "entry.ts"),
            'export { default } from "dependency";',
          );
        }
        yield* Effect.gen(function* () {
          const first = path.join(root, "entry.ts");
          const second = path.join(nested, "entry.ts");
          const queue = yield* observe;
          const job = yield* Compilation.runJob(
            Bundler.withBatch([first, second], Bundler.compile(first)),
          );
          const result = yield* Effect.result(job.exit);
          expect(Result.isFailure(result)).toBe(true);
          if (Result.isFailure(result))
            expect(result.failure.cause).toMatchObject({
              errors: expect.arrayContaining([
                expect.objectContaining({
                  text: expect.stringContaining("different package scope"),
                }),
              ]),
            });
          expect(job.receipts).toEqual([]);
          expect(job.failedReceipts).toHaveLength(1);
          expect(job.failedReceipts[0]?.roots).toEqual([first]);
          expect(
            CompilationState.unacknowledgedRoots(
              yield* Queue.take(queue),
              job.failedReceipts,
            ),
          ).toEqual([second]);
        }).pipe(Effect.provide(Compilation.layer({ ownedDirectories: [] })));
      }).pipe(Effect.scoped),
  );
  it.effect(
    "does not acknowledge an unevaluated edit during compile-only verification",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const entry = path.join(root, "entry.ts");
        yield* fs.writeFileString(entry, "export default 1;");
        yield* Effect.gen(function* () {
          const queue = yield* observe;
          const first = yield* Compilation.runJob(Bundler.bundle(entry));
          yield* first.exit;
          yield* Queue.take(queue);
          yield* fs.writeFileString(entry, "export default 2;");
          const changed = yield* Queue.take(queue);
          const verification = yield* Compilation.runJob(
            Bundler.compile(entry),
          );
          const artifact = yield* verification.exit;
          expect(artifact.origin?.roots).toEqual([entry]);
          expect(verification.receipts).toEqual([]);
          expect(
            CompilationState.unacknowledgedRoots(changed, [
              ...first.receipts,
              ...verification.receipts,
            ]),
          ).toEqual([entry]);
          yield* Queue.take(queue);
          yield* fs.writeFileString(entry, "export default 3;");
          const later = yield* Queue.take(queue);
          const evaluated = yield* Compilation.runJob(
            CompiledModule.load(artifact),
          );
          expect((yield* evaluated.exit).module.default).toBe(2);
          expect(
            CompilationState.unacknowledgedRoots(changed, evaluated.receipts),
          ).toEqual([]);
          expect(
            CompilationState.unacknowledgedRoots(later, evaluated.receipts),
          ).toEqual([entry]);
        }).pipe(Effect.provide(Compilation.layer({ ownedDirectories: [] })));
      }).pipe(Effect.scoped, Effect.timeout("10 seconds")),
  );
});
