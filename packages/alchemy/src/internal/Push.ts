import type { ProviderServiceInput } from "alchemy/Provider";
import { createRequire } from "node:module";
import { execPath, env as processEnv } from "node:process";
import * as String from "effect/String";

import * as Effect from "effect/Effect";
import { FileSystem } from "effect/FileSystem";
import { Path } from "effect/Path";
import * as ChildProcess from "effect/process/ChildProcess";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";
import type { Code } from "./Resources.js";
import { type PrepareCommand } from "./Resources.js";
import { authorize, InvalidTarget } from "./Target.js";
import { access } from "./Recovery.js";

class CommandFailure extends Schema.TaggedError<
  CommandFailure,
  { readonly brand: unique symbol }
>()("CommandFailure", {
  phase: Schema.Literals(["prepare", "deploy"]),
  exitStatus: Schema.optionalKey(Schema.Int),
}) {
  override get message(): string {
    return this.exitStatus === undefined
      ? `Could not run the ${this.phase} command.`
      : `The ${this.phase} command exited with status ${this.exitStatus}.`;
  }
}
const manifest = Schema.fromJsonString(
  Schema.Struct({
    bin: Schema.Union([
      Schema.String,
      Schema.Record(Schema.String, Schema.String),
    ]),
  }),
);
const installedCommand = Effect.fn("Convex.installedCommand")(function* (
  cwd: string,
  command: PrepareCommand,
  phase: CommandFailure["phase"],
) {
  if (command.command !== "confect" && command.command !== "convex")
    return command;
  const path = yield* Path;
  const fs = yield* FileSystem;
  const pkg = command.command === "confect" ? "@confect/cli" : "convex";
  const location = yield* Effect.try({
    try: () =>
      createRequire(path.resolve(cwd, "package.json")).resolve(
        `${pkg}/package.json`,
      ),
    catch: () => CommandFailure.make({ phase }),
  });
  const info = yield* fs.readFileString(location).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(manifest)),
    Effect.mapError(() => CommandFailure.make({ phase })),
  );
  const bin =
    typeof info.bin === "string" ? info.bin : info.bin[command.command];
  if (bin === undefined || bin === "")
    return yield* CommandFailure.make({ phase });
  const executable = path.resolve(path.dirname(location), bin);
  return [".cjs", ".mjs", ".js"].includes(path.extname(bin))
    ? { command: execPath, args: [executable, ...command.args] }
    : { command: executable, args: command.args };
});

const run = Effect.fn("Convex.runCommand")(function* (
  phase: CommandFailure["phase"],
  cwd: string,
  command: PrepareCommand,
  env: Readonly<globalThis.Record<string, string>>,
) {
  const resolved = yield* installedCommand(cwd, command, phase);
  const spawner = yield* ChildProcessSpawner;
  const status = yield* spawner
    .exitCode(
      ChildProcess.make(resolved.command, resolved.args, {
        cwd,
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
        extendEnv: false,
        env,
      }),
    )
    .pipe(Effect.mapError(() => CommandFailure.make({ phase })));
  if (status !== 0)
    return yield* CommandFailure.make({ phase, exitStatus: status });
});

export const pushes = Effect.succeed({
  list: () => Effect.succeed([]),
  diff: () => Effect.succeed({ action: "update" as const }),
  reconcile: Effect.fn("Convex.Code.reconcile")(function* ({
    news,
    fqn,
    instanceId,
  }) {
    const target = yield* Effect.fromResult(
      authorize(news.deployment.url, news.deployment.name, news.deployKey),
    );
    const cwd = news.cwd ?? ".";
    const path = yield* Path;
    const fs = yield* FileSystem;
    const directory = yield* fs
      .makeTempDirectoryScoped()
      .pipe(Effect.mapError(() => CommandFailure.make({ phase: "deploy" })));
    const envFile = path.join(directory, "deployment.env");
    const env: globalThis.Record<string, string> = {};
    for (const name in processEnv) {
      const key = String.toUpperCase(name);
      if (
        ![
          "PATH",
          "PATHEXT",
          "SYSTEMROOT",
          "WINDIR",
          "SYSTEMDRIVE",
          "PROGRAMDATA",
          "PROGRAMFILES",
          "PROGRAMFILES(X86)",
          "COMSPEC",
          "TMP",
          "TEMP",
          "TMPDIR",
          "LANG",
          "LC_ALL",
        ].includes(key)
      )
        continue;
      const value = processEnv[name];
      if (value !== undefined) env[key] = value;
    }
    const isolatedEnv = {
      ...env,
      PATH:
        env.PATH === undefined
          ? path.dirname(execPath)
          : `${path.dirname(execPath)}${path.sep === "\\" ? ";" : ":"}${env.PATH}`,
      HOME: directory,
      USERPROFILE: directory,
      APPDATA: directory,
      LOCALAPPDATA: directory,
      XDG_CONFIG_HOME: directory,
      XDG_DATA_HOME: directory,
      XDG_CACHE_HOME: directory,
      CI: "1",
    };
    if (news.prepare !== undefined)
      yield* run("prepare", cwd, news.prepare, isolatedEnv);
    const material = yield* Effect.try({
      try: () => Redacted.value(news.deployKey),
      catch: () => InvalidTarget.make({ field: "deployKey" }),
    });
    yield* fs
      .writeFileString(envFile, `CONVEX_DEPLOY_KEY=${material}\n`, {
        mode: 0o600,
        flag: "wx",
      })
      .pipe(Effect.mapError(() => CommandFailure.make({ phase: "deploy" })));
    yield* access({ fqn, instanceId, type: "Convex.Code" });
    yield* run(
      "deploy",
      cwd,
      {
        command: "convex",
        args: [
          "deploy",
          "--cmd-url-env-var-name",
          "ALCHEMY_SELECTED_ORIGIN",
          "--cmd",
          'node -e "process.exit(process.env.ALCHEMY_SELECTED_ORIGIN===process.env.ALCHEMY_EXPECTED_ORIGIN?0:1)"',
          "--env-file",
          envFile,
        ],
      },
      { ...isolatedEnv, ALCHEMY_EXPECTED_ORIGIN: target.url },
    );
    return target;
  }, Effect.scoped),
  delete: () => Effect.void,
} satisfies ProviderServiceInput<
  Code,
  never,
  never,
  never,
  FileSystem | Path | ChildProcessSpawner
>);
