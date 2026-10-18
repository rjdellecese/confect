import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import * as PlatformError from "effect/PlatformError";
import * as Stream from "effect/Stream";
import * as CompilationInputs from "@confect/cli/CompilationInputs";

layer(NodeServices.layer, { excludeTestServices: true })(
  "CompilationInputs",
  (it) => {
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
