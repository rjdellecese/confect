#!/usr/bin/env node

import { Command, Options } from "@effect/cli";
import { FileSystem, Path } from "@effect/platform";
import { NodeContext, NodeRuntime } from "@effect/platform-node";
import type { PlatformError } from "@effect/platform/Error";
import type { Options as CodeBlockWriterOptions } from "code-block-writer";
import CodeBlockWriter_ from "code-block-writer";
import { Array, Console, Effect, Option, Record, String } from "effect";
import * as tsx from "tsx/esm/api";
import packageJson from "../../package.json" with { type: "json" };
import * as ConfectApiServer from "../api/ConfectApiServer";
import * as ConfectSchema from "../server/ConfectSchema";
import { forEachBranchLeaves } from "../utils";

// Define a simple dummy command
const nameOption = Options.text("name").pipe(
  Options.withAlias("n"),
  Options.withDescription("Your name"),
  Options.withDefault("World")
);

const greetCommand = Command.make("greet", { name: nameOption }, ({ name }) =>
  Console.log(`Hello, ${name}!`).pipe(
    Effect.tap(() => Console.log("This is a dummy Confect CLI command."))
  )
).pipe(Command.withDescription("A simple greeting command"));

const generateCommand = Command.make("generate", {}, () =>
  Effect.gen(function* () {
    yield* generateSchema;

    const path = yield* Path.Path;

    const serverPath = path.join(".", "confect", "server.ts");
    const serverUrl = yield* path.toFileUrl(serverPath);

    const server = yield* Effect.promise(() =>
      tsx.tsImport(serverUrl.href, import.meta.url)
    ).pipe(
      Effect.andThen((serverModule) => {
        const defaultExport = serverModule.default;

        return ConfectApiServer.isConfectApiServer(defaultExport)
          ? Effect.succeed(defaultExport)
          : Effect.die("Invalid server module");
      })
    );

    yield* forEachBranchLeaves<
      ConfectApiServer.RegisteredFunction,
      void,
      PlatformError,
      FileSystem.FileSystem | Path.Path
    >(
      server.registeredFunctions,
      ConfectApiServer.isRegisteredFunction,
      ({ path, values }) =>
        Effect.gen(function* () {
          const mod = Array.head(path).pipe(
            Option.getOrThrowWith(
              () => new Error("Missing module name in function path")
            )
          );
          const dirs = Array.tail(path).pipe(
            Option.getOrThrowWith(
              () => new Error("Missing directory names in function path")
            )
          );
          const fns = Record.keys(values);

          yield* generateFunctionModule({
            dirs,
            mod,
            fns,
          });
        })
    );
  })
).pipe(Command.withDescription("Generate Convex functions from a Confect API"));

const generateSchema = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  const cwd = path.resolve(".");

  const confectSchemaPath = path.join(cwd, "confect", "schema.ts");
  const confectSchemaUrl = yield* path.toFileUrl(confectSchemaPath);

  const confectSchema = yield* Effect.promise(() =>
    tsx.tsImport(confectSchemaUrl.href, import.meta.url)
  ).pipe(
    Effect.andThen((schemaModule) => {
      const defaultExport = schemaModule.default;

      return ConfectSchema.isConfectSchemaDefinition(defaultExport)
        ? Effect.succeed(defaultExport)
        : Effect.die("Invalid schema module");
    })
  );

  const codeBlockWriter = new CodeBlockWriter();

  const convexDir = path.join(cwd, "convex");
  const convexSchemaPath = path.join(convexDir, "schema.ts");

  const relativeImportPath = path.relative(
    path.dirname(convexSchemaPath),
    confectSchemaPath
  );
  const importPathWithoutExt = yield* removePathExtension(relativeImportPath);

  yield* codeBlockWriter.writeLine(
    `import confectSchemaDefinition from "${importPathWithoutExt}";`
  );
  yield* codeBlockWriter.newLine();
  yield* codeBlockWriter.writeLine(
    `export default confectSchemaDefinition.convexSchemaDefinition;`
  );

  const schemaContents = new TextEncoder().encode(
    yield* codeBlockWriter.toString()
  );

  yield* fs.writeFile(convexSchemaPath, schemaContents);
});

