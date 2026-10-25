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
