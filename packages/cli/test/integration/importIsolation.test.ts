import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, expect, layer } from "@effect/vitest";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import { pipe } from "effect/Function";
import * as Path from "effect/Path";
import * as Record from "effect/Record";
import * as Ref from "effect/Ref";
import * as Str from "effect/String";
import * as esbuild from "esbuild";
import { pathToFileURL } from "node:url";
import * as Project from "./Project";

const buildEntry = Effect.fnUntraced(function* (root: string, entry: string) {
  const path = yield* Path.Path;
  const outfile = `${path.basename(entry)}.mjs`;
  const built = yield* Effect.promise(() =>
    esbuild.build({
      absWorkingDir: root,
      stdin: {
        contents: `export ${entry === "convex/schema.ts" ? "{ default }" : "*"} from "./${entry}"; export { reads } from "./reads";`,
        resolveDir: root,
      },
      outfile,
      bundle: true,
      platform: "browser",
      format: "esm",
      metafile: true,
    }),
  );
  const output = built.metafile.outputs[outfile];
  assert(output);
  const inputs = pipe(
    Record.toEntries(output.inputs),
    Array.filter(([, input]) => input.bytesInOutput > 0),
    Array.map(([name]) => name),
  ).sort();
  const runtime = yield* Effect.promise(
    () => import(pathToFileURL(path.join(root, outfile)).href),
  );
  return { inputs, runtime };
});

layer(NodeServices.layer, { excludeTestServices: true })(
  "generated Convex bundles",
  (it) => {
    it.effect(
      "ships only the handlers' table dependencies without forcing their schemas",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const project = yield* Project.make;
          yield* project.write(
            "reads.ts",
            "export const reads: string[] = [];",
          );
          for (const name of ["notes", "users", "unused"]) {
            yield* project.write(
              `confect/tables/${name}.ts`,
              `import { Table } from "@confect/core";
import * as Schema from "effect/Schema";
import { reads } from "../../reads";
export default Table.make(() => {
  reads.push("${name}");
  return Schema.Struct({ text: Schema.String });
});`,
            );
          }
          yield* project.write(
            "confect/notes.spec.ts",
            `import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";
export default GroupSpec.make().addFunction(FunctionSpec.publicQuery({
  name: "list", returns: () => Schema.Array(Schema.Struct({ text: Schema.String })),
}));`,
          );
          yield* project.write(
            "confect/direct.native.ts",
            `import { queryGeneric } from "convex/server";
export const ping = queryGeneric(() => "pong");`,
          );
          yield* project.write(
            "confect/direct.spec.ts",
            `import { FunctionSpec, GroupSpec } from "@confect/core";
import type { ping } from "./direct.native";
export default GroupSpec.make({ convexModule: true }).addFunction(
  FunctionSpec.convexPublicQuery<typeof ping>()("ping"),
);`,
          );
          yield* project.write(
            "confect/mixed.spec.ts",
            `import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";
import type { ping } from "./direct.native";
export default GroupSpec.make()
  .addFunction(FunctionSpec.convexPublicQuery<typeof ping>()("ping"))
  .addFunction(FunctionSpec.publicQuery({ name: "echo", returns: () => Schema.String }));`,
          );
          yield* project.write(
            "confect/mixed.impl.ts",
            `import { GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { FunctionImpl } from "./_generated/server";
import { ping } from "./direct.native";
import mixed from "./mixed.spec";
export default GroupImpl.make(mixed).pipe(
  Layer.provide(FunctionImpl.make(mixed, "ping", ping)),
  Layer.provide(FunctionImpl.make(mixed, "echo", () => Effect.succeed("echo"))),
  GroupImpl.finalize,
);`,
          );
          yield* fs.makeDirectory(
            path.join(project.root, "confect/middleware"),
          );
          yield* project.write(
            "confect/middleware/audit.spec.ts",
            `import { MiddlewareSpec } from "@confect/core";
export default class Audit extends MiddlewareSpec.MiddlewareSpec<Audit>()("Audit", {
  functionTypes: { query: true, mutation: false, action: false },
}) {}`,
          );
          yield* project.write(
            "confect/middleware/audit.impl.ts",
            `import * as Effect from "effect/Effect";
import { MiddlewareImpl } from "../_generated/server";
import { DatabaseReader } from "../_generated/services";
import users from "../_generated/tables/users";
import Audit from "./audit.spec";
export default MiddlewareImpl.make(Audit, (next) => Effect.gen(function* () {
  const reader = yield* DatabaseReader;
  yield* reader.table(users).index("by_creation_time").first().pipe(Effect.orDie);
  return yield* next;
}));`,
          );
          yield* project.write(
            "confect/audited.spec.ts",
            `import notes from "./notes.spec";
import Audit from "./middleware/audit.spec";
export default notes.middleware(Audit);`,
          );
          yield* project.write(
            "confect/audited.impl.ts",
            `import { GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { FunctionImpl } from "./_generated/server";
import { DatabaseReader } from "./_generated/services";
import notes from "./_generated/tables/notes";
import Audit from "./middleware/audit.impl";
import audited from "./audited.spec";
export default GroupImpl.make(audited).pipe(
  Layer.provide(FunctionImpl.make(audited, "list", () => Effect.gen(function* () {
    const reader = yield* DatabaseReader;
    return yield* reader.table(notes).index("by_creation_time").collect().pipe(Effect.orDie);
  }))),
  Layer.provide(Audit),
  GroupImpl.finalize,
);`,
          );
          const generation = yield* project.start("codegen");
          const exitCode = yield* generation.handle.exitCode;
          const log = yield* Ref.get(generation.output);
          expect(Number(exitCode), log).toBe(0);

          const control = yield* buildEntry(
            project.root,
            "confect/direct.native.ts",
          );
          const direct = yield* buildEntry(project.root, "convex/direct.ts");
          expect(direct.inputs).toEqual(control.inputs);
          expect(direct.runtime.ping.isQuery).toBe(true);
          for (const [entry, names, functions] of [
            ["mixed", [], ["echo", "ping"]],
            ["notes", ["notes"], ["list"]],
            ["audited", ["notes", "users"], ["list"]],
          ] as const) {
            const { inputs, runtime } = yield* buildEntry(
              project.root,
              `convex/${entry}.ts`,
            );
            expect(
              Array.filter(inputs, Str.startsWith("confect/tables/")),
              entry,
            ).toEqual(Array.map(names, (name) => `confect/tables/${name}.ts`));
            expect(inputs, entry).not.toContain("confect/_generated/schema.ts");
            expect(inputs, entry).not.toContain(
              "confect/_generated/convexSchema.ts",
            );
            expect(runtime.reads, entry).toEqual([]);
            for (const name of functions)
              expect(runtime[name].isQuery).toBe(true);
          }
          const deploy = yield* buildEntry(project.root, "convex/schema.ts");
          expect(Record.keys(deploy.runtime.default.tables).sort()).toEqual([
            "notes",
            "unused",
            "users",
          ]);
          expect(deploy.runtime.reads.toSorted()).toEqual([
            "notes",
            "unused",
            "users",
          ]);
        }).pipe(Effect.scoped),
      { timeout: 60000 },
    );
  },
);
