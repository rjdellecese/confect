import * as BunServices from "@effect/platform-bun/BunServices";
import { expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import {
  checkPackContents,
  decodePackedFiles,
  packedFiles,
  packProblems,
  publishedPackages,
} from "./checkPackContents";

const runTest = <A, E>(effect: Effect.Effect<A, E, BunServices.BunServices>) =>
  Effect.runPromise(effect.pipe(Effect.provide(BunServices.layer)));

test("allows built runtime files and rejects a vacuous pack", () => {
  expect(
    packProblems(["package.json", "dist/index.js", "dist/index.d.ts"]),
  ).toEqual([]);
  expect(packProblems(["package.json"])).toEqual([
    {
      path: "dist/",
      reason: "no build output packed—did this run before `pnpm build`?",
    },
  ]);
});

test("denies every class of unwanted packed file without changing inputs", () => {
  const files = [
    "dist/index.js",
    "dist/cache.tsbuildinfo",
    "dist/node_modules/x/index.js",
    "coverage/index.html",
    "dist/file.test.ts",
    "dist/file.spec.cjs",
    "dist/__tests__/fixture.js",
    ".env",
    "dist/.env.local",
    ".DS_Store",
    "dist/build.log",
    "tsconfig.json",
    "dist/tsconfig.src.json",
  ];
  const before = [...files];
  expect(packProblems(files).map(({ path }) => path)).toEqual(files.slice(1));
  expect(files).toEqual(before);
});

test("decodes npm output and rejects malformed or empty responses", () =>
  runTest(
    Effect.gen(function* () {
      expect(
        yield* decodePackedFiles(
          "pkg",
          '[{"files":[{"path":"dist/index.js"}]}]',
        ),
      ).toEqual(["dist/index.js"]);
      for (const output of ["{", "[]", '[{"files":[{"path":42}]}]']) {
        const error = yield* decodePackedFiles("pkg", output).pipe(Effect.flip);
        expect(error._tag).toBe("InvalidPackOutput");
        expect(error.directory).toBe("pkg");
      }
    }),
  ));

test("discovers only published packages with readable valid manifests", () =>
  runTest(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped({
        prefix: "confect-pack-discovery-",
      });
      for (const [name, manifest] of [
        ["public", "{}"],
        ["private", '{"private":true}'],
        ["invalid", "{"],
        ["missing", undefined],
      ] as const) {
        const directory = path.join(root, name);
        yield* fs.makeDirectory(directory);
        if (manifest !== undefined)
          yield* fs.writeFileString(
            path.join(directory, "package.json"),
            manifest,
          );
      }
      yield* fs.writeFileString(path.join(root, "not-a-directory"), "ignored");
      expect(yield* publishedPackages(root)).toEqual([
        path.join(root, "public"),
      ]);
    }).pipe(Effect.scoped),
  ));

test(
  "checks real npm dry runs and aggregates failures across packages",
  () =>
    runTest(
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped({
          prefix: "confect-pack-check-",
        });
        for (const name of ["one", "two"]) {
          const directory = path.join(root, name);
          yield* fs.makeDirectory(path.join(directory, "dist"), {
            recursive: true,
          });
          yield* fs.writeFileString(
            path.join(directory, "package.json"),
            `{"name":"${name}","version":"1.0.0","files":["dist"]}`,
          );
          yield* fs.writeFileString(
            path.join(directory, "dist", "index.js"),
            "export {};\n",
          );
        }
        yield* checkPackContents(root);
        yield* fs.writeFileString(
          path.join(root, "one", "dist", "cache.tsbuildinfo"),
          "cache",
        );
        yield* fs.remove(path.join(root, "two", "dist"), { recursive: true });
        const error = yield* checkPackContents(root).pipe(Effect.flip);
        expect(error._tag).toBe("InvalidPackContents");
        if (error._tag === "InvalidPackContents") {
          expect(error.packages).toHaveLength(2);
          expect(
            error.packages
              .flatMap(({ problems }) =>
                problems.map((problem) => problem.path),
              )
              .sort(),
          ).toEqual(["dist/", "dist/cache.tsbuildinfo"]);
        }
        yield* fs.writeFileString(path.join(root, "one", "package.json"), "{");
        expect(
          (yield* packedFiles(path.join(root, "one")).pipe(Effect.flip))._tag,
        ).toBe("NpmPackError");
      }).pipe(Effect.scoped),
    ),
  20000,
);
