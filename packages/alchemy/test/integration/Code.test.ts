import { Convex } from "@confect/alchemy";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as NodeServices from "@effect/platform-node/NodeServices";
import * as ChildProcess from "effect/process/ChildProcess";
import { ChildProcessSpawner } from "effect/process/ChildProcessSpawner";
import { expect, it } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as Context from "effect/Context";
import * as Layer from "effect/Layer";
import { FileSystem } from "effect/FileSystem";
import * as Redacted from "effect/Redacted";
import * as Str from "effect/String";
import { failureOf, stackFixture } from "./StackFixture.js";

it.effect(
  "isolates deployment selection in a private temporary file and removes it on CLI failure",
  () =>
    Effect.gen(function* () {
      const services = yield* Layer.build(NodeFileSystem.layer);
      const fs = Context.get(services, FileSystem);
      const deployKey = "prod:happy-rabbit-17|mock-key-private";
      const url = "https://happy-rabbit-17.convex.cloud";
      const deployment = { name: "happy-rabbit-17", url };
      const cwd = import.meta.dirname;
      const paths: string[] = [];
      const fixture = stackFixture({
        run: (cmd) =>
          Effect.gen(function* () {
            expect(cmd.options.cwd).toBe(cwd);
            expect(cmd.options.shell).not.toBe(true);
            expect(cmd.options.stdout).toBe("ignore");
            expect(cmd.options.stderr).toBe("ignore");
            expect(cmd.args).not.toContain("--skip-large-indexes-check");
            for (const arg of cmd.args) {
              expect(typeof arg).toBe("string");
              if (typeof arg === "string")
                expect(Str.includes("mock-key-private")(arg)).toBe(false);
            }
            expect(cmd.args.at(-2)).toBe("--env-file");
            const path = cmd.args.at(-1);
            if (typeof path !== "string")
              return yield* Effect.die("Missing mock CLI env file");
            paths.push(path);
            const stat = yield* fs.stat(path);
            expect(stat.mode & 0o777).toBe(0o600);
            const file = yield* fs.readFileString(path);
            expect(file).toBe(`CONVEX_DEPLOY_KEY=${deployKey}\n`);
            return 13;
          }),
      });
      const code = Convex.Code("Push", {
        deployment,
        cwd,
        deployKey: Redacted.make(deployKey),
      }).pipe(Effect.asVoid);
      yield* fixture.plan(code);
      expect(paths).toEqual([]);
      const diagnostic = yield* failureOf(fixture.deploy(code));
      expect(paths).toHaveLength(1);
      expect(diagnostic).toContain("deploy command exited with status 13");
      expect(diagnostic).not.toContain(deployKey);
      const stillExists = yield* fs.exists(paths[0]);
      expect(stillExists).toBe(false);
    }),
);

it.effect(
  "rejects a different region selected by a mock CLI before it pushes",
  () =>
    Effect.gen(function* () {
      const ctx = yield* Layer.build(NodeServices.layer);
      const spawner = Context.get(ctx, ChildProcessSpawner);
      const name = "sample-731";
      const expected = `https://${name}.eu-west-1.convex.cloud`;
      let actual = `https://${name}.convex.cloud`;
      let pushed = 0;
      const fixture = stackFixture({
        run: (command) =>
          Effect.gen(function* () {
            expect(command.options.extendEnv).toBe(false);
            expect(command.options.env?.HOME).toBe(
              command.options.env?.USERPROFILE,
            );
            for (const denied of [
              "CONVEX_DEPLOY_KEY",
              "CONVEX_ACCESS_TOKEN",
              "NODE_OPTIONS",
              "NODE_DEBUG",
              "CONVEX_PROVISION_HOST",
            ])
              expect(command.options.env).not.toHaveProperty(denied);
            const guard = command.args[command.args.indexOf("--cmd") + 1];
            const variable =
              command.args[command.args.indexOf("--cmd-url-env-var-name") + 1];
            if (typeof guard !== "string" || typeof variable !== "string")
              return yield* Effect.die("Missing pre-push guard");
            const status = yield* spawner.exitCode(
              ChildProcess.make(guard, {
                cwd: command.options.cwd,
                shell: true,
                stdin: "ignore",
                stdout: "ignore",
                stderr: "ignore",
                env: { ...command.options.env, [variable]: actual },
              }),
            );
            if (status === 0) pushed++;
            return status;
          }),
      });
      const stack = Convex.Code("Push", {
        deployment: { name, url: expected },
        cwd: import.meta.dirname,
        deployKey: Redacted.make(`prod:${name}|mock`),
      }).pipe(Effect.asVoid);
      const refused = yield* failureOf(fixture.deploy(stack));
      expect(refused).toContain("deploy command exited with status 1");
      expect(pushed).toBe(0);
      actual = expected;
      yield* fixture.deploy(stack);
      expect(pushed).toBe(1);
    }),
);

it.effect(
  "turns a key wiped during preparation into a typed failure without launching deploy",
  () =>
    Effect.gen(function* () {
      const key = Redacted.make("prod:mock-13|private-value");
      const fixture = stackFixture({
        run: (cmd) =>
          Effect.sync(() => {
            expect(cmd.args).not.toContain("deploy");
            Redacted.wipeUnsafe(key);
            return 0;
          }),
      });
      const code = Convex.Code("Push", {
        deployment: { name: "mock-13", url: "https://mock-13.convex.cloud" },
        deployKey: key,
        prepare: { command: "mock", args: [] },
      }).pipe(Effect.asVoid);
      const message = yield* failureOf(fixture.deploy(code));
      expect(message).toContain("InvalidTarget");
      expect(message).not.toContain("private-value");
    }),
);

it.effect(
  "rejects a mismatched deploy key before running even the prepare command",
  () =>
    Effect.gen(function* () {
      const rawKey = "dev:unexpected-17|must-not-leak";
      let runs = 0;
      const fixture = stackFixture({ run: () => Effect.sync(() => ++runs) });
      const code = Convex.Code("Push", {
        deployment: {
          name: "expected-17",
          url: "https://expected-17.convex.cloud",
        },
        deployKey: Redacted.make(rawKey),
        prepare: { command: "prepare", args: ["--flag"] },
      });
      const diagnostic = yield* failureOf(fixture.deploy(code));
      expect(diagnostic).toContain("InvalidTarget");
      expect(diagnostic).not.toContain(rawKey);
      expect(runs).toBe(0);
    }),
);
