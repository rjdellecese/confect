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
    it.effect(
      "guards native legacy PnP markers even without a selected config",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const root = yield* fs.makeTempDirectoryScoped();
          const inputs = yield* CompilationInputs.make("Once");
          const entry = path.join(root, "entry.ts");
          expect(yield* inputs.configuration(entry)).toBeUndefined();
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
            yield* inputs.configuration(path.join(nested, "entry.ts")),
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
        ) =>
          actual.discover(sourceFile, observe, conditions, observeRuntime).pipe(
            Effect.tap(() => observe?.(marker, "File") ?? Effect.void),
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
