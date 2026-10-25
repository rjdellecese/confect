import * as NodeServices from "@effect/platform-node/NodeServices";
import { expect, layer } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as DateTime from "effect/DateTime";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Option from "effect/Option";
import * as Project from "./Project";

const success = "Generated files are up-to-date";

layer(NodeServices.layer, { excludeTestServices: true })(
  "built confect dev",
  (it) => {
    it.effect(
      "does not invalidate Convex schema for ordinary source edits or full generation",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const project = yield* Project.make;
          const config =
            'import { defineApp } from "convex/server"; export default defineApp();\n';
          yield* project.write("convex/convex.config.ts", config);
          const watching = yield* project.start("dev");
          yield* watching.waitFor(success);
          const schema = path.join(project.root, "convex/schema.ts");
          const timestamp = DateTime.toDateUtc(DateTime.makeUnsafe(1000));
          for (const [file, contents] of [
            [
              "confect/notes.impl.ts",
              `${Project.impl}\n// implementation edit\n`,
            ],
            [
              "confect/notes.spec.ts",
              `${Project.spec}\n// specification edit\n`,
            ],
            [
              "confect/tables/notes.ts",
              Project.table.replace(
                "text: Schema.String",
                "text: Schema.String, archived: Schema.Boolean",
              ),
            ],
            ["convex/convex.config.ts", `${config}\n// configuration edit\n`],
          ] as const) {
            yield* fs.utimes(schema, timestamp, timestamp);
            yield* project.write(file, contents);
            yield* watching.waitFor(success);
            expect(
              Option.getOrThrow((yield* fs.stat(schema)).mtime).getTime(),
            ).toBe(1000);
          }
        }).pipe(Effect.scoped),
      { timeout: process.platform === "win32" ? 60000 : 30000 },
    );

    it.effect.each([
      {
        file: "confect/notes.impl.ts",
        broken: Project.emptyImpl,
        repaired: Project.impl,
        error: "does not implement every function",
      },
      {
        file: "confect/tables/notes.ts",
        broken: "export default {};\n",
        repaired: Project.table,
        error: "must default-export a Table",
      },
    ])(
      "invalidates unchanged generated files after recovering $file",
      ({ file, broken, repaired, error }) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const project = yield* Project.make;
          const watching = yield* project.start("dev");
          yield* watching.waitFor(success);
          const before = yield* project.generatedFiles;
          const schema = path.join(project.root, "convex/schema.ts");
          const timestamp = DateTime.toDateUtc(DateTime.makeUnsafe(1000));
          yield* fs.utimes(schema, timestamp, timestamp);
          yield* project.write(file, broken);
          yield* watching.waitFor(error);
          expect(
            Option.getOrThrow((yield* fs.stat(schema)).mtime).getTime(),
          ).toBe(1000);
          yield* project.write(file, repaired);
          yield* watching.waitFor(success);
          expect(yield* project.generatedFiles).toEqual(before);
          expect(
            Option.getOrThrow((yield* fs.stat(schema)).mtime).getTime(),
          ).toBeGreaterThan(1000);
          yield* fs.utimes(schema, timestamp, timestamp);
          yield* project.write(
            file,
            `${repaired}\n// ordinary edit after recovery\n`,
          );
          yield* watching.waitFor(success);
          expect(
            Option.getOrThrow((yield* fs.stat(schema)).mtime).getTime(),
          ).toBe(1000);
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );

    it.effect(
      "preserves optional outputs that are not owned by Confect",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const project = yield* Project.make;
          const outputs = ["auth.config.ts", "http.ts", "crons.ts"];
          const contents = "export default {};\n";
          yield* Effect.forEach(outputs, (output) =>
            project.write(`convex/${output}`, contents),
          );
          const watching = yield* project.start("dev");
          yield* watching.waitFor(success);
          for (const output of outputs) {
            expect(
              yield* fs.readFileString(
                path.join(project.root, "convex", output),
              ),
            ).toBe(contents);
          }
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );

    it.effect.each([
      {
        source: "auth.ts",
        output: "auth.config.ts",
        contents: "export default { providers: [] };\n",
      },
      {
        source: "http.ts",
        output: "http.ts",
        contents:
          'import { httpRouter } from "convex/server"; export default httpRouter();\n',
      },
      {
        source: "crons.ts",
        output: "crons.ts",
        contents:
          'import { cronJobs } from "convex/server"; export default cronJobs();\n',
      },
    ])(
      "retries removal of $output after impl validation recovers",
      ({ source, output, contents }) =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const project = yield* Project.make;
          yield* project.write(`confect/${source}`, contents);
          const watching = yield* project.start("dev");
          yield* watching.waitFor(success);
          const generated = path.join(project.root, "convex", output);
          expect(yield* fs.exists(generated)).toBe(true);
          yield* project.write("confect/notes.impl.ts", Project.emptyImpl);
          yield* watching.waitFor("does not implement every function");
          yield* fs.remove(path.join(project.root, "confect", source));
          yield* watching.waitFor("does not implement every function");
          yield* project.write("confect/notes.impl.ts", Project.impl);
          yield* watching.waitFor(success);
          expect(yield* fs.exists(generated)).toBe(false);
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );

    it.effect(
      "removes optional output and the last group when their entry points disappear",
      () =>
        Effect.gen(function* () {
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const project = yield* Project.make;
          yield* project.write(
            "confect/auth.ts",
            "export default { providers: [] };\n",
          );
          const watching = yield* project.start("dev");
          yield* watching.waitFor(success);
          expect(
            yield* fs.exists(path.join(project.root, "convex/auth.config.ts")),
          ).toBe(true);
          yield* fs.remove(path.join(project.root, "confect/auth.ts"));
          yield* watching.waitFor(success);
          expect(
            yield* fs.exists(path.join(project.root, "convex/auth.config.ts")),
          ).toBe(false);
          yield* fs.remove(path.join(project.root, "confect/notes.impl.ts"));
          yield* fs.remove(path.join(project.root, "confect/notes.spec.ts"));
          yield* fs.remove(path.join(project.root, "confect/tables"), {
            recursive: true,
          });
          yield* watching.waitFor(success);
          expect(
            yield* fs.exists(path.join(project.root, "convex/notes.ts")),
          ).toBe(false);
        }).pipe(Effect.scoped),
      { timeout: 30000 },
    );
  },
);
