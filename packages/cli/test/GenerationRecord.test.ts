import * as GenerationRecord from "@confect/cli/GenerationRecord";
import * as GenerationSnapshot from "@confect/cli/GenerationSnapshot";
import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, expect, layer } from "@effect/vitest";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as PlatformError from "effect/PlatformError";
import * as Ref from "effect/Ref";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Project from "./integration/Project";

const snapshot = (name: string) =>
  Effect.fromResult(
    GenerationSnapshot.parse([
      [
        "notes.spec.ts",
        {
          runtime: "Convex",
          functions: [{ name, provenance: "Confect" }],
          groups: {},
        },
      ],
    ]),
  );
const relativeFile = `confect/_generated/${GenerationRecord.filename}`;

layer(NodeServices.layer, { excludeTestServices: true })(
  "GenerationRecord",
  (it) => {
    it.effect("roundtrips parsed topology with deterministic bytes", () =>
      Effect.gen(function* () {
        const original = yield* snapshot("list");
        const record = GenerationRecord.make(original);
        const serialized = yield* Effect.fromResult(
          GenerationRecord.encode(record),
        );
        const parsed = GenerationRecord.parse(serialized);
        assert(parsed._tag === "Loaded");
        expect(
          yield* Effect.fromResult(GenerationRecord.encode(parsed.record)),
        ).toBe(serialized);
        expect(parsed.record.version).toBe(1);
        expect(
          GenerationSnapshot.functionPaths(parsed.record.snapshot),
        ).toEqual(GenerationSnapshot.functionPaths(original));
        expect(serialized).not.toContain("projectRoot");
      }),
    );

    it.effect("canonicalizes ordering without changing the parsed input", () =>
      Effect.gen(function* () {
        const tree = {
          runtime: "Convex",
          functions: [
            { name: "z", provenance: "Confect" },
            { name: "a", provenance: "Convex" },
          ],
          groups: {},
        };
        const entries = [
          ["z.spec.ts", tree],
          ["a.spec.ts", tree],
        ];
        const serialize = Schema.encodeEffect(
          Schema.fromJsonString(Schema.Unknown),
        );
        const before = yield* serialize(entries);
        const first = yield* Effect.fromResult(
          GenerationSnapshot.parse(entries),
        );
        const second = yield* Effect.fromResult(
          GenerationSnapshot.parse([
            ["a.spec.ts", { ...tree, functions: tree.functions.toReversed() }],
            ["z.spec.ts", { ...tree, functions: tree.functions.toReversed() }],
          ]),
        );
        expect(GenerationRecord.encode(GenerationRecord.make(first))).toEqual(
          GenerationRecord.encode(GenerationRecord.make(second)),
        );
        expect(yield* serialize(entries)).toBe(before);
      }),
    );

    it.effect.each([
      ["{", "Malformed"],
      ['{"version":1}', "Malformed"],
      ['{"version":2}', "Unsupported"],
      ['{"version":"1","snapshot":[]}', "Malformed"],
      ['{"version":1,"snapshot":[["../bad.spec.ts",{}]]}', "Malformed"],
      [
        '{"version":1,"snapshot":[["notes.spec.ts",{"runtime":"Convex","functions":[{"name":"a","provenance":"Confect"},{"name":"a","provenance":"Confect"}],"groups":{}}]]}',
        "Malformed",
      ],
    ])("classifies %s as %s", ([serialized, tag]) =>
      Effect.sync(() => {
        expect(GenerationRecord.parse(serialized)._tag).toBe(tag);
      }),
    );

    it.effect(
      "treats absent generated directories and records as missing",
      () =>
        Effect.gen(function* () {
          const project = yield* Project.make;
          const fs = yield* FileSystem.FileSystem;
          expect(yield* project.provide(GenerationRecord.read)).toEqual(
            GenerationRecord.History.Missing(),
          );
          yield* fs.makeDirectory(`${project.root}/confect/_generated`);
          expect(yield* project.provide(GenerationRecord.read)).toEqual(
            GenerationRecord.History.Missing(),
          );
        }).pipe(Effect.scoped),
    );

    it.effect("writes a record and skips identical replacement", () =>
      Effect.gen(function* () {
        const project = yield* Project.make;
        const fs = yield* FileSystem.FileSystem;
        const original = yield* snapshot("list");
        yield* project.provide(GenerationRecord.write(original));
        const before = yield* fs.stat(`${project.root}/${relativeFile}`);
        yield* project.provide(GenerationRecord.write(original)).pipe(
          Effect.provideService(FileSystem.FileSystem, {
            ...fs,
            open: () =>
              Effect.die("identical record allocated a temporary file"),
            rename: () => Effect.die("identical record was replaced"),
            writeFileString: () => Effect.die("identical record was rewritten"),
          }),
        );
        const after = yield* fs.stat(`${project.root}/${relativeFile}`);
        expect(after.mtime).toEqual(before.mtime);
        expect(after.ino).toEqual(before.ino);
        const loaded = yield* project.provide(GenerationRecord.read);
        expect(loaded._tag).toBe("Loaded");
        expect(
          yield* fs.readDirectory(`${project.root}/confect/_generated`),
        ).toEqual([GenerationRecord.filename]);
      }).pipe(Effect.scoped),
    );

    it.effect.each(["write", "rename"] as const)(
      "preserves prior bytes after failed %s",
      (operation) =>
        Effect.gen(function* () {
          const project = yield* Project.make;
          const fs = yield* FileSystem.FileSystem;
          yield* project.provide(
            GenerationRecord.write(yield* snapshot("before")),
          );
          const file = `${project.root}/${relativeFile}`;
          const before = yield* fs.readFileString(file);
          const failure = PlatformError.systemError({
            _tag: "PermissionDenied",
            module: "FileSystem",
            method: operation,
            pathOrDescriptor: file,
          });
          const result = yield* project
            .provide(GenerationRecord.write(yield* snapshot("after")))
            .pipe(
              Effect.provideService(FileSystem.FileSystem, {
                ...fs,
                writeFileString: (path, content, options) =>
                  operation === "write"
                    ? fs
                        .writeFileString(path, content.slice(0, 10), options)
                        .pipe(Effect.andThen(Effect.fail(failure)))
                    : fs.writeFileString(path, content, options),
                rename: (from, to) =>
                  operation === "rename"
                    ? Effect.fail(failure)
                    : fs.rename(from, to),
              }),
              Effect.result,
            );
          assert(Result.isFailure(result));
          expect(result.failure).toBe(failure);
          expect(yield* fs.readFileString(file)).toBe(before);
          expect(
            yield* fs.readDirectory(`${project.root}/confect/_generated`),
          ).toEqual([GenerationRecord.filename]);
        }).pipe(Effect.scoped),
    );

    it.effect("cleans a partially written temporary file on interruption", () =>
      Effect.gen(function* () {
        const project = yield* Project.make;
        const fs = yield* FileSystem.FileSystem;
        yield* project.provide(
          GenerationRecord.write(yield* snapshot("before")),
        );
        const file = `${project.root}/${relativeFile}`;
        const before = yield* fs.readFileString(file);
        const writing = yield* Deferred.make<void>();
        const fiber = yield* project
          .provide(GenerationRecord.write(yield* snapshot("after")))
          .pipe(
            Effect.provideService(FileSystem.FileSystem, {
              ...fs,
              writeFileString: (path, content) =>
                fs
                  .writeFileString(path, content.slice(0, 10))
                  .pipe(
                    Effect.andThen(Deferred.succeed(writing, undefined)),
                    Effect.andThen(Effect.never),
                  ),
            }),
            Effect.forkScoped,
          );
        yield* Deferred.await(writing);
        yield* Fiber.interrupt(fiber);
        expect(yield* fs.readFileString(file)).toBe(before);
        expect(
          yield* fs.readDirectory(`${project.root}/confect/_generated`),
        ).toEqual([GenerationRecord.filename]);
      }).pipe(Effect.scoped),
    );

    it.effect.each(["confect", "confect/_generated", relativeFile])(
      "rejects a static alias at %s before content I/O",
      (relative) =>
        Effect.gen(function* () {
          const project = yield* Project.make;
          const fs = yield* FileSystem.FileSystem;
          const target = `${project.root}/untouched`;
          yield* fs.makeDirectory(`${project.root}/confect/_generated`);
          const alias = `${project.root}/${relative}`;
          yield* fs.remove(alias, { recursive: true, force: true });
          yield* fs.symlink(target, alias);
          const guarded = {
            ...fs,
            readFileString: () => Effect.die("read content through an alias"),
            writeFileString: () => Effect.die("wrote content through an alias"),
          };
          for (const operation of [
            GenerationRecord.read,
            GenerationRecord.write(yield* snapshot("list")),
          ]) {
            const result = yield* project
              .provide(operation)
              .pipe(
                Effect.provideService(FileSystem.FileSystem, guarded),
                Effect.result,
              );
            assert(Result.isFailure(result));
            expect(result.failure).toEqual(
              new GenerationRecord.PathError({
                path: alias,
                reason: "SymbolicLink",
              }),
            );
          }
          expect(yield* fs.exists(target)).toBe(false);
        }).pipe(Effect.scoped),
    );

    it.effect.each([
      { reason: "PermissionDenied", code: "EACCES" },
      { reason: "Unknown", code: "EIO" },
    ] as const)(
      "propagates $reason observations without content I/O",
      ({ reason, code }) =>
        Effect.gen(function* () {
          const project = yield* Project.make;
          const fs = yield* FileSystem.FileSystem;
          yield* project.provide(
            GenerationRecord.write(yield* snapshot("list")),
          );
          const failure = PlatformError.systemError({
            _tag: reason,
            module: "FileSystem",
            method: "readLink",
            cause: { code },
          });
          const observed = yield* Ref.make(false);
          for (const operation of [
            GenerationRecord.read,
            GenerationRecord.write(yield* snapshot("after")),
          ]) {
            const result = yield* project.provide(operation).pipe(
              Effect.provideService(FileSystem.FileSystem, {
                ...fs,
                readLink: () =>
                  Ref.set(observed, true).pipe(
                    Effect.andThen(Effect.fail(failure)),
                  ),
                realPath: () =>
                  Effect.die("realPath followed a failed observation"),
                readFileString: () =>
                  Effect.die("read followed a failed observation"),
                writeFileString: () =>
                  Effect.die("write followed a failed observation"),
              }),
              Effect.result,
            );
            assert(Result.isFailure(result));
            expect(result.failure).toBe(failure);
          }
          expect(yield* Ref.get(observed)).toBe(true);
        }).pipe(Effect.scoped),
    );

    it.effect(
      "retains prior history when work becomes dirty before replacement",
      () =>
        Effect.gen(function* () {
          const project = yield* Project.make;
          const fs = yield* FileSystem.FileSystem;
          yield* project.provide(
            GenerationRecord.write(yield* snapshot("before")),
          );
          const file = `${project.root}/${relativeFile}`;
          const before = yield* fs.readFileString(file);
          const prepared = yield* Ref.make(false);
          const dirty = Effect.gen(function* () {
            expect(yield* Ref.get(prepared)).toBe(true);
            return false;
          });
          yield* project
            .provide(GenerationRecord.write(yield* snapshot("after"), dirty))
            .pipe(
              Effect.provideService(FileSystem.FileSystem, {
                ...fs,
                writeFileString: (...args) =>
                  fs
                    .writeFileString(...args)
                    .pipe(Effect.andThen(Ref.set(prepared, true))),
                rename: () =>
                  Effect.die("dirty work replaced successful history"),
              }),
            );
          expect(yield* fs.readFileString(file)).toBe(before);
          expect(
            yield* fs.readDirectory(`${project.root}/confect/_generated`),
          ).toEqual([GenerationRecord.filename]);
        }).pipe(Effect.scoped),
    );

    it.effect("rejects physical escapes before content I/O", () =>
      Effect.gen(function* () {
        const project = yield* Project.make;
        const fs = yield* FileSystem.FileSystem;
        yield* project.provide(GenerationRecord.write(yield* snapshot("list")));
        const directory = `${project.root}/confect/_generated`;
        const result = yield* project.provide(GenerationRecord.read).pipe(
          Effect.provideService(FileSystem.FileSystem, {
            ...fs,
            realPath: (file) =>
              file === directory
                ? Effect.succeed(`${project.root}/elsewhere`)
                : fs.realPath(file),
            readFileString: () =>
              Effect.die("read content outside expected directory"),
          }),
          Effect.result,
        );
        assert(Result.isFailure(result));
        expect(result.failure).toEqual(
          new GenerationRecord.PathError({
            path: directory,
            reason: "EscapedPath",
          }),
        );
      }).pipe(Effect.scoped),
    );

    it.effect.each(["realPath", "stat", "readFileString"] as const)(
      "propagates %s failures rather than recovering as missing history",
      (method) =>
        Effect.gen(function* () {
          const project = yield* Project.make;
          const fs = yield* FileSystem.FileSystem;
          yield* project.provide(
            GenerationRecord.write(yield* snapshot("list")),
          );
          const failure = PlatformError.systemError({
            _tag: "PermissionDenied",
            module: "FileSystem",
            method,
          });
          const result = yield* project.provide(GenerationRecord.read).pipe(
            Effect.provideService(FileSystem.FileSystem, {
              ...fs,
              realPath: (path) =>
                method === "realPath"
                  ? Effect.fail(failure)
                  : fs.realPath(path),
              stat: (path) =>
                method === "stat" ? Effect.fail(failure) : fs.stat(path),
              readFileString: (path) =>
                method === "readFileString"
                  ? Effect.fail(failure)
                  : fs.readFileString(path),
            }),
            Effect.result,
          );
          assert(Result.isFailure(result));
          expect(result.failure).toBe(failure);
        }).pipe(Effect.scoped),
    );

    it.effect(
      "rejects a directory occupying the record path before content I/O",
      () =>
        Effect.gen(function* () {
          const project = yield* Project.make;
          const fs = yield* FileSystem.FileSystem;
          const file = `${project.root}/${relativeFile}`;
          yield* fs.makeDirectory(file, { recursive: true });
          const result = yield* project.provide(GenerationRecord.read).pipe(
            Effect.provideService(FileSystem.FileSystem, {
              ...fs,
              readFileString: () => Effect.die("read a non-file record"),
            }),
            Effect.result,
          );
          assert(Result.isFailure(result));
          expect(result.failure).toEqual(
            new GenerationRecord.PathError({
              path: file,
              reason: "UnexpectedType",
            }),
          );
        }).pipe(Effect.scoped),
    );
  },
);
