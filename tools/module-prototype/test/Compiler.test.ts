import { describe, expect, it } from "@effect/vitest";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Result from "effect/Result";
import * as Compiler from "../src/Compiler.ts";

describe("Compiler", () => {
  it.effect(
    "keeps generated inputs inert while honoring authored exceptions",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const generated = path.join(root, "generated");
        const inert = path.join(generated, "result.ts");
        const authored = path.join(generated, "authored.ts");
        const entry = path.join(root, "entry.ts");
        yield* fs.makeDirectory(generated);
        yield* fs.writeFileString(
          entry,
          'import inert from "./generated/result"; import { answer } from "./generated/authored"; export const probe = [inert, answer];',
        );
        yield* fs.writeFileString(inert, "not valid TypeScript");
        yield* fs.writeFileString(authored, "export const answer = 42;");
        const compiler = yield* Compiler.make(entry, {
          ownedDirectories: [generated],
          authoredFiles: [authored],
        });
        const prepared = yield* compiler.compile;
        expect(
          prepared.snapshot.modules.find((module) => module.file === inert)?.id,
        ).toBe(`confect-generated:${inert}`);
        expect(
          prepared.snapshot.modules.find((module) => module.file === authored)
            ?.id,
        ).toBe(authored);
        yield* prepared.validate;
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("rejects protected realpath aliases before reading them", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const entry = path.join(root, "entry.ts");
      const protectedFile = path.join(root, ".env.local");
      yield* fs.writeFileString(protectedFile, "fixture only");
      yield* fs.symlink(protectedFile, path.join(root, "alias.ts"));
      yield* fs.writeFileString(
        entry,
        'import value from "./alias"; export default value;',
      );
      const reads: string[] = [];
      const outcome = yield* Effect.gen(function* () {
        const compiler = yield* Compiler.make(entry);
        return yield* compiler.compile;
      }).pipe(
        Effect.provideService(FileSystem.FileSystem, {
          ...fs,
          readFile: (file) => {
            reads.push(file);
            return fs.readFile(file);
          },
        }),
        Effect.result,
      );
      expect(Result.isFailure(outcome)).toBe(true);
      expect(reads).not.toContain(protectedFile);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "does not publish a graph whose bytes change during acquisition",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const entry = path.join(root, "entry.ts");
        const helper = path.join(root, "helper.ts");
        yield* fs.writeFileString(
          entry,
          'export { value as default } from "./helper";',
        );
        yield* fs.writeFileString(helper, "export const value = 1;");
        let changed = false;
        yield* Effect.gen(function* () {
          const compiler = yield* Compiler.make(entry);
          const prepared = yield* compiler.compile;
          yield* prepared.validate;
          expect(changed).toBe(true);
          expect(
            prepared.snapshot.modules.find((module) => module.file === helper)
              ?.code,
          ).toContain("value = 2");
        }).pipe(
          Effect.provideService(FileSystem.FileSystem, {
            ...fs,
            readFile: (file) =>
              Effect.gen(function* () {
                const bytes = yield* fs.readFile(file);
                if (file === helper && !changed) {
                  changed = true;
                  yield* fs.writeFileString(helper, "export const value = 2;");
                }
                return bytes;
              }),
          }),
        );
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "reuses transformations only after reading and validating current bytes",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        const entry = path.join(root, "entry.ts");
        const helper = path.join(root, "helper.ts");
        yield* fs.writeFileString(
          entry,
          'export { answer as default } from "@shared";',
        );
        yield* fs.writeFileString(helper, "export const answer = 1;");
        yield* fs.writeFileString(
          path.join(root, "tsconfig.json"),
          '{"compilerOptions":{"paths":{"@shared":["./helper.ts"]}}}',
        );
        const compiler = yield* Compiler.make(entry);
        const first = yield* compiler.compile;
        const original = structuredClone(first.snapshot);
        const before = yield* compiler.metrics;
        yield* first.validate;
        yield* compiler.compile;
        const unchanged = yield* compiler.metrics;
        expect(unchanged.transforms).toBe(before.transforms);
        expect(unchanged.reads).toBeGreaterThan(before.reads);
        expect(unchanged.hits).toBeGreaterThan(before.hits);
        expect(first.snapshot.modules).toHaveLength(2);
        yield* fs.writeFileString(helper, "export const answer = 2;");
        const stale = yield* first.validate.pipe(Effect.result);
        expect(stale).toMatchObject({
          _tag: "Failure",
          failure: { _tag: "PrototypeInputsChanged", paths: [helper] },
        });
        const second = yield* compiler.compile;
        expect((yield* compiler.metrics).transforms).toBe(
          before.transforms + 1,
        );
        expect(second.snapshot).not.toEqual(first.snapshot);
        expect(first.snapshot).toEqual(original);
        yield* fs.writeFileString(helper, "export const answer = ;");
        expect(
          Result.isFailure(yield* compiler.compile.pipe(Effect.result)),
        ).toBe(true);
        yield* fs.writeFileString(helper, "export const answer = 3;");
        yield* (yield* compiler.compile).validate;
        yield* fs.writeFileString(
          path.join(root, "tsconfig.json"),
          '{"compilerOptions":{"paths":{"@shared":["./other.ts"]}}}',
        );
        expect(
          Result.isFailure(yield* compiler.compile.pipe(Effect.result)),
        ).toBe(true);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("rejects lexical protected filenames before reading them", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      const entry = path.join(root, "entry.ts");
      yield* fs.writeFileString(
        entry,
        'import value from "./.env.local"; export default value;',
      );
      const reads: string[] = [];
      const result = yield* Effect.gen(function* () {
        const compiler = yield* Compiler.make(entry);
        return yield* compiler.compile;
      }).pipe(
        Effect.provideService(FileSystem.FileSystem, {
          ...fs,
          readFile: (file) => {
            reads.push(file);
            return fs.readFile(file);
          },
        }),
        Effect.result,
      );
      expect(Result.isFailure(result)).toBe(true);
      expect(reads.some((file) => path.basename(file) === ".env.local")).toBe(
        false,
      );
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
