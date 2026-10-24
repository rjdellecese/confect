import * as Effect from "effect/Effect";
import * as Console from "effect/Console";
import * as Data from "effect/Data";
import * as Exit from "effect/Exit";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Queue from "effect/Queue";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/process/ChildProcess";
import {
  ChildProcessSpawner,
  makeHandle,
} from "effect/process/ChildProcessSpawner";
import { ProjectRoot } from "@confect/cli/ProjectRoot";
import { ConfectDirectory } from "@confect/cli/ConfectDirectory";
import { ConvexDirectory } from "@confect/cli/ConvexDirectory";

type ProcessPhase = Data.TaggedEnum<{
  Started: {};
  WaitingForOutput: { readonly text: string; readonly attempt: number };
  OutputReceived: { readonly text: string; readonly attempt: number };
  WaitingForExit: {};
  Exited: { readonly code: number };
}>;

const ProcessPhase = Data.taggedEnum<ProcessPhase>();

export class ReadinessTimeout extends Schema.TaggedError<ReadinessTimeout>()(
  "ReadinessTimeout",
  {
    command: Schema.Literals(["dev", "codegen"]),
    text: Schema.String,
    attempt: Schema.Int,
    output: Schema.String,
  },
) {
  override get message() {
    return `confect ${this.command}: waiting for ${this.text} (wait ${this.attempt}, 15 seconds):\n${this.output}`;
  }
}

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

export const writtenFiles = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const writes = yield* Ref.make<ReadonlyArray<string>>([]);
    const record = (file: string) =>
      file.endsWith(".ts")
        ? Ref.update(writes, (paths) => [...paths, file])
        : Effect.void;
    yield* effect.pipe(
      Effect.provideService(FileSystem.FileSystem, {
        ...fs,
        writeFile: (...args) =>
          fs.writeFile(...args).pipe(Effect.tap(() => record(args[0]))),
        writeFileString: (...args) =>
          fs.writeFileString(...args).pipe(Effect.tap(() => record(args[0]))),
      }),
    );
    return yield* Ref.get(writes);
  });

export const installPackages = Effect.fnUntraced(function* (root: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  for (const name of ["core", "server"]) {
    const source = path.resolve(import.meta.dirname, "../../../", name);
    const installed = path.join(root, "node_modules", "@confect", name);
    yield* fs.makeDirectory(installed, { recursive: true });
    yield* fs.copyFile(
      path.join(source, "package.json"),
      path.join(installed, "package.json"),
    );
    yield* fs.copy(path.join(source, "dist"), path.join(installed, "dist"));
    yield* fs.symlink(
      path.join(source, "node_modules"),
      path.join(installed, "node_modules"),
    );
  }
});

export const make = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const root = yield* fs.makeTempDirectoryScoped({
    directory: import.meta.dirname,
    prefix: "consumer-",
  });
  yield* installPackages(root);
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
    const phase = yield* Ref.make<ProcessPhase>(ProcessPhase.Started());
    const waits = yield* Ref.make(0);
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
    yield* Effect.addFinalizer((exit) =>
      Exit.isFailure(exit)
        ? Effect.gen(function* () {
            const current = yield* Ref.get(phase);
            const log = yield* Ref.get(output);
            const description = ProcessPhase.$match(current, {
              Started: () => "started",
              WaitingForOutput: ({ text, attempt }) =>
                `waiting for output ${text} (wait ${attempt})`,
              OutputReceived: ({ text, attempt }) =>
                `received output ${text} (wait ${attempt}); no process wait active`,
              WaitingForExit: () => "waiting for exit",
              Exited: ({ code }) => `exited with code ${code}`,
            });
            yield* Console.error(
              `confect ${command} (pid ${handle.pid}) scope ${Exit.hasInterrupts(exit) ? "interrupted" : "failed"}; phase: ${description}\n${log}`,
            );
          })
        : Effect.void,
    );
    const waitFor = Effect.fnUntraced(function* (text: string) {
      const attempt = yield* Ref.updateAndGet(waits, (count) => count + 1);
      yield* Ref.set(phase, ProcessPhase.WaitingForOutput({ text, attempt }));
      const result = yield* Queue.take(lines).pipe(
        Effect.repeat({ while: (line) => !line.includes(text) }),
        Effect.timeoutOption("15 seconds"),
      );
      if (result._tag === "None") {
        return yield* new ReadinessTimeout({
          command,
          text,
          attempt,
          output: yield* Ref.get(output),
        });
      }
      yield* Ref.set(phase, ProcessPhase.OutputReceived({ text, attempt }));
    });
    const exitCode = Effect.gen(function* () {
      yield* Ref.set(phase, ProcessPhase.WaitingForExit());
      const code = yield* handle.exitCode;
      yield* Ref.set(phase, ProcessPhase.Exited({ code: Number(code) }));
      return code;
    });
    return { handle: makeHandle({ ...handle, exitCode }), output, waitFor };
  });
  const generatedFiles = Effect.gen(function* () {
    const files = yield* Effect.forEach(
      ["confect/_generated", "convex"],
      (directory) =>
        fs
          .readDirectory(path.join(root, directory), { recursive: true })
          .pipe(
            Effect.map((entries) =>
              entries
                .filter((entry) => entry.endsWith(".ts"))
                .map((entry) => path.join(directory, entry)),
            ),
          ),
    );
    return Object.fromEntries(
      yield* Effect.forEach(files.flat(), (file) =>
        fs
          .readFileString(path.join(root, file))
          .pipe(Effect.map((contents) => [file, contents] as const)),
      ),
    );
  });
  const provide = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.provideService(ProjectRoot, { get: Effect.succeed(root) }),
      Effect.provideService(ConfectDirectory, {
        get: Effect.succeed(path.join(root, "confect")),
      }),
      Effect.provideService(ConvexDirectory, {
        get: Effect.succeed(path.join(root, "convex")),
      }),
    );
  return { root, write, start, generatedFiles, provide };
});

