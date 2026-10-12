import * as NodeServices from "@effect/platform-node/NodeServices";
import { strict as assert } from "node:assert";
import { describe, expect, it, layer } from "@effect/vitest";
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
import * as Path from "effect/Path";
import * as Redacted from "effect/Redacted";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { ChildProcessSpawner } from "effect/process";
import { deploy } from "../src/internal/CodeDeployment";
import {
  CommandError,
  CommandRunner,
  layer as runnerLayer,
} from "../src/internal/CommandRunner";

const Json = Schema.fromJsonString(Schema.Unknown);
const stringArgument = (value: unknown): string => {
  assert(typeof value === "string");
  return value;
};
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
  CommandRunner.of({
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
            const diffResult = yield* provider.diff();
            expect(diffResult).toEqual({ action: "update" });
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
        }).pipe(Effect.provideService(CommandRunner, recorder(calls)));
      }),
  );

  it.effect("does not deploy after preparation fails", () =>
    Effect.gen(function* () {
      let pushed = false;
      const result = yield* deploy(props).pipe(
        Effect.provideService(CommandRunner, {
          prepare: () =>
            Effect.fail(
              CommandError.make({
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
      const encoded1 = yield* Schema.encodeEffect(Json)(result);
      expect(encoded1).not.toContain("test-secret");
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
          }).pipe(
            Effect.provideService(CommandRunner, recorder(calls)),
            Effect.result,
          );
          expect(Result.isFailure(result)).toBe(true);
          const encoded2 = yield* Schema.encodeEffect(Json)(result);
          expect(encoded2).not.toContain(key);
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
          }).pipe(
            Effect.provideService(CommandRunner, recorder(calls)),
            Effect.result,
          );
          expect(Result.isFailure(result)).toBe(true);
        }
        expect(calls).toEqual([]);
        const regional = {
          name: props.deployment.name,
          url: "https://happy-otter-123.eu-west-1.convex.cloud",
        };
        const deploymentResult = yield* deploy({
          ...props,
          deployment: regional,
          deployKey: Redacted.make("custom:happy-otter-123|secret"),
        }).pipe(Effect.provideService(CommandRunner, recorder(calls)));
        expect(deploymentResult).toEqual(regional);
      }),
  );

  it.effect("supports plain Convex projects without preparation", () =>
    Effect.gen(function* () {
      const calls: string[] = [];
      yield* deploy({
        deployment: props.deployment,
        deployKey: props.deployKey,
      }).pipe(Effect.provideService(CommandRunner, recorder(calls)));
      expect(calls).toEqual(["deploy"]);
    }),
  );
});

const project = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const cwd = yield* fs.makeTempDirectoryScoped({
    prefix: "confect-code-test-",
  });
  for (const [name, bin] of [
    ["convex", "convex"],
    ["@confect/cli", "confect"],
  ]) {
    const directory = path.join(cwd, "node_modules", name);
    yield* fs.makeDirectory(directory, { recursive: true });
    const manifest = yield* Schema.encodeEffect(Json)({
      name,
      bin: { [bin]: "cli.js" },
    });
    yield* fs.writeFileString(path.join(directory, "package.json"), manifest);
  }
  return cwd;
});

