import { pipe } from "effect/Function";
import * as Option from "effect/Option";
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
    it.effect(
      "preserves component targets across edits and rejects application authentication",
      () =>
        Effect.gen(function* () {
          const project = yield* Project.make;
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          yield* project.write(
            "package.json",
            '{"type":"module","name":"counter"}',
          );
          yield* project.write(
            "convex/convex.config.ts",
            'import { defineComponent } from "convex/server"; export default defineComponent("counter");',
          );
          const watching = yield* project.start("dev", [
            "--component-dir",
            "convex",
          ]);
          yield* watching.waitFor(success);
          const id = yield* fs.readFileString(
            path.join(project.root, "confect/_generated/id.ts"),
          );
          expect(id).toContain('IdScope.component("counter:convex")');
          yield* project.write(
            "confect/auth.ts",
            "export default { providers: [] };",
          );
          yield* watching.waitFor(
            "Components cannot configure application authentication",
          );
          const hasAuth = yield* fs.exists(
            path.join(project.root, "convex/auth.config.ts"),
          );
          expect(hasAuth).toBe(false);
          yield* fs.remove(path.join(project.root, "confect/auth.ts"));
          yield* watching.waitFor(success);
          yield* project.write("confect/notes.spec.ts", `${Project.spec}\n`);
          yield* watching.waitFor(success);
          const services = yield* fs.readFileString(
            path.join(project.root, "confect/_generated/services.ts"),
          );
          expect(services).toContain(
            "Storage_.Storage.forScope<typeof scope>()",
          );
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );

    it.effect(
      "generates once when startup bindings reveal additional library dependencies",
      () =>
        Effect.gen(function* () {
          const project = yield* Project.make;
          const spec = pipe(
            Project.spec,
            Str.replace(
              'import { FunctionSpec, GroupSpec } from "@confect/core";',
              'import * as FunctionSpec from "@confect/core/FunctionSpec"; import * as GroupSpec from "@confect/core/GroupSpec";',
            ),
          );
          yield* project.write(
            "confect/tables/notes.ts",
            pipe(
              Project.table,
              Str.replace(
                'import { Table } from "@confect/core";',
                'import * as Table from "@confect/core/Table";',
              ),
            ),
          );
          yield* project.write("confect/notes.spec.ts", spec);
          yield* project.write(
            "confect/notes.impl.ts",
            pipe(
              Project.impl,
              Str.replace(
                'import { FunctionImpl, GroupImpl } from "@confect/server";',
                'import * as FunctionImpl from "@confect/server/FunctionImpl"; import * as GroupImpl from "@confect/server/GroupImpl";',
              ),
            ),
          );
          yield* project.write(
            "convex/convex.config.ts",
            'import { defineApp } from "convex/server"; console.log("FULL_GENERATION"); export default defineApp();\n',
          );
          const watching = yield* project.start("dev");
          yield* watching.waitFor(success);
          const startup = yield* Ref.get(watching.output);
          expect(
            Option.getOrNull(pipe(startup, Str.match(/^FULL_GENERATION$/gm))),
            startup,
          ).toHaveLength(1);
          const generated = yield* project.generatedFiles;
          yield* Ref.set(watching.output, "");
          yield* project.write(
            "confect/notes.spec.ts",
            `${spec}\n// declaration-only comment\n`,
          );
          yield* watching.waitFor(success);
          const current = yield* Ref.get(watching.output);
          expect(current).not.toContain("FULL_GENERATION");
          const actual = yield* project.generatedFiles;
          expect(actual).toEqual(generated);
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );

    it.effect(
      "bootstraps table-dependent specs and impls without generated output",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const project = yield* Project.make;
          const actual2 = yield* fs.exists(
            path.join(project.root, "confect/_generated"),
          );
          expect(actual2).toBe(false);
          yield* Effect.gen(function* () {
            const process = yield* project.start("dev");
            yield* process.waitFor(success);
            const actual3 = yield* fs.exists(
              path.join(project.root, "convex/notes.ts"),
            );
            expect(actual3).toBe(true);
            yield* Effect.sleep("2 seconds");
            const current2 = yield* Ref.get(process.output);
            expect(Str.split(current2, success)).toHaveLength(2);
          }).pipe(Effect.scoped);
          const repeated = yield* project.start("codegen");
          yield* repeated.waitFor(success);
          const actual4 = yield* repeated.handle.exitCode;
          expect(actual4).toBe(0);
          const restarted = yield* project.start("dev");
          yield* restarted.waitFor(success);
          yield* Effect.sleep("2 seconds");
          const current3 = yield* Ref.get(restarted.output);
          expect(Str.split(current3, success)).toHaveLength(2);
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );
  },
);