export const makeConfigProfiles = Effect.gen(function* () {
  const project = yield* make;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fs.makeDirectory(path.join(project.root, "confect/helpers"));
  yield* fs.makeDirectory(path.join(project.root, "confect/nested"));
  yield* project.write(
    "tsconfig.json",
    '{"compilerOptions":{"moduleResolution":"Bundler","jsxFactory":"rootFactory.h"}}',
  );
  yield* project.write(
    "confect/nested/tsconfig.json",
    '{"extends":"../../tsconfig.json","compilerOptions":{"jsxFactory":"nestedFactory.h"}}',
  );
  const writeNames = (rootName: string, nestedName: string) =>
    project.write(
      "confect/helpers/name.tsx",
      `const rootFactory = { h: () => ${JSON.stringify(rootName)}, z: () => ${JSON.stringify(`configured${rootName}`)} };\nconst nestedFactory = { h: () => ${JSON.stringify(nestedName)} };\nexport const name = <div />;\n`,
    );
  yield* writeNames("list", "other");
  yield* project.write(
    "confect/notes.spec.ts",
    `import { name } from "./helpers/name";\n${spec.replace('name: "list"', "name")}`,
  );
  yield* project.write(
    "confect/notes.impl.ts",
    `import { name } from "./helpers/name";\n${impl.replace('"list"', "name")}`,
  );
  yield* project.write(
    "confect/nested/other.spec.ts",
    `import { name } from "../helpers/name";\n${spec.replace('name: "list"', "name").replace('"./_generated/', '"../_generated/')}`,
  );
  yield* project.write(
    "confect/nested/other.impl.ts",
    `import { name } from "../helpers/name";\n${impl.replaceAll('"./_generated/', '"../_generated/').replace('"./notes.spec"', '"./other.spec"').replace('"list"', "name")}`,
  );
  return { ...project, writeNames };
});

export const makeInheritedConfigProfiles = Effect.gen(function* () {
  const project = yield* makeConfigProfiles;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  yield* fs.makeDirectory(path.join(project.root, "configs"));
  const writeBaseConfig = (jsxFactory: string) =>
    project.write(
      "configs/base.json",
      JSON.stringify({
        compilerOptions: {
          baseUrl: "..",
          paths: { "@profile/name": ["./confect/helpers/name.tsx"] },
          jsxFactory,
        },
      }),
    );
  yield* writeBaseConfig("rootFactory.h");
  yield* project.write(
    "configs/overrides.json",
    '{"compilerOptions":{"target":"ES2022"}}',
  );
  yield* project.write(
    "tsconfig.json",
    '{"extends":["./configs/base.json","./configs/overrides.json"],"compilerOptions":{"moduleResolution":"Bundler"}}',
  );
  for (const file of [
    "confect/notes.spec.ts",
    "confect/notes.impl.ts",
    "confect/nested/other.spec.ts",
    "confect/nested/other.impl.ts",
  ]) {
    const contents = yield* fs.readFileString(path.join(project.root, file));
    yield* project.write(
      file,
      contents
        .replace('"./helpers/name"', '"@profile/name"')
        .replace('"../helpers/name"', '"@profile/name"'),
    );
  }
  return { ...project, writeBaseConfig };
});