layer(NodeServices.layer)("Code command boundary", (runtimeIt) => {
  runtimeIt.effect(
    "preserves Windows process prerequisites across environment casing",
    () =>
      Effect.gen(function* () {
        const cwd = yield* project;
        for (const environment of [
          { PATH: "C:\\node", SYSTEMROOT: "C:\\Windows" },
          { Path: "C:\\node", SystemRoot: "C:\\Windows" },
        ]) {
          const calls: string[] = [];
          const spawner = Layer.mock(ChildProcessSpawner.ChildProcessSpawner, {
            exitCode: (command) =>
              Effect.sync(() => {
                expect(command._tag).toBe("StandardCommand");
                if (command._tag !== "StandardCommand")
                  return ChildProcessSpawner.ExitCode(1);
                calls.push(stringArgument(command.args[1]));
                expect(command.options.env?.PATH).toBe("C:\\node");
                expect(command.options.env?.SystemRoot).toBe("C:\\Windows");
                expect(command.options.extendEnv).toBe(false);
                return ChildProcessSpawner.ExitCode(0);
              }),
          });
          const runnerServices = yield* Layer.build(
            Layer.mergeAll(
              runnerLayer.pipe(Layer.provide(spawner)),
              ConfigProvider.layer(ConfigProvider.fromUnknown(environment)),
            ),
          );
          yield* deploy({ ...props, cwd }).pipe(
            Effect.provideContext(runnerServices),
          );
          expect(calls).toEqual(["codegen", "deploy"]);
        }
      }),
  );

  runtimeIt.effect(
    "discards real process output and sanitizes spawn failures",
    () =>
      Effect.gen(function* () {
        const services = yield* Layer.build(
          runnerLayer.pipe(Layer.provideMerge(NodeServices.layer)),
        );
        return yield* Effect.gen(function* () {
          const runner = yield* CommandRunner;
          const fs = yield* FileSystem.FileSystem;
          const path = yield* Path.Path;
          const cwd = yield* fs.makeTempDirectoryScoped({
            prefix: "confect-spawn-test-",
          });
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
              CommandError.make({
                operation: "prepare",
                reason: "exit",
                exitCode: 6,
              }),
            );
          const encoded3 = yield* Schema.encodeEffect(Json)(exited);
          expect(encoded3).not.toContain("test-secret");
          const failed = yield* runner
            .prepare({
              command: path.join(cwd, "confect-test-secret"),
              args: [],
            })
            .pipe(Effect.result);
          expect(Result.isFailure(failed)).toBe(true);
          if (Result.isFailure(failed))
            expect(failed.failure).toEqual(
              CommandError.make({ operation: "prepare", reason: "spawn" }),
            );
          const encoded4 = yield* Schema.encodeEffect(Json)(failed);
          expect(encoded4).not.toContain("test-secret");
        }).pipe(Effect.provideContext(services));
      }),
  );

  runtimeIt.effect(
    "uses installed binaries, isolates configuration, and removes private credentials",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const cwd = yield* project;
        let envFile = "";
        const calls: string[] = [];
        const spawner = Layer.mock(ChildProcessSpawner.ChildProcessSpawner, {
          exitCode: (command) =>
            Effect.gen(function* () {
              expect(command._tag).toBe("StandardCommand");
              if (command._tag !== "StandardCommand")
                return ChildProcessSpawner.ExitCode(1);
              calls.push(stringArgument(command.args[1]));
              expect(command.command).toBe(process.execPath);
              expect(command.options.cwd).toBe(cwd);
              expect(command.options.extendEnv).toBe(false);
              expect(command.options.stdin).toBe("ignore");
              expect(command.options.stdout).toBe("ignore");
              expect(command.options.stderr).toBe("ignore");
              const encoded5 = yield* Schema.encodeEffect(Json)(command).pipe(
                Effect.orDie,
              );
              expect(encoded5).not.toContain("test-secret");
              expect(command.options.env).not.toHaveProperty(
                "CONVEX_ACCESS_TOKEN",
              );
              expect(command.options.env).not.toHaveProperty(
                "CONVEX_DEPLOYMENT",
              );
              expect(command.options.env).not.toHaveProperty("NODE_OPTIONS");
              if (command.args[1] === "deploy") {
                expect(command.args[0]).toBe(
                  path.join(cwd, "node_modules", "convex", "cli.js"),
                );
                const index = command.args.indexOf("--env-file");
                expect(index).toBeGreaterThan(0);
                envFile = stringArgument(command.args[index + 1]);
                expect(command.options.env?.HOME).toBe(path.dirname(envFile));
                expect(command.options.env?.USERPROFILE).toBe(
                  command.options.env?.HOME,
                );
                const readFileStringResult = yield* fs.readFileString(envFile);
                expect(readFileStringResult).toBe(
                  "CONVEX_DEPLOY_KEY=prod:happy-otter-123|test-secret\n",
                );
                if (process.platform !== "win32") {
                  const statResult = yield* fs.stat(envFile);
                  expect(statResult.mode & 0o777).toBe(0o600);
                }
              } else {
                expect(command.args[0]).toBe(
                  path.join(cwd, "node_modules", "@confect", "cli", "cli.js"),
                );
              }
              return ChildProcessSpawner.ExitCode(0);
            }),
        });
        const runnerServices = yield* Layer.build(
          Layer.mergeAll(
            runnerLayer.pipe(Layer.provide(spawner)),
            ConfigProvider.layer(
              ConfigProvider.fromUnknown({
                CONVEX_ACCESS_TOKEN: "ambient-management-secret",
                CONVEX_DEPLOYMENT: "prod:wrong",
                NODE_OPTIONS: "--inspect",
                PATH: path.dirname(process.execPath),
              }),
            ),
          ),
        );
        yield* deploy({ ...props, cwd }).pipe(
          Effect.provideContext(runnerServices),
        );
        expect(calls).toEqual(["codegen", "deploy"]);
        const existsResult = yield* fs.exists(envFile);
        expect(existsResult).toBe(false);
      }),
  );

  runtimeIt.effect(
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
                envFile = stringArgument(
                  command.args[command.args.indexOf("--env-file") + 1],
                );
              return ChildProcessSpawner.ExitCode(7);
            }),
        });
        const runnerServices = yield* Layer.build(
          runnerLayer.pipe(Layer.provide(spawner)),
        );
        const result = yield* deploy({
          deployment: props.deployment,
          deployKey: props.deployKey,
          cwd,
        }).pipe(Effect.provideContext(runnerServices), Effect.result);
        expect(Result.isFailure(result)).toBe(true);
        if (Result.isFailure(result))
          expect(result.failure).toEqual(
            CommandError.make({
              operation: "deploy",
              reason: "exit",
              exitCode: 7,
            }),
          );
        const existsResult2 = yield* fs.exists(envFile);
        expect(existsResult2).toBe(false);
        const encoded6 = yield* Schema.encodeEffect(Json)(result);
        expect(encoded6).not.toContain("test-secret");
      }),
  );

  runtimeIt.effect("cleans credentials when deployment is interrupted", () =>
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
                stringArgument(
                  command.args[command.args.indexOf("--env-file") + 1],
                ),
              );
            return yield* Effect.never;
          }),
      });
      const runnerServices = yield* Layer.build(
        runnerLayer.pipe(Layer.provide(spawner)),
      );
      const fiber = yield* deploy({
        deployment: props.deployment,
        deployKey: props.deployKey,
        cwd,
      }).pipe(Effect.provideContext(runnerServices), Effect.forkScoped);
      const envFile = yield* Deferred.await(started);
      const existsResult3 = yield* fs.exists(envFile);
      expect(existsResult3).toBe(true);
      yield* Fiber.interrupt(fiber);
      const existsResult4 = yield* fs.exists(envFile);
      expect(existsResult4).toBe(false);
    }),
  );

  runtimeIt.effect(
    "fails locally when the project has no installed Convex CLI",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const cwd = yield* fs.makeTempDirectoryScoped({
          prefix: "confect-empty-test-",
        });
        const runnerServices = yield* Layer.build(
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
        );
        const result = yield* deploy({
          deployment: props.deployment,
          deployKey: props.deployKey,
          cwd,
        }).pipe(Effect.provideContext(runnerServices), Effect.result);
        expect(Result.isFailure(result)).toBe(true);
        if (Result.isFailure(result))
          expect(result.failure).toEqual(
            CommandError.make({ operation: "deploy", reason: "configuration" }),
          );
      }),
  );
});
