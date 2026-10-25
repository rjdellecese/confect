import * as BunServices from "@effect/platform-bun/BunServices";
import { expect, test } from "bun:test";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import { clean } from "./clean";

test("removes files and nested directories and tolerates missing targets", () =>
  Effect.runPromise(
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fs.makeTempDirectoryScoped();
      const nested = path.join(directory, "nested");
      const file = path.join(directory, "file.txt");
      const kept = path.join(directory, "kept.txt");
      const missing = path.join(directory, "missing");
      yield* fs.makeDirectory(nested);
      yield* fs.writeFileString(path.join(nested, "child.txt"), "child");
      yield* fs.writeFileString(file, "file");
      yield* fs.writeFileString(kept, "kept");
      const targets = [nested, file, missing];
      yield* clean(targets);
      expect(targets).toEqual([nested, file, missing]);
      expect(yield* fs.exists(nested)).toBe(false);
      expect(yield* fs.exists(file)).toBe(false);
      expect(yield* fs.exists(missing)).toBe(false);
      expect(yield* fs.readFileString(kept)).toBe("kept");
      yield* clean([]);
    }).pipe(Effect.scoped, Effect.provide(BunServices.layer)),
  ));
