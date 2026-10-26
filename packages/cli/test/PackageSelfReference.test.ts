import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Option from "effect/Option";
import * as Path from "effect/Path";
import * as PackageSelfReference from "@confect/cli/PackageSelfReference";

layer(NodeServices.layer)("PackageSelfReference", (it) => {
  it.effect(
    "matches the nearest exported name and stops at a nested package boundary",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        yield* fs.makeDirectory(path.join(root, "nested"));
        yield* fs.makeDirectory(path.join(root, "boundary"));
        yield* fs.writeFileString(
          path.join(root, "package.json"),
          '{"name":"@fixture/backend.v1","exports":{"./*":"./*.ts"}}',
        );
        yield* fs.writeFileString(
          path.join(root, "boundary/package.json"),
          '{"name":"@fixture/nested"}',
        );
        const found = yield* PackageSelfReference.discover(
          path.join(root, "nested"),
        );
        assert(Option.isSome(found));
        const pattern = PackageSelfReference.toRegExp(found.value);
        expect(pattern.test("@fixture/backend.v1")).toBe(true);
        expect(pattern.test("@fixture/backend.v1/leaf")).toBe(true);
        expect(pattern.test("@fixture/backendXv1")).toBe(false);
        expect(pattern.test("@fixture/backend.v1-extra")).toBe(false);
        expect(
          yield* PackageSelfReference.discover(path.join(root, "boundary")),
        ).toEqual(Option.none());
      }).pipe(Effect.scoped),
  );

  it.effect.each([
    "{}",
    '{"name":"fixture"}',
    '{"exports":{}}',
    '{"name":"fixture","exports":null}',
    '{"name":"","exports":{}}',
  ])("does not invent a self-reference for %s", (metadata) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const root = yield* fs.makeTempDirectoryScoped();
      yield* fs.writeFileString(path.join(root, "package.json"), metadata);
      expect(yield* PackageSelfReference.discover(root)).toEqual(Option.none());
    }).pipe(Effect.scoped),
  );

  it.effect.each(["{", '{"name":42,"exports":{}}'])(
    "reports malformed nearest package metadata instead of falling through: %s",
    (metadata) =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = yield* fs.makeTempDirectoryScoped();
        yield* fs.writeFileString(path.join(root, "package.json"), metadata);
        expect(
          yield* Effect.flip(PackageSelfReference.discover(root)),
        ).toMatchObject({ _tag: "BundlerError" });
      }).pipe(Effect.scoped),
  );
});
