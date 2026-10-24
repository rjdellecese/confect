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
      "ignores shadowed configs while continuing to compile imported helpers",
      () =>
        Effect.gen(function* () {
          const project = yield* Project.make;
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          yield* fs.makeDirectory(path.join(project.root, "confect/helpers"));
          yield* project.write("confect/tsconfig.json", "{}");
          yield* project.write(
            "confect/helpers/value.ts",
            'export const value = "initial";',
          );
          yield* project.write(
            "confect/notes.spec.ts",
            `import { value } from "./helpers/value";\nconsole.log("IGNORED_CONFIG_EDIT:" + value);\n${Project.spec}`,
          );
          const watching = yield* project.start("dev");
          yield* watching.waitFor(success);
          const generated = yield* project.generatedFiles;
          yield* Ref.set(watching.output, "");
          for (const file of [
            "tsconfig.json",
            "jsconfig.json",
            "confect/helpers/tsconfig.json",
          ])
            yield* project.write(file, '{"extends":');
          yield* project.write(
            "confect/helpers/value.ts",
            'export const value = "edited";',
          );
          yield* watching.waitFor("IGNORED_CONFIG_EDIT:edited");
          yield* watching.waitFor(success);
          expect(yield* Ref.get(watching.output)).not.toContain(
            "Performing initial sync",
          );
          expect(yield* project.generatedFiles).toEqual(generated);
          const once = yield* project.start("codegen");
          yield* once.waitFor(success);
          expect(Number(yield* once.handle.exitCode)).toBe(0);
          expect(yield* project.generatedFiles).toEqual(generated);
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );

    it.effect(
      "restarts for inherited config edits and keeps alias source edits incremental",
      () =>
        Effect.gen(function* () {
          const project = yield* Project.makeInheritedConfigProfiles;
          const path = yield* Path.Path;
          const watching = yield* project.start("dev");
          yield* watching.waitFor(success);
          const initial = yield* project.generatedFiles;
          expect(initial[path.join("convex", "notes.ts")]).toContain(
            "export const list =",
          );
          expect(initial[path.join("convex", "nested", "other.ts")]).toContain(
            "export const other =",
          );
          yield* Ref.set(watching.output, "");
          yield* project.writeNames("updatedList", "updatedOther");
          yield* watching.waitFor(success);
          const incremental = yield* project.generatedFiles;
          expect(incremental[path.join("convex", "notes.ts")]).toContain(
            "export const updatedList =",
          );
          expect(
            incremental[path.join("convex", "nested", "other.ts")],
          ).toContain("export const updatedOther =");
          expect(yield* Ref.get(watching.output)).not.toContain(
            "Performing initial sync",
          );
          yield* Ref.set(watching.output, "");
          yield* project.writeBaseConfig("rootFactory.z");
          yield* watching.waitFor("Performing initial sync");
          yield* watching.waitFor(success);
          const restarted = yield* Ref.get(watching.output);
          expect(
            restarted.match(/Performing initial sync/g),
            restarted,
          ).toHaveLength(1);
          const resolved = yield* project.generatedFiles;
          expect(resolved[path.join("convex", "notes.ts")]).toContain(
            "export const configuredupdatedList =",
          );
          expect(resolved[path.join("convex", "nested", "other.ts")]).toContain(
            "export const updatedOther =",
          );
          const once = yield* project.start("codegen");
          yield* once.waitFor(success);
          expect(Number(yield* once.handle.exitCode)).toBe(0);
          expect(yield* project.generatedFiles).toEqual(resolved);
        }).pipe(Effect.scoped),
      { timeout: 90000 },
    );

    it.effect(
      "keeps shared-helper edits incremental across config profiles",
      () =>
        Effect.gen(function* () {
          const project = yield* Project.makeConfigProfiles;
          const path = yield* Path.Path;
          const watching = yield* project.start("dev");
          yield* watching.waitFor(success);
          const initial = yield* project.generatedFiles;
          expect(initial[path.join("convex", "notes.ts")]).toContain(
            "export const list =",
          );
          expect(initial[path.join("convex", "nested", "other.ts")]).toContain(
            "export const other =",
          );
          yield* Ref.set(watching.output, "");
          yield* project.writeNames("updatedList", "updatedOther");
          yield* watching.waitFor(success);
          const incremental = yield* project.generatedFiles;
          expect(incremental[path.join("convex", "notes.ts")]).toContain(
            "export const updatedList =",
          );
          expect(
            incremental[path.join("convex", "nested", "other.ts")],
          ).toContain("export const updatedOther =");
          expect(yield* Ref.get(watching.output)).not.toContain(
            "Performing initial sync",
          );
          const once = yield* project.start("codegen");
          yield* once.waitFor(success);
          expect(Number(yield* once.handle.exitCode)).toBe(0);
          expect(yield* project.generatedFiles).toEqual(incremental);
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );

    it.effect(
      "generates once when startup bindings reveal additional library dependencies",
      () =>
        Effect.gen(function* () {
          const project = yield* Project.make;
          const spec = Project.spec.replace(
            'import { FunctionSpec, GroupSpec } from "@confect/core";',
            'import * as FunctionSpec from "@confect/core/FunctionSpec"; import * as GroupSpec from "@confect/core/GroupSpec";',
          );
          yield* project.write(
            "confect/tables/notes.ts",
            Project.table.replace(
              'import { Table } from "@confect/core";',
              'import * as Table from "@confect/core/Table";',
            ),
          );
          yield* project.write("confect/notes.spec.ts", spec);
          yield* project.write(
            "confect/notes.impl.ts",
            Project.impl.replace(
              'import { FunctionImpl, GroupImpl } from "@confect/server";',
              'import * as FunctionImpl from "@confect/server/FunctionImpl"; import * as GroupImpl from "@confect/server/GroupImpl";',
            ),
          );
          yield* project.write(
            "convex/convex.config.ts",
            'import { defineApp } from "convex/server"; console.log("FULL_GENERATION"); export default defineApp();\n',
          );
          const watching = yield* project.start("dev");
          yield* watching.waitFor(success);
          const startup = yield* Ref.get(watching.output);
          expect(startup.match(/^FULL_GENERATION$/gm), startup).toHaveLength(1);
          const generated = yield* project.generatedFiles;
          yield* Ref.set(watching.output, "");
          yield* project.write(
            "confect/notes.spec.ts",
            `${spec}\n// declaration-only comment\n`,
          );
          yield* watching.waitFor(success);
          expect(yield* Ref.get(watching.output)).not.toContain(
            "FULL_GENERATION",
          );
          expect(yield* project.generatedFiles).toEqual(generated);
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );

    it.effect(
      "keeps source edits in one session and restarts cleanly for compiler configuration",
      () =>
        Effect.gen(function* () {
          const project = yield* Project.make;
          const source = `${Project.spec}\nconsole.log("SESSION_PARENT:" + process.ppid);\n`;
          yield* project.write("confect/notes.spec.ts", source);
          const watching = yield* project.start("dev");
          yield* watching.waitFor(success);
          const initial = yield* Ref.get(watching.output);
          const first = initial.match(/SESSION_PARENT:(\d+)/)?.[1];
          expect(first, initial).toBeDefined();
          const generated = yield* project.generatedFiles;
          yield* Ref.set(watching.output, "");
          yield* project.write(
            "confect/notes.spec.ts",
            `${source}\n// ordinary source edit\n`,
          );
          yield* watching.waitFor(success);
          const edited = yield* Ref.get(watching.output);
          expect(edited).not.toContain("Performing initial sync");
          expect(
            [...edited.matchAll(/SESSION_PARENT:(\d+)/g)].map(
              (match) => match[1],
            ),
          ).toEqual([first]);
          yield* Ref.set(watching.output, "");
          yield* project.write(
            "tsconfig.json",
            '{"compilerOptions":{"moduleResolution":"Bundler","strict":true}}',
          );
          yield* watching.waitFor("Performing initial sync");
          yield* watching.waitFor(success);
          const restarted = yield* Ref.get(watching.output);
          const parents = [...restarted.matchAll(/SESSION_PARENT:(\d+)/g)].map(
            (match) => match[1],
          );
          expect(parents.length, restarted).toBeGreaterThan(0);
          expect(
            parents.every((pid) => pid !== first),
            restarted,
          ).toBe(true);
          expect(
            restarted.match(/Performing initial sync/g),
            restarted,
          ).toHaveLength(1);
          expect(yield* project.generatedFiles).toEqual(generated);
        }).pipe(Effect.scoped),
      { timeout: 90000 },
    );

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
  },
);
