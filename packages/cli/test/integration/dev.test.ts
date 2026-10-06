import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Project from "./Project";

const success = "Generated files are up-to-date";

layer(NodeServices.layer, { excludeTestServices: true })(
  "built confect dev",
  (it) => {
    it.effect(
      "bootstraps table-dependent specs and impls without generated output",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const project = yield* Project.make;
          expect(
            yield* fs.exists(path.join(project.root, "confect/_generated")),
          ).toBe(false);
          yield* Effect.gen(function* () {
            const process = yield* project.start("dev");
            yield* process.waitFor(success);
            expect(
              yield* fs.exists(path.join(project.root, "convex/notes.ts")),
            ).toBe(true);
            yield* Effect.sleep("2 seconds");
            expect(
              (yield* Ref.get(process.output)).split(success),
            ).toHaveLength(2);
          }).pipe(Effect.scoped);
          const repeated = yield* project.start("codegen");
          yield* repeated.waitFor(success);
          expect(yield* repeated.handle.exitCode).toBe(0);
          const restarted = yield* project.start("dev");
          yield* restarted.waitFor(success);
          yield* Effect.sleep("2 seconds");
          expect(
            (yield* Ref.get(restarted.output)).split(success),
          ).toHaveLength(2);
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );

    it.effect.each([
      { missing: "spec", directory: "" },
      { missing: "impl", directory: "" },
      { missing: "spec", directory: "nested/" },
      { missing: "impl", directory: "nested/" },
    ] as const)(
      "reports a missing $directory$missing and recovers when it is authored",
      ({ missing, directory }) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const project = yield* Project.make;
          const spec = directory
            ? Project.spec.replaceAll('"./_generated/', '"../_generated/')
            : Project.spec;
          const impl = directory
            ? Project.impl.replaceAll('"./_generated/', '"../_generated/')
            : Project.impl;
          if (directory) {
            yield* fs.makeDirectory(
              path.join(project.root, "confect", directory),
            );
            yield* fs.remove(path.join(project.root, "confect/notes.spec.ts"));
            yield* fs.remove(path.join(project.root, "confect/notes.impl.ts"));
            yield* project.write(`confect/${directory}notes.spec.ts`, spec);
            yield* project.write(`confect/${directory}notes.impl.ts`, impl);
          }
          const missingFile = `confect/${directory}notes.${missing}.ts`;
          yield* fs.remove(path.join(project.root, missingFile));
          yield* Effect.gen(function* () {
            const once = yield* project.start("codegen");
            yield* once.waitFor(`has no sibling ${missing}`);
            expect(yield* once.handle.exitCode).not.toBe(0);
            expect(yield* Ref.get(once.output)).not.toContain(success);
          }).pipe(Effect.scoped);
          yield* fs.remove(path.join(project.root, "confect/_generated"), {
            recursive: true,
          });
          const watching = yield* project.start("dev");
          yield* watching.waitFor(`has no sibling ${missing}`);
          expect(yield* Ref.get(watching.output)).not.toContain(success);
          yield* project.write(missingFile, missing === "spec" ? spec : impl);
          yield* watching.waitFor(success);
          expect(
            yield* fs.exists(
              path.join(project.root, `convex/${directory}notes.ts`),
            ),
          ).toBe(true);
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );

    it.effect(
      "recovers when an invalid table is fixed before bindings exist",
      () =>
        Effect.gen(function* () {
          const project = yield* Project.make;
          yield* project.write(
            "confect/tables/notes.ts",
            "export default {};\n",
          );
          const watching = yield* project.start("dev");
          yield* watching.waitFor("must default-export a Table");
          yield* watching.waitFor("must default-export a Table");
          expect(yield* Ref.get(watching.output)).not.toContain(success);
          yield* project.write("confect/tables/notes.ts", Project.table);
          yield* watching.waitFor(success);
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );

    it.effect.each(["immediately", "after watcher startup"] as const)(
      "watches spec dependencies while its implementation is missing (%s)",
      (when) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const project = yield* Project.make;
          yield* fs.remove(path.join(project.root, "confect/notes.impl.ts"));
          yield* project.write("group.ts", "export default {};\n");
          yield* project.write(
            "confect/notes.spec.ts",
            'export { default } from "../group";\n',
          );
          const watching = yield* project.start("dev");
          yield* watching.waitFor("must default-export a GroupSpec");
          if (when === "after watcher startup") {
            yield* watching.waitFor("must default-export a GroupSpec");
          }
          yield* project.write(
            "group.ts",
            'import { GroupSpec } from "@confect/core";\nexport default GroupSpec.make();\n',
          );
          yield* watching.waitFor("has no sibling impl");
          expect(yield* Ref.get(watching.output)).not.toContain(success);
          yield* project.write("confect/notes.impl.ts", Project.emptyImpl);
          yield* watching.waitFor(success);
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );
    it.effect(
      "reconciles table watches and removes obsolete bindings while an impl is missing",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const project = yield* Project.make;
          yield* fs.remove(path.join(project.root, "confect/notes.impl.ts"));
          const watching = yield* project.start("dev");
          yield* watching.waitFor("has no sibling impl");
          yield* watching.waitFor("has no sibling impl");
          yield* project.write(
            "labelTable.ts",
            'import { Table } from "@confect/core";\nimport * as Schema from "effect/Schema";\nexport default Table.make(() => Schema.Struct({ name: Schema.String }));\n',
          );
          yield* project.write(
            "confect/tables/labels.ts",
            'export { default } from "../../labelTable";\n',
          );
          yield* watching.waitFor("has no sibling impl");
          expect(
            yield* fs.exists(
              path.join(project.root, "confect/_generated/tables/labels.ts"),
            ),
          ).toBe(true);
          yield* Ref.set(watching.output, "");
          yield* project.write("labelTable.ts", "export default {};\n");
          yield* watching.waitFor("must default-export a Table");
          expect(yield* Ref.get(watching.output)).not.toContain(success);
          yield* fs.remove(path.join(project.root, "confect/tables/labels.ts"));
          yield* watching.waitFor("has no sibling impl");
          yield* project.write("confect/notes.impl.ts", Project.impl);
          yield* watching.waitFor(success);
          expect(
            yield* fs.exists(
              path.join(project.root, "confect/_generated/tables/labels.ts"),
            ),
          ).toBe(false);
          const settled = yield* Ref.get(watching.output);
          yield* Effect.sleep("2 seconds");
          expect(yield* Ref.get(watching.output)).toBe(settled);
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );
  },
);