const generateFunctionModule = ({
  dirs,
  mod,
  fns,
}: {
  dirs: string[];
  mod: string;
  fns: string[];
}) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;

    // TODO: Use the functions dir specified in `convex.json`
    const convexPath = path.join(".", "convex");

    const directoryPath = path.join(convexPath, "confect", ...dirs);
    if (!(yield* fs.exists(directoryPath))) {
      yield* fs.makeDirectory(directoryPath, { recursive: true });
    }

    const modulePath = path.join(directoryPath, `${mod}.ts`);

    const codeBlockWriter = new CodeBlockWriter();

    const serverPath = path.join(".", "confect", "server.ts");
    const serverImportPath = yield* removePathExtension(
      path.relative(path.dirname(modulePath), serverPath)
    );

    yield* codeBlockWriter.writeLine(
      `import server from "${serverImportPath}";`
    );
    yield* codeBlockWriter.newLine();
    for (const fn of fns) {
      yield* codeBlockWriter.writeLine(
        `export const ${fn} = ${Array.join(["server", "registeredFunctions", ...dirs, mod, fn], ".")};`
      );
    }

    const moduleContents = new TextEncoder().encode(
      yield* codeBlockWriter.toString()
    );
    yield* fs.writeFile(modulePath, moduleContents);
  });

const removePathExtension = (pathStr: string) =>
  Effect.gen(function* () {
    const path = yield* Path.Path;

    return String.slice(0, -path.extname(pathStr).length)(pathStr);
  });

const cli = Command.make("confect").pipe(
  Command.withDescription("Confect - Use Effect with Convex!"),
  Command.withSubcommands([greetCommand, generateCommand])
);

const main = Command.run(cli, {
  name: "Confect",
  version: packageJson.version,
});

main(process.argv).pipe(Effect.provide(NodeContext.layer), NodeRuntime.runMain);

class CodeBlockWriter {
  private readonly writer: CodeBlockWriter_;

  constructor(opts?: Partial<CodeBlockWriterOptions>) {
    this.writer = new CodeBlockWriter_(opts);
  }

  indent<E = never, R = never>(
    eff: Effect.Effect<void, E, R>
  ): Effect.Effect<void, E, R> {
    return Effect.gen(this, function* () {
      const indentationLevel = this.writer.getIndentationLevel();
      this.writer.setIndentationLevel(indentationLevel + 1);
      yield* eff;
      this.writer.setIndentationLevel(indentationLevel);
    });
  }

  writeLine<E = never, R = never>(line: string): Effect.Effect<void, E, R> {
    return Effect.sync(() => {
      this.writer.writeLine(line);
    });
  }

  write<E = never, R = never>(text: string): Effect.Effect<void, E, R> {
    return Effect.sync(() => {
      this.writer.write(text);
    });
  }

  quote<E = never, R = never>(text: string): Effect.Effect<void, E, R> {
    return Effect.sync(() => {
      this.writer.quote(text);
    });
  }

  conditionalWriteLine<E = never, R = never>(
    condition: boolean,
    text: string
  ): Effect.Effect<void, E, R> {
    return Effect.sync(() => {
      this.writer.conditionalWriteLine(condition, text);
    });
  }

  newLine<E = never, R = never>(): Effect.Effect<void, E, R> {
    return Effect.sync(() => {
      this.writer.newLine();
    });
  }

  blankLine<E = never, R = never>(): Effect.Effect<void, E, R> {
    return Effect.sync(() => {
      this.writer.blankLine();
    });
  }

  toString<E = never, R = never>(): Effect.Effect<string, E, R> {
    return Effect.sync(() => this.writer.toString());
  }
}
