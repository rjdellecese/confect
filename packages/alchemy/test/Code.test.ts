import * as NodeServices from "@effect/platform-node/NodeServices";
import { describe, expect, it } from "@effect/vitest";
import {
  provider as codeProvider,
  type CodeProps,
} from "@confect/alchemy/Code";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { ChildProcessSpawner } from "effect/unstable/process";
import { deploy } from "../src/internal/CodeDeployment";
import {
  CommandError,
  CommandRunner,
  layer as runnerLayer,
} from "../src/internal/CommandRunner";

const serialize = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const props: CodeProps = {
  deployment: {
    name: "happy-otter-123",
    url: "https://happy-otter-123.convex.cloud",
  },
  deployKey: Redacted.make("prod:happy-otter-123|test-secret"),
  prepare: { command: "confect", args: ["codegen"] },
};
const lifecycle = {
  id: "Code",
  fqn: "Code",
  instanceId: "test",
  bindings: [],
  session: {
    emit: () => Effect.void,
    done: () => Effect.void,
    note: () => Effect.void,
  },
};
const recorder = (calls: string[]) =>
  Layer.succeed(CommandRunner, {
    prepare: () =>
      Effect.sync(() => {
        calls.push("prepare");
      }),
    deploy: () =>
      Effect.sync(() => {
        calls.push("deploy");
      }),
  });

describe("Code", () => {
  it.effect(
    "prepares before every deployment, including unchanged resource props",
    () =>
      Effect.gen(function* () {
        const calls: string[] = [];
        yield* Effect.gen(function* () {
          const provider = yield* codeProvider;
          const output = yield* provider
            .reconcile({
              ...lifecycle,
              news: props,
              olds: undefined,
              output: undefined,
            })
            .pipe(Effect.orDie);
          expect(output).toEqual(props.deployment);
          for (let run = 0; run < 2; run++) {
            expect(yield* provider.diff()).toEqual({ action: "update" });
            yield* provider
              .reconcile({
                ...lifecycle,
                news: props,
                olds: props,
                output,
              })
              .pipe(Effect.orDie);
          }
          expect(provider).not.toHaveProperty("stables");
          yield* provider.delete();
          expect(calls).toEqual([
            "prepare",
            "deploy",
            "prepare",
            "deploy",
            "prepare",
            "deploy",
          ]);
        }).pipe(Effect.provide(recorder(calls)));
      }),
  );

  it.effect("does not deploy after preparation fails", () =>
    Effect.gen(function* () {
      let pushed = false;
      const result = yield* deploy(props).pipe(
        Effect.provideService(CommandRunner, {
          prepare: () =>
            Effect.fail(
              new CommandError({
                operation: "prepare",
                reason: "exit",
                exitCode: 2,
              }),
            ),
          deploy: () =>
            Effect.sync(() => {
              pushed = true;
            }),
        }),
        Effect.result,
      );
      expect(Result.isFailure(result)).toBe(true);
      expect(pushed).toBe(false);
      expect(serialize(result)).not.toContain("test-secret");
    }),
  );

  it.effect(
    "rejects mismatched and provisioning credentials before any commands",
    () =>
      Effect.gen(function* () {
        const calls: string[] = [];
        for (const key of [
          "prod:other-deployment|secret",
          "preview:team:project|secret",
          "project:example|secret",
          "secret",
          "prod:happy-otter-123|secret\nCONVEX_DEPLOYMENT=prod:other",
        ]) {
          const result = yield* deploy({
            ...props,
            deployKey: Redacted.make(key),
          }).pipe(Effect.provide(recorder(calls)), Effect.result);
          expect(Result.isFailure(result)).toBe(true);
          expect(serialize(result)).not.toContain(key);
        }
        expect(calls).toEqual([]);
      }),
  );

  it.effect(
    "rejects non-cloud or mismatched URLs and supports regional custom deployments",
    () =>
      Effect.gen(function* () {
        const calls: string[] = [];
        for (const url of [
          "http://localhost:3210",
          "https://other.convex.cloud",
          "https://happy-otter-123.convex.cloud.evil.test",
          "https://happy-otter-123.convex.cloud/path",
        ]) {
          const result = yield* deploy({
            ...props,
            deployment: { ...props.deployment, url },
          }).pipe(Effect.provide(recorder(calls)), Effect.result);
          expect(Result.isFailure(result)).toBe(true);
        }
        expect(calls).toEqual([]);
        const regional = {
          name: props.deployment.name,
          url: "https://happy-otter-123.eu-west-1.convex.cloud",
        };
        expect(
          yield* deploy({
            ...props,
            deployment: regional,
            deployKey: Redacted.make("custom:happy-otter-123|secret"),
          }).pipe(Effect.provide(recorder(calls))),
        ).toEqual(regional);
      }),
  );

  it.effect("supports plain Convex projects without preparation", () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      yield* deploy({
        deployment: props.deployment,
        deployKey: props.deployKey,
      }).pipe(Effect.provide(recorder(calls)));
      expect(calls).toEqual(["deploy"]);
    }),
  );
});

