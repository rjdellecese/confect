import * as Config from "effect/Config";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

export interface PrepareCommand {
  readonly command: string;
  readonly args: ReadonlyArray<string>;
}

export class CommandError extends Schema.TaggedError<CommandError>()(
  "CommandError",
  {
    operation: Schema.Literals(["prepare", "deploy"]),
    reason: Schema.Literals(["configuration", "spawn", "exit"]),
    exitCode: Schema.optionalKey(Schema.Finite),
  },
) {}

export class CommandRunner extends Context.Service<
  CommandRunner,
  {
    readonly prepare: (
      command: PrepareCommand,
      cwd?: string,
    ) => Effect.Effect<void, CommandError>;
    readonly deploy: (
      deployKey: Redacted.Redacted<string>,
      cwd?: string,
    ) => Effect.Effect<void, CommandError>;
  }
>()("@confect/alchemy/internal/CommandRunner") {}

const packageBin = Effect.fn("CommandRunner.packageBin")(function* (
  fs: FileSystem.FileSystem,
  path: Path.Path,
  cwd: string,
  packageName: string,
  binName: string,
) {
  const invalid = () =>
    new CommandError({
      operation: packageName === "convex" ? "deploy" : "prepare",
      reason: "configuration",
    });
  let directory = cwd;
  while (true) {
    const manifestPath = path.join(
      directory,
      "node_modules",
      packageName,
      "package.json",
    );
    if (yield* fs.exists(manifestPath).pipe(Effect.mapError(invalid))) {
      const manifest = yield* fs.readFileString(manifestPath).pipe(
        Effect.flatMap(
          Schema.decodeEffect(
            Schema.fromJsonString(
              Schema.Struct({
                bin: Schema.Union([
                  Schema.String,
                  Schema.Record(Schema.String, Schema.String),
                ]),
              }),
            ),
          ),
        ),
        Effect.mapError(invalid),
      );
      const relative =
        typeof manifest.bin === "string" ? manifest.bin : manifest.bin[binName];
      if (!relative) return yield* invalid();
      return path.resolve(path.dirname(manifestPath), relative);
    }
    const parent = path.dirname(directory);
    if (parent === directory) return yield* invalid();
    directory = parent;
  }
});

export const layer = Layer.effect(
  CommandRunner,
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const run = Effect.fn("CommandRunner.run")(function* (
      operation: "prepare" | "deploy",
      command: string,
      args: ReadonlyArray<string>,
      cwd: string,
      env: Record<string, string | undefined>,
    ) {
      const code = yield* spawner
        .exitCode(
          ChildProcess.make(command, args, {
            cwd,
            env,
            extendEnv: false,
            stdin: "ignore",
            stdout: "ignore",
            stderr: "ignore",
          }),
        )
        .pipe(
          Effect.mapError(
            () => new CommandError({ operation, reason: "spawn" }),
          ),
        );
      if (code !== 0)
        return yield* new CommandError({
          operation,
          reason: "exit",
          exitCode: Number(code),
        });
    });
    const environment = Config.all({
      PATH: Config.String("PATH").pipe(
        Config.orElse(() => Config.String("Path")),
        Config.withDefault(""),
      ),
      HOME: Config.String("HOME").pipe(Config.withDefault("")),
      USERPROFILE: Config.String("USERPROFILE").pipe(Config.withDefault("")),
      SystemRoot: Config.String("SystemRoot").pipe(
        Config.orElse(() => Config.String("SYSTEMROOT")),
        Config.withDefault(""),
      ),
      TMPDIR: Config.String("TMPDIR").pipe(Config.withDefault("")),
      TEMP: Config.String("TEMP").pipe(Config.withDefault("")),
    }).pipe(Effect.map((env) => ({ ...env, CI: "true", DO_NOT_TRACK: "1" })));
    return CommandRunner.of({
      prepare: Effect.fn("CommandRunner.prepare")(function* (
        command,
        cwd = process.cwd(),
      ) {
        const directory = path.resolve(cwd);
        const env = yield* environment.pipe(
          Effect.mapError(
            () =>
              new CommandError({
                operation: "prepare",
                reason: "configuration",
              }),
          ),
        );
        if (command.command === "confect") {
          const bin = yield* packageBin(
            fs,
            path,
            directory,
            "@confect/cli",
            "confect",
          );
          yield* run(
            "prepare",
            process.execPath,
            [bin, ...command.args],
            directory,
            env,
          );
        } else {
          yield* run("prepare", command.command, command.args, directory, env);
        }
      }),
      deploy: Effect.fn("CommandRunner.deploy")(function* (
        deployKey,
        cwd = process.cwd(),
      ) {
        const directory = path.resolve(cwd);
        const bin = yield* packageBin(fs, path, directory, "convex", "convex");
        const env = yield* environment.pipe(
          Effect.mapError(
            () =>
              new CommandError({
                operation: "deploy",
                reason: "configuration",
              }),
          ),
        );
        yield* Effect.scoped(
          Effect.gen(function* () {
            const temp = yield* fs.makeTempDirectoryScoped({
              prefix: "confect-deploy-",
            });
            const envFile = path.join(temp, "deployment.env");
            yield* fs.writeFileString(
              envFile,
              `CONVEX_DEPLOY_KEY=${Redacted.value(deployKey)}\n`,
              { mode: 0o600 },
            );
            yield* run(
              "deploy",
              process.execPath,
              [bin, "deploy", "--yes", "--env-file", envFile],
              directory,
              {
                ...env,
                HOME: temp,
                USERPROFILE: temp,
                LOCALAPPDATA: temp,
                XDG_CONFIG_HOME: temp,
              },
            );
          }).pipe(
            Effect.mapError((error) =>
              Schema.is(CommandError)(error)
                ? error
                : new CommandError({
                    operation: "deploy",
                    reason: "configuration",
                  }),
            ),
          ),
        );
      }),
    });
  }),
);
