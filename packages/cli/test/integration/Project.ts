import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/process/ChildProcess";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";
import { expect } from "@effect/vitest";

export const table = `import { Table } from "@confect/core";
import * as Schema from "effect/Schema";
import { Id } from "../_generated/id";
export default Table.make(() => Schema.Struct({ text: Schema.String, parent: Schema.optionalKey(Id("notes")) }));
`;

export const spec = `import { FunctionSpec, GroupSpec } from "@confect/core";
import * as Schema from "effect/Schema";
import notes from "./_generated/tables/notes";
export default GroupSpec.make().addFunction(FunctionSpec.publicQuery({ name: "list", returns: () => Schema.Array(notes.Doc) }));
`;

export const impl = `import { FunctionImpl, GroupImpl } from "@confect/server";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import databaseSchema from "./_generated/schema";
import { DatabaseReader } from "./_generated/services";
import notes from "./notes.spec";
const list = FunctionImpl.make(databaseSchema, notes, "list", () => Effect.gen(function* () {
  const reader = yield* DatabaseReader;
  return yield* reader.table("notes").collect();
}).pipe(Effect.orDie));
export default GroupImpl.make(databaseSchema, notes).pipe(Layer.provide(list), GroupImpl.finalize);
`;

export const emptyImpl = `import { GroupImpl } from "@confect/server";
import databaseSchema from "./_generated/schema";
import notes from "./notes.spec";
export default GroupImpl.make(databaseSchema, notes).pipe(GroupImpl.finalize);
`;

export const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({
    directory: import.meta.dirname,
    prefix: "consumer-",
  });
  const write = (file: string, contents: string) =>
    fs.writeFileString(path.join(root, file), contents);
  yield* fs.makeDirectory(path.join(root, "confect", "tables"), {
    recursive: true,
  });
  yield* fs.makeDirectory(path.join(root, "convex"));
  yield* write("package.json", '{"type":"module"}');
  yield* write(
    "tsconfig.json",
    '{"compilerOptions":{"moduleResolution":"Bundler"}}',
  );
  yield* write("confect/tables/notes.ts", table);
  yield* write("confect/notes.spec.ts", spec);
  yield* write("confect/notes.impl.ts", impl);

  const start = Effect.fnUntraced(function* (command: "dev" | "codegen") {
    const spawner = yield* ChildProcessSpawner;
    const handle = yield* spawner.spawn(
      ChildProcess.make(
        process.execPath,
        [path.resolve(import.meta.dirname, "../../bin/confect.mjs"), command],
        { cwd: root, extendEnv: true, env: { NO_COLOR: "1" } },
      ),
    );
    const output = yield* Ref.make("");
    const lines = yield* Queue.unbounded<string>();
    yield* Stream.merge(
      handle.stdout.pipe(Stream.decodeText(), Stream.splitLines),
      handle.stderr.pipe(Stream.decodeText(), Stream.splitLines),
    ).pipe(
      Stream.runForEach((line) =>
        Ref.update(output, (previous) => `${previous}${line}\n`).pipe(
          Effect.andThen(Queue.offer(lines, line)),
        ),
      ),
      Effect.forkScoped,
    );
    const waitFor = (text: string) =>
      Stream.fromQueue(lines).pipe(
        Stream.filter((line) => line.includes(text)),
        Stream.take(1),
        Stream.runCollect,
        Effect.timeoutOption("15 seconds"),
        Effect.flatMap((result) =>
          Ref.get(output).pipe(
            Effect.map((log) => {
              expect(result._tag, `Waiting for ${text}:\n${log}`).toBe("Some");
            }),
          ),
        ),
      );
    return { handle, output, waitFor };
  });
  return { root, write, start };
});
