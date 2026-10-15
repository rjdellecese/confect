import * as Path from "effect/Path";
import * as NodePath from "@effect/platform-node/NodePath";
import { expect, layer } from "@effect/vitest";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import { toModuleImportPath, toPosixPath } from "@confect/cli/utils";

const SPECIFIER_PLATFORMS = [
  { name: "posix", pathLayer: NodePath.layerPosix, sep: "/" },
  { name: "win32", pathLayer: NodePath.layerWin32, sep: "\\" },
] as const;

for (const { name, pathLayer, sep } of SPECIFIER_PLATFORMS) {
  const p = (...segments: ReadonlyArray<string>) => Array.join(segments, sep);

  layer(pathLayer)(`module specifiers, built from ${name} paths`, (it) => {
    it.effect("toPosixPath rewrites the platform separator", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        expect(toPosixPath(path, p("_generated", "tables", "notes.ts"))).toBe(
          "_generated/tables/notes.ts",
        );
      }),
    );

    it.effect("toPosixPath leaves a separator-free path alone", () =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        expect(toPosixPath(path, "notes.ts")).toBe("notes.ts");
      }),
    );

    it.effect("toModuleImportPath emits a POSIX relative specifier", () =>
      Effect.gen(function* () {
        expect(
          yield* toModuleImportPath(p("..", "_generated", "schema.ts")),
        ).toBe("../_generated/schema");
      }),
    );

    it.effect("toModuleImportPath prefixes a bare sibling path with ./", () =>
      Effect.gen(function* () {
        expect(yield* toModuleImportPath(p("tables", "notes.ts"))).toBe(
          "./tables/notes",
        );
      }),
    );
  });
}
