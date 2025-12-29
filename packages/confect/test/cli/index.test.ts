import { FileSystem, Path as Path_, Terminal } from "@effect/platform";
import { assert, describe, expect, it, vi } from "@effect/vitest";
import type { HashMap, HashSet } from "effect";
import {
  Array,
  Brand,
  Console,
  Effect,
  Exit,
  Layer,
  Mailbox,
  Ref,
} from "effect";

import { NodeContext, NodeFileSystem } from "@effect/platform-node";
import { cli } from "../../src/cli/cli";

/**
 * Creates a mock Console that captures output for testing.
 */
const makeTestConsole = () =>
  Effect.gen(function* () {
    const outputRef = yield* Ref.make<string[]>([]);

    const captureOutput = (...args: ReadonlyArray<unknown>) =>
      Ref.update(outputRef, Array.appendAll(Array.map(args, String)));

    const unimplementedMethod = (method: string) =>
      Effect.die(`Unimplemented \`Console\` method: ${method}`);

    const unimplementedUnsafeMethod = (method: string) => () => {
      throw `Unimplemented \`UnsafeConsole\` method: ${method}`;
    };

    const console: Console.Console = {
      [Console.TypeId]: Console.TypeId,
      assert: () => unimplementedMethod("assert"),
      clear: unimplementedMethod("clear"),
      count: () => unimplementedMethod("count"),
      countReset: () => unimplementedMethod("countReset"),
      debug: captureOutput,
      dir: () => unimplementedMethod("dir"),
      dirxml: () => unimplementedMethod("dirxml"),
      error: captureOutput,
      group: () => unimplementedMethod("group"),
      groupEnd: unimplementedMethod("groupEnd"),
      info: captureOutput,
      log: captureOutput,
      table: () => unimplementedMethod("table"),
      time: () => unimplementedMethod("time"),
      timeEnd: () => unimplementedMethod("timeEnd"),
      timeLog: () => unimplementedMethod("timeLog"),
      trace: captureOutput,
      warn: captureOutput,
      unsafe: {
        assert: unimplementedUnsafeMethod("assert"),
        clear: unimplementedUnsafeMethod("clear"),
        count: unimplementedUnsafeMethod("count"),
        countReset: unimplementedUnsafeMethod("countReset"),
        debug: unimplementedUnsafeMethod("debug"),
        dir: unimplementedUnsafeMethod("dir"),
        dirxml: unimplementedUnsafeMethod("dirxml"),
        error: unimplementedUnsafeMethod("error"),
        group: unimplementedUnsafeMethod("group"),
        groupCollapsed: unimplementedUnsafeMethod("groupCollapsed"),
        groupEnd: unimplementedUnsafeMethod("groupEnd"),
        info: unimplementedUnsafeMethod("info"),
        log: unimplementedUnsafeMethod("log"),
        table: unimplementedUnsafeMethod("table"),
        time: unimplementedUnsafeMethod("time"),
        timeEnd: unimplementedUnsafeMethod("timeEnd"),
        timeLog: unimplementedUnsafeMethod("timeLog"),
        trace: unimplementedUnsafeMethod("trace"),
        warn: unimplementedUnsafeMethod("warn"),
      },
    };

    return { console, outputRef };
  });

type Path = string & Brand.Brand<"Path">;
const Path = Brand.nominal<Path>();

type Contents = string & Brand.Brand<"Contents">;
const Contents = Brand.nominal<Contents>();

type Files = HashMap.HashMap<Path, Contents> & Brand.Brand<"Files">;
const Files = Brand.nominal<Files>();

type Directories = HashSet.HashSet<Path> & Brand.Brand<"Directories">;
const Directories = Brand.nominal<Directories>();

/**
 * A mock Terminal layer that provides a no-op implementation for testing.
 */
const TerminalTest = Layer.succeed(Terminal.Terminal, {
  columns: Effect.succeed(80),
  readInput: Mailbox.make<Terminal.UserInput>(),
  readLine: Effect.succeed(""),
  display: () => Effect.void,
});

/**
 * Test layer for platform services (FileSystem, Path, Terminal).
 */
const ServicesTest = Layer.mergeAll(
  FileSystem.layerNoop({}),
  Path_.layer,
  TerminalTest,
);

it.effect("displays help when --help flag is provided", () =>
  Effect.gen(function* () {
    const { console, outputRef } = yield* makeTestConsole();

    // Run the CLI with --help, using our test console
    const exit = yield* cli(["node", "confect", "--help"]).pipe(
      Effect.provide(ServicesTest),
      Effect.withConsole(console),
      Effect.exit,
    );

    // --help causes the CLI to exit successfully
    expect(exit._tag).toStrictEqual("Success");

    // Verify the output contains expected help text
    const output = Array.join(yield* Ref.get(outputRef), "/n");

    expect(output).toContain("USAGE");
    expect(output).toContain("DESCRIPTION");
    expect(output).toContain("OPTIONS");
    expect(output).toContain("COMMANDS");
  }),
);

describe("codegen", () => {
  it.effect("generates a Confect directory", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path_.Path;

      const cwd = yield* fs.makeTempDirectory();
      vi.spyOn(process, "cwd").mockReturnValue(cwd);

      yield* fs.makeDirectory(path.join(cwd, "confect"));
      yield* fs.copy(
        path.join(process.cwd(), "test", "confect"),
        path.join(cwd, "confect"),
      );
      yield* fs.copy(
        path.join(process.cwd(), "package.json"),
        path.join(cwd, "package.json"),
      );
      yield* fs.copy(
        path.join(process.cwd(), "tsconfig.json"),
        path.join(cwd, "tsconfig.json"),
      );
      yield* fs.copy(
        path.join(process.cwd(), "node_modules"),
        path.join(cwd, "node_modules"),
      );
      yield* fs.copy(path.join(process.cwd(), "dist"), path.join(cwd, "dist"));

      yield* Console.log(
        yield* fs.readDirectory(path.join(cwd, "confect"), { recursive: true }),
      );

      const { console } = yield* makeTestConsole();

      const exit = yield* cli(["node", "confect", "codegen"]).pipe(
        Effect.provide(
          Layer.mergeAll(NodeFileSystem.layer, Path_.layer, TerminalTest),
        ),
        Effect.withConsole(console),
        Effect.exit,
      );

      if (Exit.isFailure(exit)) {
        yield* Console.log(exit.cause);
      }

      assert(Exit.isSuccess(exit));

      vi.restoreAllMocks();
    }).pipe(Effect.provide(NodeContext.layer)),
  );
});
