import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, expect, layer } from "@effect/vitest";
import { vi } from "vitest";
import * as Effect from "effect/Effect";
import * as Deferred from "effect/Deferred";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import * as PlatformError from "effect/PlatformError";
import * as Stream from "effect/Stream";
import * as CompilationInputs from "@confect/cli/CompilationInputs";
import * as CompilationConfig from "@confect/cli/CompilationConfig";

vi.mock("@confect/cli/CompilationConfig", (importOriginal) =>
  importOriginal<typeof CompilationConfig>().then((original) => ({
    ...original,
    discover: vi.fn(original.discover),
  })),
);

layer(NodeServices.layer, { excludeTestServices: true })(
  "CompilationInputs",
  (it) => {
    it.effect.each(["Once", "Watch"] as const)(
      "limits cross-directory package sharing to one-shot compilation in %s mode",
      (mode) =>
        Effect.gen(function* () {
          const inputs = yield* CompilationInputs.make(mode);
          expect(yield* inputs.canSharePackageLookups).toBe(mode === "Once");
        }).pipe(Effect.scoped),
    );

    it.effect.each(["package.json", "node_modules"])(
      "guards a shared resolution scope against later %s creation",
      (name) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped();
          const inputs = yield* CompilationInputs.make("Once");
          yield* inputs.trackSource(path.join(root, "entry.ts"));
          expect(yield* inputs.canShareResolution(root)).toBe(true);
          const added = path.join(root, name);
          if (name === "node_modules") yield* fs.makeDirectory(added);
          else yield* fs.writeFileString(added, "{}");
          expect(yield* Effect.flip(inputs.check)).toMatchObject({
            _tag: "CompilationRestartRequired",
            paths: [added],
          });
          yield* fs.remove(added, { recursive: true });
          expect(
            yield* Effect.flip(inputs.canShareResolution(root)),
          ).toMatchObject({ _tag: "CompilationRestartRequired" });
        }).pipe(Effect.scoped),
    );

    it.effect.each([
      ".pnp.cjs",
      ".pnp.js",
      ".pnp.loader.mjs",
      ".pnp.data.json",
    ])("does not share package lookups under an ancestor %s marker", (name) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const nested = path.join(root, "nested");
        yield* fs.makeDirectory(nested);
        yield* fs.writeFileString(path.join(root, name), "{}");
        const inputs = yield* CompilationInputs.make("Once");
        yield* inputs.trackSource(path.join(nested, "entry.ts"));
        expect(yield* inputs.canSharePackageLookups).toBe(false);
        expect(yield* inputs.canShareResolution(nested)).toBe(false);
      }).pipe(Effect.scoped),
    );

    it.effect.each(["Once", "Watch"] as const)(
      "shares fresh verification work across concurrent requests in %s mode",
      (mode) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped();
          const manifest = path.join(root, "package.json");
          yield* fs.writeFileString(manifest, "{}");
          let reads = 0;
          const inputs = yield* CompilationInputs.make(mode).pipe(
            Effect.provideService(FileSystem.FileSystem, {
              ...fs,
              watch: () => Stream.never,
              readFile: (file) => {
                if (file === manifest) reads++;
                return fs.readFile(file);
              },
            }),
          );
          yield* inputs.track([manifest]);
          reads = 0;
          yield* Effect.all(
            Array.from({ length: 390 }, () => inputs.checkFiles([manifest])),
            { concurrency: "unbounded" },
          );
          expect(reads).toBe(1);
          yield* inputs.checkFiles([manifest]);
          expect(reads).toBe(2);
          yield* fs.writeFileString(manifest, '{"changed":true}');
          expect(
            yield* Effect.flip(inputs.checkFiles([manifest])),
          ).toMatchObject({
            _tag: "CompilationRestartRequired",
            paths: [manifest],
          });
        }).pipe(Effect.scoped),
    );

    it.effect(
      "does not reuse a verification for requests arriving after its reads began",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped();
          const manifest = path.join(root, "package.json");
          yield* fs.writeFileString(manifest, '{"value":1}');
          const read = yield* Deferred.make<void>();
          const release = yield* Deferred.make<void>();
          let block = false;
          const inputs = yield* CompilationInputs.make("Once").pipe(
            Effect.provideService(FileSystem.FileSystem, {
              ...fs,
              readFile: (file) =>
                Effect.gen(function* () {
                  const contents = yield* fs.readFile(file);
                  if (file === manifest && block) {
                    block = false;
                    yield* Deferred.succeed(read, undefined);
                    yield* Deferred.await(release);
                  }
                  return contents;
                }),
            }),
          );
          yield* inputs.track([manifest]);
          block = true;
          const first = yield* inputs
            .checkFiles([manifest])
            .pipe(Effect.forkScoped);
          yield* Deferred.await(read);
          yield* fs.writeFileString(manifest, '{"value":2}');
          const later = yield* inputs
            .checkFiles([manifest])
            .pipe(Effect.result, Effect.forkScoped);
          yield* Effect.yieldNow;
          yield* Deferred.succeed(release, undefined);
          yield* Fiber.join(first);
          const result = yield* Fiber.join(later);
          assert(Result.isFailure(result));
          expect(result.failure).toMatchObject({
            _tag: "CompilationRestartRequired",
            paths: [manifest],
          });
        }).pipe(Effect.scoped),
    );

    it.effect(
      "verifies the union of concurrent subsets and full-check requests",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped();
          const files = ["a.json", "b.json", "c.json"].map((name) =>
            path.join(root, name),
          );
          for (const file of files) yield* fs.writeFileString(file, "{}");
          const reads: string[] = [];
          const inputs = yield* CompilationInputs.make("Once").pipe(
            Effect.provideService(FileSystem.FileSystem, {
              ...fs,
              readFile: (file) => {
                reads.push(file);
                return fs.readFile(file);
              },
            }),
          );
          yield* inputs.track(files);
          reads.length = 0;
          yield* Effect.all(
            [
              inputs.checkFiles([files[0]]),
              inputs.checkFiles([files[1], files[0]]),
              inputs.checkFiles(),
            ],
            { concurrency: "unbounded" },
          );
          expect(reads.toSorted()).toEqual(files.toSorted());
        }).pipe(Effect.scoped),
    );

    it.effect(
      "keeps other verification requests alive when one caller is interrupted",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped();
          const file = path.join(root, "package.json");
          yield* fs.writeFileString(file, "{}");
          const read = yield* Deferred.make<void>();
          const release = yield* Deferred.make<void>();
          let block = false;
          const inputs = yield* CompilationInputs.make("Once").pipe(
            Effect.provideService(FileSystem.FileSystem, {
              ...fs,
              readFile: (candidate) =>
                Effect.gen(function* () {
                  if (candidate === file && block) {
                    block = false;
                    yield* Deferred.succeed(read, undefined);
                    yield* Deferred.await(release);
                  }
                  return yield* fs.readFile(candidate);
                }),
            }),
          );
          yield* inputs.track([file]);
          block = true;
          const first = yield* inputs
            .checkFiles([file])
            .pipe(Effect.forkScoped);
          yield* Deferred.await(read);
          const second = yield* inputs
            .checkFiles([file])
            .pipe(Effect.forkScoped);
          yield* Fiber.interrupt(first);
          yield* Deferred.succeed(release, undefined);
          yield* Fiber.join(second);
          yield* inputs.checkFiles([file]);
        }).pipe(Effect.scoped),
    );

    it.effect(
      "propagates typed observation failures to every queued verifier",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped();
          const file = path.join(root, "package.json");
          yield* fs.writeFileString(file, "{}");
          let reject = false;
          const failure = PlatformError.systemError({
            _tag: "PermissionDenied",
            module: "FileSystem",
            method: "readFile",
            pathOrDescriptor: file,
          });
          const inputs = yield* CompilationInputs.make("Once").pipe(
            Effect.provideService(FileSystem.FileSystem, {
              ...fs,
              readFile: (candidate) =>
                candidate === file && reject
                  ? Effect.fail(failure)
                  : fs.readFile(candidate),
            }),
          );
          yield* inputs.track([file]);
          reject = true;
          const results = yield* Effect.all(
            Array.from({ length: 20 }, () =>
              Effect.result(inputs.checkFiles([file])),
            ),
            { concurrency: "unbounded" },
          );
          for (const result of results) {
            assert(Result.isFailure(result));
            assert(result.failure._tag === "BundlerError");
            expect(result.failure.cause).toBe(failure);
          }
          reject = false;
          const sticky = yield* Effect.flip(inputs.checkFiles([file]));
          assert(sticky._tag === "BundlerError");
          expect(sticky.cause).toBe(failure);
        }).pipe(Effect.scoped),
    );

    it.effect.each(["base", "selection"] as const)(
      "guards same-size %s edits without mutating the resolved configuration",
      (kind) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped();
          const entry = path.join(root, "entry.tsx");
          const config = path.join(root, "tsconfig.json");
          const first = path.join(root, "first.json");
          const other = path.join(root, "other.json");
          yield* fs.writeFileString(config, '{"extends":"./first.json"}');
          yield* fs.writeFileString(
            first,
            '{"compilerOptions":{"jsxFactory":"first.h"}}',
          );
          yield* fs.writeFileString(
            other,
            '{"compilerOptions":{"jsxFactory":"other.h"}}',
          );
          const inputs = yield* CompilationInputs.make("Once");
          const initial = yield* inputs.configuration(entry);
          expect(initial.tsconfigRaw.compilerOptions?.jsxFactory).toBe(
            "first.h",
          );
          expect(yield* inputs.configuration(entry)).toBe(initial);
          const changed = kind === "base" ? first : config;
          const before = yield* fs.readFile(changed);
          yield* fs.writeFileString(
            changed,
            kind === "base"
              ? '{"compilerOptions":{"jsxFactory":"other.h"}}'
              : '{"extends":"./other.json"}',
          );
          expect((yield* fs.readFile(changed)).length).toBe(before.length);
          expect(yield* Effect.flip(inputs.check)).toMatchObject({
            _tag: "CompilationRestartRequired",
            paths: [changed],
          });
          expect(initial.tsconfigRaw.compilerOptions?.jsxFactory).toBe(
            "first.h",
          );
          const fresh = yield* CompilationInputs.make("Once");
          const selected = yield* fresh.configuration(entry);
          expect(selected.tsconfigRaw.compilerOptions?.jsxFactory).toBe(
            "other.h",
          );
          if (kind === "selection") {
            expect(selected.files).toContain(other);
            expect(selected.files).not.toContain(first);
          }
          expect(yield* Effect.flip(inputs.configuration(entry))).toMatchObject(
            {
              _tag: "CompilationRestartRequired",
              paths: [changed],
            },
          );
        }).pipe(Effect.scoped),
    );
    it.effect.each(
      ["configuration", "base"].flatMap((target) =>
        ["Missing", "Directory"].map((kind) => ({ target, kind })),
      ),
    )(
      "rejects a transient $kind classification for the $target before caching",
      ({ target, kind }) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped();
          const configuration = path.join(root, "tsconfig.json");
          const base = path.join(root, "base.json");
          yield* fs.writeFileString(configuration, '{"extends":"./base.json"}');
          yield* fs.writeFileString(base, "{}");
          const file = target === "configuration" ? configuration : base;
          let inspections = 0;
          let directory = false;
          const inputs = yield* CompilationInputs.make("Once").pipe(
            Effect.provideService(FileSystem.FileSystem, {
              ...fs,
              realPath: (candidate) => {
                if (candidate === file && ++inspections === 4) {
                  if (kind === "Missing")
                    return Effect.fail(
                      PlatformError.systemError({
                        _tag: "NotFound",
                        module: "FileSystem",
                        method: "realPath",
                      }),
                    );
                  directory = true;
                }
                return fs.realPath(candidate);
              },
              stat: (candidate) =>
                fs.stat(candidate).pipe(
                  Effect.map((info) => {
                    if (candidate !== file || !directory) return info;
                    directory = false;
                    return { ...info, type: "Directory" as const };
                  }),
                ),
            }),
          );
          expect(
            yield* Effect.flip(
              inputs.configuration(path.join(root, "entry.ts")),
            ),
          ).toMatchObject({
            _tag: "CompilationRestartRequired",
            paths: [file],
          });
          expect(inspections).toBe(4);
          expect((yield* fs.stat(file)).type).toBe("File");
          expect(yield* Effect.flip(inputs.check)).toMatchObject({
            _tag: "CompilationRestartRequired",
            paths: [file],
          });
        }).pipe(Effect.scoped),
    );
    it.effect(
      "verifies a consumed file classification against its acquired missing baseline",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped();
          const file = path.join(root, "tsconfig.json");
          yield* fs.writeFileString(file, "{}");
          let inspections = 0;
          const inputs = yield* CompilationInputs.make("Once").pipe(
            Effect.provideService(FileSystem.FileSystem, {
              ...fs,
              realPath: (candidate) => {
                if (candidate === file && [2, 3].includes(++inspections))
                  return Effect.fail(
                    PlatformError.systemError({
                      _tag: "NotFound",
                      module: "FileSystem",
                      method: "realPath",
                    }),
                  );
                return fs.realPath(candidate);
              },
            }),
          );
          expect(
            yield* Effect.flip(
              inputs.configuration(path.join(root, "entry.ts")),
            ),
          ).toMatchObject({
            _tag: "CompilationRestartRequired",
            paths: [file],
          });
          expect(inspections).toBe(3);
          expect((yield* fs.stat(file)).type).toBe("File");
        }).pipe(Effect.scoped),
    );
    it.effect(
      "classifies a discovery-time alias retarget as a sticky restart",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped();
          const first = path.join(root, "first.json");
          const second = path.join(root, "second.json");
          const alias = path.join(root, "tsconfig.json");
          yield* fs.writeFileString(first, "{}");
          yield* fs.writeFileString(second, "{}");
          yield* fs.symlink(first, alias);
          let inspections = 0;
          const inputs = yield* CompilationInputs.make("Once").pipe(
            Effect.provideService(FileSystem.FileSystem, {
              ...fs,
              realPath: (file) =>
                Effect.gen(function* () {
                  if (file === alias && ++inspections === 7) {
                    yield* fs.remove(alias);
                    yield* fs.symlink(second, alias);
                  }
                  return yield* fs.realPath(file);
                }),
            }),
          );
          expect(
            yield* Effect.flip(
              inputs.configuration(path.join(root, "entry.ts")),
            ),
          ).toMatchObject({
            _tag: "CompilationRestartRequired",
            paths: [alias],
          });
          expect(inspections).toBe(7);
          expect(yield* inputs.pending).toMatchObject({
            _tag: "Some",
            value: { paths: [alias] },
          });
          yield* fs.remove(alias);
          yield* fs.symlink(first, alias);
          expect(yield* Effect.flip(inputs.check)).toMatchObject({
            _tag: "CompilationRestartRequired",
            paths: [alias],
          });
        }).pipe(Effect.scoped),
    );
    it.effect.each(["configuration", "manifest", "base", "alias"] as const)(
      "rejects ABA bytes delivered by the %s reader before parsing or caching",
      (kind) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped();
          const config = path.join(root, "tsconfig.json");
          const base = path.join(root, "base.json");
          const manifest = path.join(root, "node_modules/fixture/package.json");
          yield* fs.makeDirectory(path.dirname(manifest), { recursive: true });
          yield* fs.writeFileString(
            base,
            '{"compilerOptions":{"jsxFactory":"first.h"}}',
          );
          yield* fs.writeFileString(manifest, '{"exports":"./base.json"}');
          yield* fs.writeFileString(
            path.join(path.dirname(manifest), "base.json"),
            "{}",
          );
          if (kind === "alias") yield* fs.symlink(base, config);
          else
            yield* fs.writeFileString(
              config,
              kind === "manifest"
                ? '{"extends":"fixture"}'
                : '{"extends":"./base.json"}',
            );
          const target =
            kind === "manifest"
              ? manifest
              : kind === "base" || kind === "alias"
                ? base
                : config;
          const original = yield* fs.readFile(target);
          const delivered = new TextEncoder().encode(
            "!".repeat(original.length),
          );
          let reads = 0;
          const trigger = kind === "alias" ? 5 : 3;
          const inputs = yield* CompilationInputs.make("Once").pipe(
            Effect.provideService(FileSystem.FileSystem, {
              ...fs,
              readFile: (file) => {
                if (file === target && ++reads === trigger)
                  return Effect.succeed(delivered);
                return fs.readFile(file);
              },
            }),
          );
          const outcome = yield* Effect.flip(
            inputs.configuration(path.join(root, "entry.ts")),
          );
          expect(outcome).toMatchObject({ _tag: "CompilationRestartRequired" });
          expect(reads).toBe(trigger);
          expect(yield* fs.readFile(target)).toEqual(original);
          expect(
            yield* Effect.flip(
              inputs.configuration(path.join(root, "entry.ts")),
            ),
          ).toMatchObject({ _tag: "CompilationRestartRequired" });
          expect(reads).toBe(trigger);
        }).pipe(Effect.scoped),
    );
    it.effect(
      "guards native legacy PnP markers even without a selected config",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped();
          const inputs = yield* CompilationInputs.make("Once");
          const entry = path.join(root, "entry.ts");
          expect(
            (yield* inputs.configuration(entry)).configuration,
          ).toBeUndefined();
          yield* inputs.trackSource(entry);
          const marker = path.join(root, ".pnp.js");
          yield* fs.writeFileString(marker, "module.exports = {};");
          expect(yield* Effect.flip(inputs.check)).toMatchObject({
            _tag: "CompilationRestartRequired",
            paths: [marker],
          });
        }).pipe(Effect.scoped),
    );
    it.effect.each(["Once", "Watch"] as const)(
      "guards nearer config creation without observing ignored source configs in %s mode",
      (mode) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped();
          const nested = path.join(root, "nested");
          const helper = path.join(root, "helper");
          yield* fs.makeDirectory(nested);
          yield* fs.makeDirectory(helper);
          const selected = path.join(root, "tsconfig.json");
          const ignored = path.join(helper, "tsconfig.json");
          const nearer = path.join(nested, "tsconfig.json");
          yield* fs.writeFileString(selected, "{}");
          yield* fs.writeFileString(ignored, "not JSON");
          const inputs = yield* CompilationInputs.make(mode);
          expect(
            (yield* inputs.configuration(path.join(nested, "entry.ts")))
              .configuration,
          ).toBe(selected);
          yield* inputs.trackSource(path.join(helper, "value.ts"));
          yield* fs.writeFileString(ignored, "still not JSON");
          yield* inputs.check;
          expect(yield* inputs.pending).toEqual(Option.none());
          yield* fs.writeFileString(nearer, "{}");
          const failure = yield* Effect.flip(inputs.check);
          expect(failure).toMatchObject({
            _tag: "CompilationRestartRequired",
            paths: [nearer],
          });
          yield* fs.remove(nearer);
          expect(
            yield* Effect.flip(
              inputs.configuration(path.join(nested, "entry.ts")),
            ),
          ).toMatchObject({
            _tag: "CompilationRestartRequired",
            paths: [nearer],
          });
        }).pipe(Effect.scoped),
    );
    it.effect.each([
      "replace",
      "remove",
      "changed-before-registration",
      "files-during-acquisition",
      "observation-failure",
    ] as const)("keeps runtime configuration %s changes sticky", (mode) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const entry = path.join(root, "entry.ts");
        const marker = path.join(root, ".pnp.cjs");
        yield* fs.writeFileString(marker, "initial");
        const initial = {};
        const active = yield* Ref.make<object | undefined>(
          mode === "changed-before-registration" ? {} : initial,
        );
        let changed = false;
        const current = Effect.gen(function* () {
          if (changed && mode === "files-during-acquisition")
            yield* fs.writeFileString(marker, "updated").pipe(
              Effect.mapError(
                (cause) =>
                  new CompilationConfig.DiscoveryFailed({
                    path: marker,
                    cause,
                  }),
              ),
            );
          if (changed && mode === "observation-failure")
            return yield* new CompilationConfig.DiscoveryFailed({
              path: marker,
              cause: "API observation failed",
            });
          return yield* Ref.get(active);
        });
        const discover = vi.mocked(CompilationConfig.discover);
        const original = discover.getMockImplementation();
        assert(original);
        const actual = yield* Effect.promise(() =>
          vi.importActual<typeof CompilationConfig>(
            "@confect/cli/CompilationConfig",
          ),
        );
        const implementation: typeof CompilationConfig.discover = (
          sourceFile,
          observe,
          conditions,
          observeRuntime,
          observeRead,
        ) =>
          actual
            .discover(
              sourceFile,
              observe,
              conditions,
              observeRuntime,
              observeRead,
            )
            .pipe(
              Effect.tap(
                () => observe?.(marker, "File", marker) ?? Effect.void,
              ),
              Effect.tap(
                () =>
                  observeRuntime?.({ path: marker, value: initial, current }) ??
                  Effect.void,
              ),
            );
        yield* Effect.acquireRelease(
          Effect.sync(() => discover.mockImplementation(implementation)),
          () => Effect.sync(() => discover.mockImplementation(original)),
        );
        const inputs = yield* CompilationInputs.make("Once");
        if (mode === "changed-before-registration") {
          expect(yield* Effect.flip(inputs.configuration(entry))).toMatchObject(
            {
              _tag: "CompilationRestartRequired",
              paths: [marker],
            },
          );
          return;
        }
        yield* inputs.configuration(entry);
        yield* inputs.check;
        changed = true;
        if (mode === "replace") yield* Ref.set(active, {});
        if (mode === "remove") yield* Ref.set(active, undefined);
        const failure = yield* Effect.flip(inputs.check);
        if (mode === "observation-failure")
          expect(failure).toMatchObject({
            _tag: "BundlerError",
            cause: { _tag: "CompilationConfigDiscoveryFailed" },
          });
        else
          expect(failure).toMatchObject({
            _tag: "CompilationRestartRequired",
            paths: [marker],
          });
        changed = false;
        yield* Ref.set(active, initial);
        yield* fs.writeFileString(marker, "initial");
        expect(yield* Effect.flip(inputs.ensure)).toEqual(failure);
      }).pipe(Effect.scoped),
    );
    it.effect("bounds concurrent scans while checking every known input", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const files = Array.from({ length: 40 }, (_, index) =>
          path.join(root, `missing-${index}.json`),
        );
        const blocked = yield* Ref.make(false);
        const active = yield* Ref.make(0);
        const checked = yield* Ref.make(0);
        const saturated = yield* Deferred.make<void>();
        const release = yield* Deferred.make<void>();
        const inputs = yield* CompilationInputs.make().pipe(
          Effect.provideService(FileSystem.FileSystem, {
            ...fs,
            watch: () => Stream.never,
            stat: (file) =>
              Effect.gen(function* () {
                if (!(yield* Ref.get(blocked))) return yield* fs.stat(file);
                return yield* Effect.acquireUseRelease(
                  Ref.updateAndGet(active, (count) => count + 1),
                  (count) =>
                    Effect.gen(function* () {
                      if (count === 16)
                        yield* Deferred.succeed(saturated, undefined);
                      yield* Deferred.await(release);
                      yield* Ref.update(checked, (value) => value + 1);
                      return yield* fs.stat(file);
                    }),
                  () => Ref.update(active, (count) => count - 1),
                );
              }),
          }),
        );
        yield* inputs.track(files);
        yield* Ref.set(blocked, true);
        const scanning = yield* inputs.check.pipe(Effect.forkScoped);
        yield* Deferred.await(saturated);
        expect(yield* Ref.get(active)).toBe(16);
        yield* Deferred.succeed(release, undefined);
        yield* Fiber.join(scanning);
        expect(yield* Ref.get(checked)).toBe(files.length);
        expect(yield* Ref.get(active)).toBe(0);
      }).pipe(Effect.scoped, Effect.timeout("10 seconds")),
    );

    it.effect("checks absent candidates without resolving every ancestor", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const files = Array.from({ length: 390 }, (_, index) =>
          path.join(root, `absent-${index}`, "package.json"),
        );
        const resolutions = yield* Ref.make(0);
        const observations = yield* Ref.make(0);
        const inputs = yield* CompilationInputs.make().pipe(
          Effect.provideService(FileSystem.FileSystem, {
            ...fs,
            watch: () => Stream.never,
            stat: (file) =>
              Ref.update(observations, (count) => count + 1).pipe(
                Effect.andThen(fs.stat(file)),
              ),
            realPath: (file) =>
              Ref.update(resolutions, (count) => count + 1).pipe(
                Effect.andThen(fs.realPath(file)),
              ),
          }),
        );
        yield* inputs.track(files);
        yield* Ref.set(observations, 0);
        yield* inputs.check;
        expect(yield* Ref.get(resolutions)).toBe(0);
        expect(yield* Ref.get(observations)).toBe(files.length);
        yield* fs.makeDirectory(path.dirname(files[0] ?? ""));
        yield* fs.writeFileString(files[0] ?? "", "{}");
        const changed = yield* Effect.result(inputs.check);
        expect(Result.isFailure(changed)).toBe(true);
        expect(yield* Ref.get(resolutions)).toBe(1);
      }).pipe(Effect.scoped),
    );

    it.effect.each(["direct", "alias", "named-alias"] as const)(
      "rejects forbidden observation inputs before any read: %s",
      (mode) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped();
          const secret = path.join(root, ".env.local");
          const ordinary = path.join(root, "ordinary.json");
          const alias = path.join(root, "package.json");
          if (mode === "named-alias") {
            yield* fs.writeFileString(ordinary, "{}");
            yield* fs.symlink(ordinary, secret);
          } else {
            yield* fs.writeFileString(
              secret,
              "fixture contents must not be read",
            );
            yield* fs.symlink(secret, alias);
          }
          const reads = yield* Ref.make(0);
          const inputs = yield* CompilationInputs.make().pipe(
            Effect.provideService(FileSystem.FileSystem, {
              ...fs,
              readFile: () =>
                Ref.update(reads, (value) => value + 1).pipe(
                  Effect.as(new Uint8Array()),
                ),
            }),
          );
          const result = yield* Effect.result(
            inputs.track([mode === "alias" ? alias : secret]),
          );
          expect(Result.isFailure(result)).toBe(true);
          if (Result.isFailure(result))
            expect(result.failure).toMatchObject({
              _tag: "BundlerError",
              cause: {
                _tag: "ResolutionInputObservationRejected",
                reason: "ForbiddenFile",
              },
            });
          expect(yield* Ref.get(reads)).toBe(0);
          expect(Result.isFailure(yield* Effect.result(inputs.ensure))).toBe(
            true,
          );
          expect(
            Result.isFailure(
              yield* Effect.result(Stream.runHead(inputs.events)),
            ),
          ).toBe(true);
          expect(yield* inputs.pending).toMatchObject({ _tag: "None" });
        }).pipe(Effect.scoped),
    );

    it.effect("reads the checked canonical path rather than its alias", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const real = path.join(root, "real.json");
        const alias = path.join(root, "alias.json");
        yield* fs.writeFileString(real, "{}");
        yield* fs.symlink(real, alias);
        const reads = yield* Ref.make<ReadonlyArray<string>>([]);
        const inputs = yield* CompilationInputs.make().pipe(
          Effect.provideService(FileSystem.FileSystem, {
            ...fs,
            watch: () => Stream.never,
            readFile: (file) =>
              Ref.update(reads, (files) => [...files, file]).pipe(
                Effect.andThen(fs.readFile(file)),
              ),
          }),
        );
        yield* inputs.track([alias]);
        expect(yield* Ref.get(reads)).toEqual([real, real]);
      }).pipe(Effect.scoped),
    );

    it.effect("distinguishes non-file candidates from missing inputs", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const directory = path.join(root, "package.json");
        yield* fs.makeDirectory(directory);
        const inputs = yield* CompilationInputs.make();
        const result = yield* Effect.result(inputs.track([directory]));
        expect(Result.isFailure(result)).toBe(true);
        if (Result.isFailure(result))
          expect(result.failure).toMatchObject({
            _tag: "BundlerError",
            cause: {
              _tag: "ResolutionInputObservationRejected",
              reason: "NotRegularFile",
            },
          });
        expect(yield* inputs.pending).toMatchObject({ _tag: "None" });
      }).pipe(Effect.scoped),
    );

    it.effect.each(["PermissionDenied", "BadResource"] as const)(
      "does not classify %s as a missing input",
      (reason) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const inputs = yield* CompilationInputs.make().pipe(
            Effect.provideService(FileSystem.FileSystem, {
              ...fs,
              realPath: () =>
                Effect.fail(
                  PlatformError.systemError({
                    _tag: reason,
                    module: "FileSystem",
                    method: "realPath",
                  }),
                ),
            }),
          );
          const result = yield* Effect.result(inputs.track(["package.json"]));
          expect(Result.isFailure(result)).toBe(true);
          if (Result.isFailure(result))
            expect(result.failure).toMatchObject({
              _tag: "BundlerError",
              cause: { _tag: "PlatformError", reason: { _tag: reason } },
            });
          expect(Result.isFailure(yield* Effect.result(inputs.ensure))).toBe(
            true,
          );
          expect(yield* inputs.pending).toMatchObject({ _tag: "None" });
        }).pipe(Effect.scoped),
    );

    it.effect(
      "observes lockfile creation and remains sticky after its contents are restored",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped();
          const inputs = yield* CompilationInputs.make();
          yield* inputs.trackSource(path.join(root, "entry.ts"));
          const events =
            yield* Queue.unbounded<CompilationInputs.RestartNotification>();
          yield* inputs.events.pipe(
            Stream.runForEach((event) => Queue.offer(events, event)),
            Effect.forkScoped,
          );
          const lockfile = path.join(root, "pnpm-lock.yaml");
          yield* fs.writeFileString(lockfile, "lockfileVersion: 9\n");
          expect((yield* Queue.take(events)).paths).toContain(lockfile);
          yield* fs.remove(lockfile);
          const checked = yield* Effect.result(inputs.check);
          expect(Result.isFailure(checked)).toBe(true);
          if (Result.isFailure(checked))
            expect(checked.failure._tag).toBe("CompilationRestartRequired");
        }).pipe(Effect.scoped, Effect.timeout("10 seconds")),
    );

    it.effect(
      "ignores ordinary source changes and identical metadata writes",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped();
          const manifest = path.join(root, "package.json");
          yield* fs.writeFileString(manifest, "{}");
          const inputs = yield* CompilationInputs.make();
          yield* inputs.trackSource(path.join(root, "entry.ts"));
          yield* fs.writeFileString(manifest, "{}");
          yield* fs.writeFileString(
            path.join(root, "entry.ts"),
            "export default 2;",
          );
          yield* inputs.check;
          expect(yield* inputs.pending).toMatchObject({ _tag: "None" });
        }).pipe(Effect.scoped),
    );

    it.effect("checks known inputs before asynchronous watch delivery", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const file = path.join(root, "compiler.json");
        yield* fs.writeFileString(file, "{}");
        const inputs = yield* CompilationInputs.make().pipe(
          Effect.provideService(FileSystem.FileSystem, {
            ...fs,
            watch: () => Stream.never,
          }),
        );
        yield* inputs.track([file]);
        yield* fs.writeFileString(file, '{"changed":true}');
        expect(Result.isFailure(yield* Effect.result(inputs.check))).toBe(true);
      }).pipe(Effect.scoped),
    );

    it.effect("closes every filesystem observer with its owning scope", () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const active = yield* Ref.make(0);
        yield* Effect.scoped(
          Effect.gen(function* () {
            const inputs = yield* CompilationInputs.make().pipe(
              Effect.provideService(FileSystem.FileSystem, {
                ...fs,
                watch: () =>
                  Stream.unwrap(
                    Ref.update(active, (count) => count + 1).pipe(
                      Effect.as(Stream.never),
                    ),
                  ).pipe(
                    Stream.ensuring(Ref.update(active, (count) => count - 1)),
                  ),
              }),
            );
            yield* inputs.trackSource(path.join(root, "entry.ts"));
            expect(yield* Ref.get(active)).toBeGreaterThan(0);
          }),
        );
        expect(yield* Ref.get(active)).toBe(0);
      }).pipe(Effect.scoped),
    );
    it.effect(
      "detects package symlink retargeting even when manifest bytes match",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped();
          const first = path.join(root, "first");
          const second = path.join(root, "second");
          const alias = path.join(root, "package");
          for (const directory of [first, second]) {
            yield* fs.makeDirectory(directory);
            yield* fs.writeFileString(
              path.join(directory, "package.json"),
              "{}",
            );
          }
          yield* fs.symlink(first, alias);
          const inputs = yield* CompilationInputs.make();
          yield* inputs.track([path.join(alias, "package.json")]);
          yield* fs.remove(alias);
          yield* fs.symlink(second, alias);
          expect(Result.isFailure(yield* Effect.result(inputs.check))).toBe(
            true,
          );
        }).pipe(Effect.scoped),
    );
    it.effect(
      "fails closed on observer errors without asking for another process",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped();
          const inputs = yield* CompilationInputs.make().pipe(
            Effect.provideService(FileSystem.FileSystem, {
              ...fs,
              watch: () =>
                Stream.fail(
                  PlatformError.systemError({
                    _tag: "PermissionDenied",
                    module: "FileSystem",
                    method: "watch",
                  }),
                ),
            }),
          );
          yield* Effect.result(inputs.trackSource(path.join(root, "entry.ts")));
          expect(
            Result.isFailure(
              yield* Effect.result(Stream.runHead(inputs.events)),
            ),
          ).toBe(true);
          expect(Result.isFailure(yield* Effect.result(inputs.check))).toBe(
            true,
          );
          expect(yield* inputs.pending).toMatchObject({ _tag: "None" });
        }).pipe(Effect.scoped),
    );
  },
);
