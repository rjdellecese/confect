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
      "stabilizes a newly discovered external helper without another edit",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const project = yield* Project.make;
          const watching = yield* project.start("dev");
          yield* watching.waitFor(success);
          yield* Ref.set(watching.output, "");
          yield* fs.makeDirectory(path.join(project.root, "helpers/nested"), {
            recursive: true,
          });
          yield* project.write(
            "helpers/nested/value.ts",
            'export const value = "discovered";',
          );
          yield* project.write(
            "confect/notes.impl.ts",
            `${Project.impl}\nimport { value } from "../helpers/nested/value";\nconsole.log("DISCOVERY:" + value);\n`,
          );
          yield* watching.waitFor("DISCOVERY:discovered");
          yield* watching.waitFor(success);
          expect(yield* Ref.get(watching.output)).not.toContain(
            "Performing initial sync",
          );
          const incremental = yield* project.generatedFiles;
          const once = yield* project.start("codegen");
          yield* once.waitFor(success);
          expect(Number(yield* once.handle.exitCode)).toBe(0);
          expect(yield* project.generatedFiles).toEqual(incremental);
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );

    it.effect(
      "keeps atomic spec replacements incremental",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const project = yield* Project.make;
          yield* project.write(
            "convex/convex.config.ts",
            'import { defineApp } from "convex/server"; console.log("FULL_GENERATION"); export default defineApp();\n',
          );
          const watching = yield* project.start("dev");
          yield* watching.waitFor(success);
          const generated = yield* project.generatedFiles;
          for (const revision of [1, 2]) {
            yield* Ref.set(watching.output, "");
            const marker = `SPEC_REPLACED:${revision}`;
            yield* project.write(
              "confect/notes.spec.ts.tmp",
              `${Project.spec}\nconsole.log("${marker}");\n`,
            );
            yield* fs.rename(
              path.join(project.root, "confect/notes.spec.ts.tmp"),
              path.join(project.root, "confect/notes.spec.ts"),
            );
            yield* watching.waitFor(marker);
            yield* watching.waitFor(success);
            expect(yield* Ref.get(watching.output)).not.toContain(
              "FULL_GENERATION",
            );
            expect(yield* project.generatedFiles).toEqual(generated);
          }
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );

    it.effect(
      "updates only dependency-affected declarations and preserves full-generation output",
      () =>
        Effect.gen(function* () {
          const project = yield* Project.make;
          yield* project.write(
            "confect/notes.spec.ts",
            `${Project.spec}\nconsole.log("SPEC:notes");\n`,
          );
          yield* project.write(
            "confect/notes.impl.ts",
            `${Project.impl}\nconsole.log("IMPL:notes");\n`,
          );
          yield* project.write(
            "confect/other.spec.ts",
            `${Project.spec}\nconsole.log("SPEC:other");\n`,
          );
          yield* project.write(
            "confect/other.impl.ts",
            `${Project.impl.replace('"./notes.spec"', '"./other.spec"')}\nconsole.log("IMPL:other");\n`,
          );
          const watching = yield* project.start("dev");
          yield* watching.waitFor(success);
          yield* Ref.set(watching.output, "");
          yield* project.write(
            "confect/notes.spec.ts",
            `${Project.spec.replace('name: "list"', 'name: "latest"')}\nconsole.log("SPEC:notes");\n`,
          );
          yield* project.write(
            "confect/notes.impl.ts",
            `${Project.impl.replace('"list"', '"latest"')}\nconsole.log("IMPL:notes");\n`,
          );
          yield* watching.waitFor("IMPL:notes");
          yield* watching.waitFor(success);
          const updated = yield* Ref.get(watching.output);
          expect(updated.match(/SPEC:notes/g)).toHaveLength(1);
          expect(updated).not.toContain("SPEC:other");
          expect(updated).not.toContain("IMPL:other");
          const incremental = yield* project.generatedFiles;
          const fresh = yield* project.start("codegen");
          yield* fresh.waitFor(success);
          expect(Number(yield* fresh.handle.exitCode)).toBe(0);
          expect(yield* project.generatedFiles).toEqual(incremental);
          yield* Ref.set(watching.output, "");
          yield* project.write(
            "confect/tables/notes.ts",
            Project.table.replace(
              "text: Schema.String",
              "text: Schema.String, archived: Schema.Boolean",
            ),
          );
          yield* watching.waitFor("IMPL:other");
          yield* watching.waitFor(success);
          const tableUpdate = yield* Ref.get(watching.output);
          expect(tableUpdate).toContain("IMPL:notes");
          expect(tableUpdate).toContain("IMPL:other");
          expect(yield* project.generatedFiles).toEqual(incremental);
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );

    it.effect(
      "reconciles a declaration edit received during validation before reporting readiness",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const project = yield* Project.make;
          const gate = `
import { existsSync, watch, unlinkSync } from "node:fs";
const block = new URL("../block", import.meta.url);
if (existsSync(block)) {
  await new Promise<void>((resolve) => {
    const watcher = watch(new URL("../", import.meta.url), (_event, file) => {
      if (file === "release") { watcher.close(); resolve(); }
    });
    process.stdout.write("DECLARATION_BLOCKED\\n");
  });
  unlinkSync(block);
}
`;
          yield* project.write("confect/notes.impl.ts", Project.impl + gate);
          const watching = yield* project.start("dev");
          yield* watching.waitFor(success);
          yield* project.write("block", "");
          yield* project.write(
            "confect/notes.spec.ts",
            `${Project.spec}\n// first declaration edit\n`,
          );
          yield* watching.waitFor("DECLARATION_BLOCKED");
          yield* project.write(
            "confect/notes.spec.ts",
            Project.spec.replace('name: "list"', 'name: "latest"'),
          );
          yield* project.write(
            "confect/notes.impl.ts",
            Project.impl.replace('"list"', '"latest"') + gate,
          );
          yield* project.write("release", "");
          yield* watching.waitFor(success);
          const output = yield* fs.readFileString(
            path.join(project.root, "convex", "notes.ts"),
          );
          expect(output).toContain("export const latest");
          expect(output).not.toContain("export const list");
          const incremental = yield* project.generatedFiles;
          const fresh = yield* project.start("codegen");
          yield* fresh.waitFor(success);
          expect(Number(yield* fresh.handle.exitCode)).toBe(0);
          expect(yield* project.generatedFiles).toEqual(incremental);
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );

    it.effect(
      "preserves an edit received while another impl is being validated",
      () =>
        Effect.gen(function* () {
          const project = yield* Project.make;
          const gatedImpl = `${Project.impl}
import { existsSync, watch, unlinkSync } from "node:fs";
const block = new URL("../block", import.meta.url);
if (existsSync(block)) {
  await new Promise<void>((resolve) => {
    const watcher = watch(new URL("../", import.meta.url), (_event, file) => {
      if (file === "release") { watcher.close(); resolve(); }
    });
    process.stdout.write("VALIDATION_BLOCKED\\n");
  });
  unlinkSync(block);
}
`;
          const otherImpl = `${Project.impl.replace('"./notes.spec"', '"./other.spec"')}\nprocess.stdout.write("SECOND:1\\n");\n`;
          yield* project.write("confect/notes.impl.ts", gatedImpl);
          yield* project.write("confect/other.spec.ts", Project.spec);
          yield* project.write("confect/other.impl.ts", otherImpl);
          yield* project.write(
            "confect/tables/notes.ts",
            "export default {};\n",
          );
          const watching = yield* project.start("dev");
          yield* watching.waitFor("must default-export a Table");
          yield* watching.waitFor("must default-export a Table");
          yield* project.write("confect/tables/notes.ts", Project.table);
          yield* watching.waitFor(success);
          yield* project.write("block", "");
          yield* project.write(
            "confect/notes.impl.ts",
            `${gatedImpl}\n// first edit\n`,
          );
          yield* watching.waitFor("VALIDATION_BLOCKED");
          yield* project.write(
            "confect/other.impl.ts",
            otherImpl.replace("SECOND:1", "SECOND:2"),
          );
          yield* project.write("release", "");
          yield* watching.waitFor("SECOND:2");
          yield* watching.waitFor(success);
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );

    it.effect(
      "revalidates shared dependency importers and recovers after dependency deletion",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const project = yield* Project.make;
          yield* project.write("shared.ts", "export const version = 1;\n");
          for (const name of ["notes", "other", "unrelated"]) {
            yield* project.write(`confect/${name}.spec.ts`, Project.spec);
            yield* project.write(
              `confect/${name}.impl.ts`,
              [
                name === "unrelated"
                  ? "const version = 0;"
                  : 'import { version } from "../shared";',
                Project.impl.replace('"./notes.spec"', `"./${name}.spec"`),
                `process.stdout.write("EVALUATED:${name}:" + version + "\\n");`,
              ].join("\n"),
            );
          }
          yield* project.write(
            "confect/tables/notes.ts",
            "export default {};\n",
          );
          const watching = yield* project.start("dev");
          yield* watching.waitFor("must default-export a Table");
          yield* watching.waitFor("must default-export a Table");
          yield* project.write("confect/tables/notes.ts", Project.table);
          yield* watching.waitFor(success);
          const initial = yield* Ref.get(watching.output);
          yield* project.write("shared.ts", "export const version = 2;\n");
          yield* watching.waitFor("Dependencies may have changed");
          yield* watching.waitFor(success);
          const reload = (yield* Ref.get(watching.output)).slice(
            initial.length,
          );
          expect(reload).toContain("EVALUATED:notes:2");
          expect(reload).toContain("EVALUATED:other:2");
          expect(reload).not.toContain("EVALUATED:unrelated");
          yield* fs.remove(path.join(project.root, "shared.ts"));
          yield* watching.waitFor('Could not resolve "../shared"');
          yield* project.write("shared.ts", "export const version = 3;\n");
          yield* watching.waitFor("EVALUATED:notes:3");
          yield* watching.waitFor(success);
        }).pipe(Effect.scoped),
      { timeout: 45000 },
    );

    it.effect.each([1, 8])(
      "does not reevaluate %i unrelated impls after an impl-only edit",
      (unrelatedGroups) =>
        Effect.gen(function* () {
          const project = yield* Project.make;
          const changedMarker = "ISSUE_771_CHANGED_IMPL";
          const unrelatedMarker = "ISSUE_771_UNRELATED_IMPL";
          const observedImpl = `${Project.impl}\nprocess.stdout.write("${changedMarker}\\n");\n`;
          yield* project.write("confect/notes.impl.ts", observedImpl);
          yield* Effect.forEach(
            Array.from({ length: unrelatedGroups }, (_, i) => `other${i}`),
            (name) =>
              Effect.all([
                project.write(`confect/${name}.spec.ts`, Project.spec),
                project.write(
                  `confect/${name}.impl.ts`,
                  `${Project.impl.replace('"./notes.spec"', `"./${name}.spec"`)}\nprocess.stdout.write("${unrelatedMarker}\\n");\n`,
                ),
              ]),
          );
          yield* project.write(
            "confect/tables/notes.ts",
            "export default {};\n",
          );
          const watching = yield* project.start("dev");
          yield* watching.waitFor("must default-export a Table");
          yield* watching.waitFor("must default-export a Table");
          yield* project.write("confect/tables/notes.ts", Project.table);
          yield* watching.waitFor(success);
          const initial = yield* Ref.get(watching.output);
          expect(initial.split(unrelatedMarker)).toHaveLength(
            unrelatedGroups + 1,
          );
          yield* project.write(
            "confect/notes.impl.ts",
            `${observedImpl}\n// impl-only edit\n`,
          );
          yield* watching.waitFor("Dependencies may have changed");
          yield* watching.waitFor(success);
          const reload = (yield* Ref.get(watching.output)).slice(
            initial.length,
          );
          expect(reload).toContain(changedMarker);
          expect(reload.split(unrelatedMarker)).toHaveLength(1);
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );
  },
);
