import { afterEach, describe, expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { vi } from "vitest";
import * as RspackInputs from "../src/RspackInputs.ts";

type Adapter = ReturnType<typeof RspackInputs.make>;
type Method = RspackInputs.Observation["method"];

const temporary = Effect.acquireRelease(
  Effect.promise(() =>
    fs.promises.mkdtemp(path.join(os.tmpdir(), "rspack-inputs-")),
  ),
  (root) =>
    Effect.promise(() =>
      fs.promises.rm(root, { recursive: true, force: true }),
    ),
);

const call = (adapter: Adapter, method: Method, name: string) =>
  Effect.callback<unknown, NodeJS.ErrnoException>((resume) => {
    const operation:
      | ((
          name: string,
          callback: (
            error: NodeJS.ErrnoException | null,
            value?: unknown,
          ) => void,
        ) => void)
      | undefined = adapter.fileSystem[method];
    if (operation === undefined) return resume(Effect.die("Missing operation"));
    operation(name, (error, value) => {
      resume(error ? Effect.fail(error) : Effect.succeed(value));
    });
  });

const expectChanged = (
  capture: RspackInputs.Capture,
  method: Method,
  name: string,
) =>
  Effect.gen(function* () {
    const result = yield* Effect.result(capture.validate);
    expect(Result.isFailure(result)).toBe(true);
    if (Result.isFailure(result)) {
      expect(result.failure).toMatchObject({
        _tag: "RspackInputsChanged",
        method,
        path: name,
      });
    }
  });

afterEach(() => vi.restoreAllMocks());

describe("RspackInputs", () => {
  it.effect(
    "hides scoped artifacts without hiding authored directory changes",
    () =>
      Effect.gen(function* () {
        const root = yield* temporary;
        const adapter = RspackInputs.make({ hideArtifacts: true });
        yield* call(adapter, "stat", root);
        yield* call(adapter, "readdir", root);
        const captured = yield* adapter.capture;
        const artifact = path.join(root, ".confect-artifacts-probe");
        yield* Effect.promise(() => fs.promises.mkdir(artifact));
        yield* captured.validate;
        const hidden = yield* Effect.result(
          call(RspackInputs.make({ hideArtifacts: true }), "stat", artifact),
        );
        expect(hidden).toMatchObject({
          _tag: "Failure",
          failure: { code: "ENOENT" },
        });
        yield* Effect.promise(() =>
          fs.promises.rm(artifact, { recursive: true }),
        );
        yield* captured.validate;
        yield* Effect.promise(() =>
          fs.promises.writeFile(
            path.join(root, "authored.ts"),
            "export default 1",
          ),
        );
        yield* expectChanged(captured, "stat", root);
      }).pipe(Effect.scoped),
  );

  it.effect("retains directory identity in the artifact-filtered view", () =>
    Effect.gen(function* () {
      const root = yield* temporary;
      const directory = path.join(root, "source");
      yield* Effect.promise(() => fs.promises.mkdir(directory));
      const adapter = RspackInputs.make({ hideArtifacts: true });
      yield* call(adapter, "stat", directory);
      const captured = yield* adapter.capture;
      yield* Effect.promise(() =>
        fs.promises.rename(directory, path.join(root, "old")),
      );
      yield* Effect.promise(() => fs.promises.mkdir(directory));
      yield* expectChanged(captured, "stat", directory);
    }).pipe(Effect.scoped),
  );

  it.effect(
    "captures all six default callback forms and replays them without atime self-invalidation",
    () =>
      Effect.gen(function* () {
        const root = yield* temporary;
        const source = path.join(root, "source.ts");
        const link = path.join(root, "alias.ts");
        yield* Effect.promise(() =>
          fs.promises.writeFile(source, "export default 42"),
        );
        yield* Effect.promise(() => fs.promises.symlink(source, link));
        const adapter = RspackInputs.make();
        const bytes = yield* call(adapter, "readFile", source);
        expect(Buffer.isBuffer(bytes)).toBe(true);
        yield* call(adapter, "stat", source);
        yield* call(adapter, "lstat", link);
        yield* call(adapter, "readlink", link);
        yield* call(adapter, "realpath", link);
        yield* call(adapter, "readdir", root);
        const capture = yield* adapter.capture;
        expect(capture.observations.map((item) => item.method)).toEqual([
          "readFile",
          "stat",
          "lstat",
          "readlink",
          "realpath",
          "readdir",
        ]);
        expect(capture.observations[0].fingerprint).toContain('"sha256"');
        expect(capture.observations[0].fingerprint).toContain(source);
        expect(capture.observations[1].fingerprint).toContain('"ino"');
        expect(capture.observations[1].fingerprint).not.toContain('"atime');
        yield* capture.validate;
        yield* capture.validate;
      }).pipe(Effect.scoped),
  );

  it.effect("detects changed bytes with equal size and restored mtime", () =>
    Effect.gen(function* () {
      const root = yield* temporary;
      const source = path.join(root, "source.ts");
      yield* Effect.promise(() => fs.promises.writeFile(source, "one"));
      const before = yield* Effect.promise(() => fs.promises.stat(source));
      const adapter = RspackInputs.make();
      yield* call(adapter, "readFile", source);
      const capture = yield* adapter.capture;
      yield* Effect.promise(() => fs.promises.writeFile(source, "two"));
      yield* Effect.promise(() =>
        fs.promises.utimes(source, before.atime, before.mtime),
      );
      const after = yield* Effect.promise(() => fs.promises.stat(source));
      expect(after.size).toBe(before.size);
      expect(after.mtime.getTime()).toBe(before.mtime.getTime());
      yield* expectChanged(capture, "readFile", source);
    }).pipe(Effect.scoped),
  );

  it.effect.each([
    "readFile",
    "stat",
    "lstat",
    "readlink",
    "realpath",
  ] as const)("detects missing-to-file changes observed by %s", (method) =>
    Effect.gen(function* () {
      const root = yield* temporary;
      const source = path.join(root, "missing.ts");
      const adapter = RspackInputs.make();
      const missing = yield* Effect.result(call(adapter, method, source));
      expect(Result.isFailure(missing)).toBe(true);
      if (Result.isFailure(missing))
        expect(missing.failure.code).toBe("ENOENT");
      const capture = yield* adapter.capture;
      yield* capture.validate;
      yield* Effect.promise(() => fs.promises.writeFile(source, "present"));
      yield* expectChanged(capture, method, source);
    }).pipe(Effect.scoped),
  );

  it.effect("detects directory membership changes", () =>
    Effect.gen(function* () {
      const root = yield* temporary;
      const adapter = RspackInputs.make();
      yield* call(adapter, "readdir", root);
      const capture = yield* adapter.capture;
      yield* Effect.promise(() =>
        fs.promises.writeFile(path.join(root, "new.ts"), "new"),
      );
      yield* expectChanged(capture, "readdir", root);
    }).pipe(Effect.scoped),
  );

  it.effect.each(["readFile", "realpath", "readlink", "lstat"] as const)(
    "detects symlink retargeting observed by %s",
    (method) =>
      Effect.gen(function* () {
        const root = yield* temporary;
        const first = path.join(root, "first.ts");
        const second = path.join(root, "second.ts");
        const link = path.join(root, "alias.ts");
        yield* Effect.promise(() => fs.promises.writeFile(first, "same"));
        yield* Effect.promise(() => fs.promises.writeFile(second, "same"));
        yield* Effect.promise(() => fs.promises.symlink(first, link));
        const adapter = RspackInputs.make();
        yield* call(adapter, method, link);
        const capture = yield* adapter.capture;
        yield* Effect.promise(() => fs.promises.unlink(link));
        yield* Effect.promise(() => fs.promises.symlink(second, link));
        yield* expectChanged(capture, method, link);
      }).pipe(Effect.scoped),
  );

  it.effect.each(["stat", "lstat"] as const)(
    "detects replacement identities observed by %s",
    (method) =>
      Effect.gen(function* () {
        const root = yield* temporary;
        const source = path.join(root, "input");
        const replacement = path.join(root, "replacement");
        yield* Effect.promise(() => fs.promises.writeFile(source, "same"));
        const before = yield* Effect.promise(() => fs.promises.stat(source));
        const adapter = RspackInputs.make();
        yield* call(adapter, method, source);
        const capture = yield* adapter.capture;
        yield* Effect.promise(() => fs.promises.writeFile(replacement, "same"));
        yield* Effect.promise(() =>
          fs.promises.utimes(replacement, before.atime, before.mtime),
        );
        yield* Effect.promise(() => fs.promises.rename(replacement, source));
        const after = yield* Effect.promise(() => fs.promises.stat(source));
        expect(after.ino).not.toBe(before.ino);
        expect(after.size).toBe(before.size);
        expect(after.mtime.getTime()).toBe(before.mtime.getTime());
        yield* expectChanged(capture, method, source);
      }).pipe(Effect.scoped),
  );

  it.effect.each(["stat", "lstat"] as const)(
    "detects file-to-directory kind changes observed by %s",
    (method) =>
      Effect.gen(function* () {
        const root = yield* temporary;
        const source = path.join(root, "input");
        yield* Effect.promise(() => fs.promises.writeFile(source, ""));
        const adapter = RspackInputs.make();
        yield* call(adapter, method, source);
        const capture = yield* adapter.capture;
        yield* Effect.promise(() => fs.promises.unlink(source));
        yield* Effect.promise(() => fs.promises.mkdir(source));
        yield* expectChanged(capture, method, source);
      }).pipe(Effect.scoped),
  );

  it.effect(
    "rejects differing repeated acquisition results and cannot publish the receipt",
    () =>
      Effect.gen(function* () {
        const root = yield* temporary;
        const source = path.join(root, "source.ts");
        yield* Effect.promise(() => fs.promises.writeFile(source, "one"));
        const adapter = RspackInputs.make();
        yield* call(adapter, "readFile", source);
        yield* Effect.promise(() => fs.promises.writeFile(source, "two"));
        const repeated = yield* Effect.result(
          call(adapter, "readFile", source),
        );
        expect(Result.isFailure(repeated)).toBe(true);
        if (Result.isFailure(repeated))
          expect(repeated.failure).toBeInstanceOf(RspackInputs.Changed);
        const capture = yield* Effect.result(adapter.capture);
        expect(Result.isFailure(capture)).toBe(true);
        if (Result.isFailure(capture))
          expect(capture.failure).toBeInstanceOf(RspackInputs.Changed);
      }).pipe(Effect.scoped),
  );

  it.effect(
    "seals observations, deduplicates equal requests, and hashes bytes before returning them",
    () =>
      Effect.gen(function* () {
        const root = yield* temporary;
        const source = path.join(root, "source.ts");
        yield* Effect.promise(() => fs.promises.writeFile(source, "original"));
        const adapter = RspackInputs.make();
        const bytes = yield* call(adapter, "readFile", source);
        if (Buffer.isBuffer(bytes)) bytes.fill(0);
        yield* call(adapter, "readFile", source);
        const capture = yield* adapter.capture;
        expect(capture.observations).toHaveLength(1);
        const fingerprint = capture.observations[0].fingerprint;
        expect(yield* adapter.capture).toBe(capture);
        const realpath = vi.spyOn(fs.promises, "realpath");
        const late = yield* Effect.result(call(adapter, "readFile", source));
        expect(Result.isFailure(late)).toBe(true);
        if (Result.isFailure(late))
          expect(late.failure).toMatchObject({ reason: "Sealed" });
        expect(realpath).not.toHaveBeenCalled();
        expect(capture.observations).toHaveLength(1);
        yield* capture.validate;
        expect(capture.observations[0].fingerprint).toBe(fingerprint);
      }).pipe(Effect.scoped),
  );

  it.effect(
    "fails closed when capture is requested with an unfinished operation",
    () =>
      Effect.gen(function* () {
        const root = yield* temporary;
        const source = path.join(root, "source.ts");
        yield* Effect.promise(() => fs.promises.writeFile(source, "original"));
        const delayed = Promise.withResolvers<string>();
        vi.spyOn(fs.promises, "realpath").mockReturnValueOnce(delayed.promise);
        const adapter = RspackInputs.make();
        const completed = Promise.withResolvers<NodeJS.ErrnoException | null>();
        adapter.fileSystem.readFile(source, (error) =>
          completed.resolve(error),
        );
        const pending = yield* Effect.result(adapter.capture);
        expect(Result.isFailure(pending)).toBe(true);
        if (Result.isFailure(pending))
          expect(pending.failure).toMatchObject({ reason: "PendingRequests" });
        delayed.resolve(source);
        expect(yield* Effect.promise(() => completed.promise)).toMatchObject({
          reason: "Sealed",
        });
        const retried = yield* Effect.result(adapter.capture);
        expect(Result.isFailure(retried)).toBe(true);
      }).pipe(Effect.scoped),
  );

  it.effect(
    "rejects options overloads and descriptor paths instead of bypassing the receipt",
    () =>
      Effect.gen(function* () {
        const adapter = RspackInputs.make();
        const realpath = vi.spyOn(fs.promises, "realpath");
        const unsupported =
          yield* Effect.callback<NodeJS.ErrnoException | null>((resume) => {
            adapter.fileSystem.readFile("nonexistent", "utf8", (error) =>
              resume(Effect.succeed(error)),
            );
          });
        expect(unsupported).toMatchObject({ reason: "UnsupportedRequest" });
        const descriptor = yield* Effect.callback<NodeJS.ErrnoException | null>(
          (resume) => {
            adapter.fileSystem.readFile(42, (error) =>
              resume(Effect.succeed(error)),
            );
          },
        );
        expect(descriptor).toMatchObject({ reason: "UnsupportedRequest" });
        expect(realpath).not.toHaveBeenCalled();
        expect(Result.isFailure(yield* Effect.result(adapter.capture))).toBe(
          true,
        );
      }),
  );

  it.effect(
    "poisons capture when an unsupported callback-free form is attempted",
    () =>
      Effect.gen(function* () {
        const adapter = RspackInputs.make();
        expect(() =>
          Reflect.apply(adapter.fileSystem.readFile, undefined, [
            "nonexistent",
          ]),
        ).toThrow(RspackInputs.Failed);
        const capture = yield* Effect.result(adapter.capture);
        expect(Result.isFailure(capture)).toBe(true);
        if (Result.isFailure(capture))
          expect(capture.failure).toMatchObject({ reason: "CallbackRequired" });
      }),
  );

  it.effect.each([
    "readFile",
    "stat",
    "lstat",
    "readlink",
    "realpath",
    "readdir",
  ] as const)(
    "denies a nonexistent protected basename before any %s I/O",
    (method) =>
      Effect.gen(function* () {
        const root = yield* temporary;
        const realpath = vi.spyOn(fs.promises, "realpath");
        const open = vi.spyOn(fs.promises, "open");
        const result = yield* Effect.result(
          call(RspackInputs.make(), method, path.join(root, ".env.local")),
        );
        expect(Result.isFailure(result)).toBe(true);
        if (Result.isFailure(result))
          expect(result.failure).toMatchObject({ reason: "ProtectedPath" });
        expect(realpath).not.toHaveBeenCalled();
        expect(open).not.toHaveBeenCalled();
      }).pipe(Effect.scoped),
  );

  it.effect(
    "denies realpath aliases before opening their bytes using an innocuous policy fixture",
    () =>
      Effect.gen(function* () {
        const root = yield* temporary;
        const blocked = path.join(root, "denied-fixture");
        const alias = path.join(root, "alias.ts");
        yield* Effect.promise(() =>
          fs.promises.writeFile(blocked, "innocuous fixture"),
        );
        yield* Effect.promise(() => fs.promises.symlink(blocked, alias));
        const open = vi.spyOn(fs.promises, "open");
        const adapter = RspackInputs.make({
          deniedBasenames: ["denied-fixture"],
        });
        const result = yield* Effect.result(call(adapter, "readFile", alias));
        expect(Result.isFailure(result)).toBe(true);
        if (Result.isFailure(result))
          expect(result.failure).toMatchObject({ reason: "ProtectedRealpath" });
        expect(open).not.toHaveBeenCalled();
        expect(Result.isFailure(yield* Effect.result(adapter.capture))).toBe(
          true,
        );
      }).pipe(Effect.scoped),
  );

  it.effect(
    "does not follow a canonical final symlink substituted between realpath and open",
    () =>
      Effect.gen(function* () {
        const root = yield* temporary;
        const source = path.join(root, "source.ts");
        const blocked = path.join(root, "denied-fixture");
        yield* Effect.promise(() => fs.promises.writeFile(source, "original"));
        yield* Effect.promise(() =>
          fs.promises.writeFile(blocked, "innocuous fixture"),
        );
        const originalOpen = fs.promises.open;
        let opened = 0;
        vi.spyOn(fs.promises, "open").mockImplementationOnce(
          async (name, flags, mode) => {
            await fs.promises.unlink(source);
            await fs.promises.symlink(blocked, source);
            const handle = await originalOpen(name, flags, mode);
            opened++;
            return handle;
          },
        );
        const adapter = RspackInputs.make({
          deniedBasenames: ["denied-fixture"],
        });
        const result = yield* Effect.result(call(adapter, "readFile", source));
        expect(Result.isFailure(result)).toBe(true);
        if (Result.isFailure(result)) expect(result.failure.code).toBe("ELOOP");
        expect(opened).toBe(0);
        const capture = yield* adapter.capture;
        const validation = yield* Effect.result(capture.validate);
        expect(Result.isFailure(validation)).toBe(true);
        if (Result.isFailure(validation))
          expect(validation.failure).toMatchObject({
            reason: "ProtectedRealpath",
          });
      }).pipe(Effect.scoped),
  );

  it.effect("checks the opened descriptor path before reading any bytes", () =>
    Effect.gen(function* () {
      const root = yield* temporary;
      const source = path.join(root, "source.ts");
      yield* Effect.promise(() =>
        fs.promises.writeFile(source, "innocuous fixture"),
      );
      const originalRealpath = fs.promises.realpath;
      const originalOpen = fs.promises.open;
      let reads = 0;
      vi.spyOn(fs.promises, "realpath").mockImplementation((name, options) =>
        String(name).startsWith("/proc/self/fd/")
          ? Promise.resolve(path.join(root, "denied-fixture"))
          : originalRealpath(name, options),
      );
      vi.spyOn(fs.promises, "open").mockImplementation(
        async (name, flags, mode) => {
          const handle = await originalOpen(name, flags, mode);
          const readFile = handle.readFile.bind(handle);
          vi.spyOn(handle, "readFile").mockImplementation((options) => {
            reads++;
            return readFile(options);
          });
          return handle;
        },
      );
      const adapter = RspackInputs.make({
        deniedBasenames: ["denied-fixture"],
      });
      const result = yield* Effect.result(call(adapter, "readFile", source));
      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result))
        expect(result.failure).toMatchObject({ reason: "ProtectedDescriptor" });
      expect(reads).toBe(0);
    }).pipe(Effect.scoped),
  );
});
