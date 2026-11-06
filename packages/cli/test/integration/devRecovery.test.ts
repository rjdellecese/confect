import { pipe } from "effect/Function";
import * as Str from "effect/String";
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
    it.effect.each(["http.ts", "crons.ts", "auth.ts"])(
      "rejects invalid %s during codegen and recovers in dev without executing it",
      (file) =>
        Effect.gen(function* () {
          const project = yield* Project.make;
          yield* project.write(`confect/${file}`, "export default ;");
          yield* Effect.gen(function* () {
            const once = yield* project.start("codegen");
            yield* once.waitFor('Unexpected ";"');
            const actual = yield* once.handle.exitCode;
            expect(actual).not.toBe(0);
            const current = yield* Ref.get(once.output);
            expect(current).not.toContain(success);
          }).pipe(Effect.scoped);
          const watching = yield* project.start("dev");
          yield* watching.waitFor('Unexpected ";"');
          const current2 = yield* Ref.get(watching.output);
          expect(current2).not.toContain(success);
          yield* project.write(
            `confect/${file}`,
            'import "./_generated/registeredFunctions/notes"; import "../convex/notes"; throw new Error("Optional runtime must not execute"); export default {};',
          );
          yield* watching.waitFor(success);
          const current3 = yield* Ref.get(watching.output);
          expect(current3).not.toContain("Optional runtime must not execute");
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );

    it.effect(
      "does not hide a failing impl when an unrelated impl is edited",
      () =>
        Effect.gen(function* () {
          const project = yield* Project.make;
          yield* project.write("confect/other.spec.ts", Project.spec);
          const otherImpl = pipe(
            Project.impl,
            Str.replace('"./notes.spec"', '"./other.spec"'),
          );
          yield* project.write("confect/other.impl.ts", otherImpl);
          const watching = yield* project.start("dev");
          yield* watching.waitFor(success);
          yield* project.write("confect/notes.impl.ts", Project.emptyImpl);
          yield* watching.waitFor("does not implement every function");
          const before = yield* Ref.get(watching.output);
          yield* project.write(
            "confect/other.impl.ts",
            `${otherImpl}\n// unrelated edit\n`,
          );
          yield* watching.waitFor("does not implement every function");
          const current4 = yield* Ref.get(watching.output);
          expect(pipe(current4, Str.slice(before.length))).not.toContain(
            success,
          );
          yield* project.write("confect/notes.impl.ts", Project.impl);
          yield* watching.waitFor(success);
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );

    it.effect.each([
      { missing: "spec", directory: "" },
      { missing: "impl", directory: "" },
      { missing: "spec", directory: "nested/" },
      { missing: "impl", directory: "nested/" },
    ] as const)(
      'reports a missing $missing in "$directory" and recovers when it is authored',
      ({ missing, directory }) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const project = yield* Project.make;
          const spec =
            directory !== ""
              ? pipe(
                  Project.spec,
                  Str.replaceAll('"./_generated/', '"../_generated/'),
                )
              : Project.spec;
          const impl =
            directory !== ""
              ? pipe(
                  Project.impl,
                  Str.replaceAll('"./_generated/', '"../_generated/'),
                )
              : Project.impl;
          if (directory !== "") {
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
            const actual2 = yield* once.handle.exitCode;
            expect(actual2).not.toBe(0);
            const current5 = yield* Ref.get(once.output);
            expect(current5).not.toContain(success);
          }).pipe(Effect.scoped);
          yield* fs.remove(path.join(project.root, "confect/_generated"), {
            recursive: true,
          });
          const watching = yield* project.start("dev");
          yield* watching.waitFor(`has no sibling ${missing}`);
          const current6 = yield* Ref.get(watching.output);
          expect(current6).not.toContain(success);
          yield* project.write(missingFile, missing === "spec" ? spec : impl);
          yield* watching.waitFor(success);
          const actual3 = yield* fs.exists(
            path.join(project.root, `convex/${directory}notes.ts`),
          );
          expect(actual3).toBe(true);
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
          const current7 = yield* Ref.get(watching.output);
          expect(current7).not.toContain(success);
          yield* project.write("confect/tables/notes.ts", Project.table);
          yield* watching.waitFor(success);
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );

    it.effect(
      "does not report an optional-only retry as a successful full generation",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const project = yield* Project.make;
          yield* fs.remove(path.join(project.root, "confect/notes.spec.ts"));
          yield* fs.remove(path.join(project.root, "confect/notes.impl.ts"));
          yield* fs.remove(path.join(project.root, "confect/tables"), {
            recursive: true,
          });
          yield* project.write("confect/schema.ts", "export default {};\n");
          yield* project.write(
            "confect/auth.ts",
            "export default { providers: [] };\n",
          );
          const watching = yield* project.start("dev");
          yield* watching.waitFor("Found a legacy");
          yield* watching.waitFor("Dependencies may have changed");
          yield* Effect.sleep("2 seconds");
          const current8 = yield* Ref.get(watching.output);
          expect(current8).not.toContain(success);
          yield* fs.remove(path.join(project.root, "confect/schema.ts"));
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
          const current9 = yield* Ref.get(watching.output);
          expect(current9).not.toContain(success);
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
          const actual4 = yield* fs.exists(
            path.join(project.root, "confect/_generated/tables/labels.ts"),
          );
          expect(actual4).toBe(true);
          yield* Ref.set(watching.output, "");
          yield* project.write("labelTable.ts", "export default {};\n");
          yield* watching.waitFor("must default-export a Table");
          const current10 = yield* Ref.get(watching.output);
          expect(current10).not.toContain(success);
          yield* fs.remove(path.join(project.root, "confect/tables/labels.ts"));
          yield* watching.waitFor("has no sibling impl");
          yield* project.write("confect/notes.impl.ts", Project.impl);
          yield* watching.waitFor(success);
          const actual5 = yield* fs.exists(
            path.join(project.root, "confect/_generated/tables/labels.ts"),
          );
          expect(actual5).toBe(false);
          const settled = yield* Ref.get(watching.output);
          yield* Effect.sleep("2 seconds");
          const current11 = yield* Ref.get(watching.output);
          expect(current11).toBe(settled);
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );
  },
);
