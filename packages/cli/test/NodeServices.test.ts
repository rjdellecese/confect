import * as NodePath from "@effect/platform-node/NodePath";
import * as PlatformNodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, expect, it } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as PlatformError from "effect/PlatformError";
import * as Result from "effect/Result";
import * as NodeServices from "@confect/cli/NodeServices";

describe("NodeServices", () => {
  it.effect("accepts canonical native results without a second traversal", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const calls: string[] = [];
      const fs = FileSystem.makeNoop({});
      const adapted = NodeServices.withNativeRealPath(
        fs,
        path,
        (file, done) => {
          calls.push(file);
          done(null, file);
        },
      );
      expect(yield* adapted.realPath("C:\\project\\nested\\..\\file.ts")).toBe(
        "C:\\project\\file.ts",
      );
      expect(calls).toEqual(["C:\\project\\file.ts"]);
      expect(adapted.readFile).toBe(fs.readFile);
      expect(adapted.realPath).not.toBe(fs.realPath);
      expect(
        (yield* Effect.exit(fs.realPath("C:\\project\\file.ts")))._tag,
      ).toBe("Failure");
    }).pipe(Effect.provide(NodePath.layerWin32)),
  );

  it.effect.each([
    {
      kind: "short name",
      file: "C:\\PROJEC~1\\file.ts",
      canonical: "C:\\project-long\\file.ts",
    },
    {
      kind: "case",
      file: "C:\\PROJECT\\file.ts",
      canonical: "C:\\project\\file.ts",
    },
    {
      kind: "link",
      file: "C:\\project\\alias.ts",
      canonical: "C:\\other\\target.ts",
    },
  ])("preserves the original $kind spelling", ({ file, canonical }) =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const calls: string[] = [];
      const fs = FileSystem.makeNoop({
        realPath: (input) =>
          Effect.sync(() => {
            calls.push(input);
            return "original result";
          }),
      });
      const adapted = NodeServices.withNativeRealPath(fs, path, (_file, done) =>
        done(null, canonical),
      );
      expect(yield* adapted.realPath(file)).toBe("original result");
      expect(calls).toEqual([file]);
    }).pipe(Effect.provide(NodePath.layerWin32)),
  );

  it.effect.each(["callback", "throw"] as const)(
    "preserves the authoritative error after native %s failure",
    (kind) =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const failure = PlatformError.systemError({
          _tag: "NotFound",
          module: "FileSystem",
          method: "realPath",
          pathOrDescriptor: "C:\\missing",
        });
        const fs = FileSystem.makeNoop({
          realPath: () => Effect.fail(failure),
        });
        const adapted = NodeServices.withNativeRealPath(fs, path, (_, done) => {
          const nativeFailure = { name: "Error", message: "native rejection" };
          if (kind === "throw") throw nativeFailure;
          done(nativeFailure, "");
        });
        expect(yield* Effect.exit(adapted.realPath("C:\\missing"))).toEqual(
          Exit.fail(failure),
        );
      }).pipe(Effect.provide(NodePath.layerWin32)),
  );

  it.effect(
    "probes again after a previously canonical path is retargeted",
    () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        let calls = 0;
        const fs = FileSystem.makeNoop({
          realPath: () => Effect.succeed("C:\\retargeted\\file.ts"),
        });
        const adapted = NodeServices.withNativeRealPath(
          fs,
          path,
          (file, done) => {
            calls++;
            done(null, calls === 1 ? file : "C:\\retargeted\\file.ts");
          },
        );
        expect(yield* adapted.realPath("C:\\project\\file.ts")).toBe(
          "C:\\project\\file.ts",
        );
        expect(yield* adapted.realPath("C:\\project\\file.ts")).toBe(
          "C:\\retargeted\\file.ts",
        );
        expect(calls).toBe(2);
      }).pipe(Effect.provide(NodePath.layerWin32)),
  );

  it.effect("does not start fallback work after interruption", () =>
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const started = yield* Deferred.make<void>();
      let complete: ((error: null, file: string) => void) | undefined;
      let fallbacks = 0;
      const fs = FileSystem.makeNoop({
        realPath: () =>
          Effect.sync(() => {
            fallbacks++;
            return "fallback";
          }),
      });
      const adapted = NodeServices.withNativeRealPath(fs, path, (_, done) => {
        complete = done;
        Deferred.doneUnsafe(started, Effect.void);
      });
      const fiber = yield* adapted
        .realPath("C:\\file.ts")
        .pipe(Effect.forkChild);
      yield* Deferred.await(started);
      yield* Fiber.interrupt(fiber);
      assert(complete);
      complete(null, "C:\\other.ts");
      yield* Effect.yieldNow;
      expect(Exit.hasInterrupts(yield* Fiber.await(fiber))).toBe(true);
      expect(fallbacks).toBe(0);
    }).pipe(Effect.provide(NodePath.layerWin32)),
  );

  it.live(
    "preserves real filesystem paths, aliases and invalid input errors",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const file = path.join(root, "file.ts");
        const alias = path.join(root, "alias.ts");
        yield* fs.writeFileString(file, "fixture");
        yield* fs.symlink(file, alias);
        const adapted = NodeServices.withNativeRealPath(fs, path);
        for (const input of [
          file,
          alias,
          path.join(root, "missing"),
          `${file}\0`,
        ]) {
          const original = yield* Effect.result(fs.realPath(input));
          const actual = yield* Effect.result(adapted.realPath(input));
          if (Result.isSuccess(original)) expect(actual).toEqual(original);
          else {
            assert(Result.isFailure(actual));
            const { cause: _cause, ...reason } = original.failure.reason;
            expect(actual.failure.reason).toMatchObject(reason);
          }
        }
      }).pipe(Effect.scoped, Effect.provide(PlatformNodeServices.layer)),
  );

  it.live(
    "provides the platform services without changing non-Windows paths",
    () =>
      Effect.gen(function* () {
        const original = yield* FileSystem.FileSystem.pipe(
          Effect.provide(PlatformNodeServices.layer),
        );
        const adapted = yield* FileSystem.FileSystem.pipe(
          Effect.provide(NodeServices.layer),
        );
        expect(adapted.readFile).toBe(original.readFile);
        if (process.platform !== "win32")
          expect(adapted.realPath).toBe(original.realPath);
        else expect(adapted.realPath).not.toBe(original.realPath);
      }),
  );
});