const project = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const cwd = yield* fs.makeTempDirectoryScoped({
    prefix: "confect-code-test-",
  });
  for (const [name, bin] of [
    ["convex", "convex"],
    ["@confect/cli", "confect"],
  ]) {
    const directory = `${cwd}/node_modules/${name}`;
    yield* fs.makeDirectory(directory, { recursive: true });
    yield* fs.writeFileString(
      `${directory}/package.json`,
      serialize({ name, bin: { [bin]: "cli.js" } }),
    );
  }
  return cwd;
});

describe("Code command boundary", () => {
  it.effect("discards real process output and sanitizes spawn failures", () =>
    Effect.gen(function* () {
      const runner = yield* CommandRunner;
      const exited = yield* runner
        .prepare({
          command: process.execPath,
          args: [
            "-e",
            "process.stdout.write('test-secret'); process.stderr.write('test-secret'); process.exit(6)",
          ],
        })
        .pipe(Effect.result);
      expect(Result.isFailure(exited)).toBe(true);
      if (Result.isFailure(exited))
        expect(exited.failure).toEqual(
          new CommandError({
            operation: "prepare",
            reason: "exit",
            exitCode: 6,
          }),
        );
      expect(serialize(exited)).not.toContain("test-secret");
      const failed = yield* runner
        .prepare({ command: "/nonexistent/confect-test-secret", args: [] })
        .pipe(Effect.result);
      expect(Result.isFailure(failed)).toBe(true);
      if (Result.isFailure(failed))
        expect(failed.failure).toEqual(
          new CommandError({ operation: "prepare", reason: "spawn" }),
        );
      expect(serialize(failed)).not.toContain("test-secret");
    }).pipe(
      Effect.provide(runnerLayer.pipe(Layer.provide(NodeServices.layer))),
    ),
  );

  it.effect(
    "uses installed binaries, isolates configuration, and removes private credentials",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const cwd = yield* project;
        let envFile = "";
        const calls: string[] = [];
        const spawner = Layer.mock(ChildProcessSpawner.ChildProcessSpawner, {
          exitCode: (command) =>
            Effect.gen(function* () {
              expect(command._tag).toBe("StandardCommand");
              if (command._tag !== "StandardCommand")
                return ChildProcessSpawner.ExitCode(1);
              calls.push(command.args[1]);
              expect(command.command).toBe(process.execPath);
              expect(command.options.cwd).toBe(cwd);
              expect(command.options.extendEnv).toBe(false);
              expect(command.options.stdin).toBe("ignore");
              expect(command.options.stdout).toBe("ignore");
              expect(command.options.stderr).toBe("ignore");
              expect(serialize(command)).not.toContain("test-secret");
              expect(command.options.env).not.toHaveProperty(
                "CONVEX_ACCESS_TOKEN",
              );
              expect(command.options.env).not.toHaveProperty(
                "CONVEX_DEPLOYMENT",
              );
              expect(command.options.env).not.toHaveProperty("NODE_OPTIONS");
              if (command.args[1] === "deploy") {
                expect(command.args[0]).toBe(
                  `${cwd}/node_modules/convex/cli.js`,
                );
                const index = command.args.indexOf("--env-file");
                expect(index).toBeGreaterThan(0);
                envFile = command.args[index + 1];
                expect(command.options.env?.HOME).toBe(
                  envFile.slice(0, envFile.lastIndexOf("/")),
                );
                expect(command.options.env?.USERPROFILE).toBe(
                  command.options.env?.HOME,
                );
                expect(yield* fs.readFileString(envFile)).toBe(
                  "CONVEX_DEPLOY_KEY=prod:happy-otter-123|test-secret\n",
                );
                expect((yield* fs.stat(envFile)).mode & 0o777).toBe(0o600);
              } else {
                expect(command.args[0]).toBe(
                  `${cwd}/node_modules/@confect/cli/cli.js`,
                );
              }
              return ChildProcessSpawner.ExitCode(0);
            }),
        });
        yield* deploy({ ...props, cwd }).pipe(
          Effect.provide([
            runnerLayer.pipe(Layer.provide(spawner)),
            ConfigProvider.layer(
              ConfigProvider.fromUnknown({
                CONVEX_ACCESS_TOKEN: "ambient-management-secret",
                CONVEX_DEPLOYMENT: "prod:wrong",
                NODE_OPTIONS: "--inspect",
                PATH: "/usr/bin",
              }),
            ),
          ]),
        );
        expect(calls).toEqual(["codegen", "deploy"]);
        expect(yield* fs.exists(envFile)).toBe(false);
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "cleans credentials on command failure without exposing output",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const cwd = yield* project;
        let envFile = "";
        const spawner = Layer.mock(ChildProcessSpawner.ChildProcessSpawner, {
          exitCode: (command) =>
            Effect.sync(() => {
              if (command._tag === "StandardCommand")
                envFile = command.args[command.args.indexOf("--env-file") + 1];
              return ChildProcessSpawner.ExitCode(7);
            }),
        });
        const result = yield* deploy({
          deployment: props.deployment,
          deployKey: props.deployKey,
          cwd,
        }).pipe(
          Effect.provide(runnerLayer.pipe(Layer.provide(spawner))),
          Effect.result,
        );
        expect(Result.isFailure(result)).toBe(true);
        if (Result.isFailure(result))
          expect(result.failure).toEqual(
            new CommandError({
              operation: "deploy",
              reason: "exit",
              exitCode: 7,
            }),
          );
        expect(yield* fs.exists(envFile)).toBe(false);
        expect(serialize(result)).not.toContain("test-secret");
      }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("cleans credentials when deployment is interrupted", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const cwd = yield* project;
      const started = yield* Deferred.make<string>();
      const spawner = Layer.mock(ChildProcessSpawner.ChildProcessSpawner, {
        exitCode: (command) =>
          Effect.gen(function* () {
            if (command._tag === "StandardCommand")
              yield* Deferred.succeed(
                started,
                command.args[command.args.indexOf("--env-file") + 1],
              );
            return yield* Effect.never;
          }),
      });
      const fiber = yield* deploy({
        deployment: props.deployment,
        deployKey: props.deployKey,
        cwd,
      }).pipe(
        Effect.provide(runnerLayer.pipe(Layer.provide(spawner))),
        Effect.forkScoped,
      );
      const envFile = yield* Deferred.await(started);
      expect(yield* fs.exists(envFile)).toBe(true);
      yield* Fiber.interrupt(fiber);
      expect(yield* fs.exists(envFile)).toBe(false);
    }).pipe(Effect.provide(NodeServices.layer)),
  );

  it.effect("fails locally when the project has no installed Convex CLI", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const cwd = yield* fs.makeTempDirectoryScoped({
        directory: "/tmp",
        prefix: "confect-empty-test-",
      });
      const result = yield* deploy({
        deployment: props.deployment,
        deployKey: props.deployKey,
        cwd,
      }).pipe(
        Effect.provide(
          runnerLayer.pipe(
            Layer.provide(
              Layer.mock(ChildProcessSpawner.ChildProcessSpawner, {
                exitCode: (command) =>
                  Effect.sync(() => {
                    expect(command).toBeUndefined();
                    return ChildProcessSpawner.ExitCode(1);
                  }),
              }),
            ),
          ),
        ),
        Effect.result,
      );
      expect(Result.isFailure(result)).toBe(true);
      if (Result.isFailure(result))
        expect(result.failure).toEqual(
          new CommandError({ operation: "deploy", reason: "configuration" }),
        );
    }).pipe(Effect.provide(NodeServices.layer)),
  );
});
