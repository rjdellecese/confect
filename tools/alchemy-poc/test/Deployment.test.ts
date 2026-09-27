import * as NodeServices from "@effect/platform-node/NodeServices";
import { assert, describe, expect, it } from "@effect/vitest";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Deferred from "effect/Deferred";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";
import * as Deployment from "../src/Deployment";

const key = "dev:careful-otter-123|fake-test-key";
const props: Deployment.Props = {
  cwd: "/application",
  url: "https://careful-otter-123.convex.cloud",
  deployKeyEnv: "DEPLOY_KEY",
  env: { APP_ENV: "LOCAL_APP_ENV", EMAIL_KEY: "LOCAL_EMAIL_KEY" },
};

interface HarnessOptions {
  readonly environment?: Readonly<Record<string, string>>;
  readonly failCommand?: "codegen" | "deploy";
  readonly hangDeploy?: boolean;
  readonly failHttp?: "GET" | "POST";
  readonly malformedResponse?: boolean;
  readonly config?: Readonly<Record<string, string>>;
}

const makeHarness = Effect.fn("Deployment.test.makeHarness")(function* (
  options: HarnessOptions = {},
) {
  const fs = yield* FileSystem.FileSystem;
  const realSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const cwd = yield* fs.makeTempDirectoryScoped();
  const deployStarted = yield* Deferred.make<string>();
  const events: Array<string> = [];
  const commands: Array<ChildProcess.StandardCommand> = [];
  const credentialsFiles: Array<string> = [];
  const updates: Array<unknown> = [];
  const commandLayer = Layer.succeed(
    ChildProcessSpawner.ChildProcessSpawner,
    ChildProcessSpawner.make((command) =>
      Effect.gen(function* () {
        assert(command._tag === "StandardCommand");
        commands.push(command);
        expect(command.command).toBe("pnpm");
        expect(command.options.cwd).toBe(cwd);
        expect(command.options.stdin).toBe("ignore");
        expect(command.options.stdout).toBe("ignore");
        expect(command.options.stderr).toBe("ignore");
        expect(command.args.join(" ")).not.toContain(key);
        const step = command.args[1] === "confect" ? "codegen" : "deploy";
        events.push(step);
        if (step === "deploy") {
          const envFile = command.args[5];
          credentialsFiles.push(envFile);
          expect(yield* fs.readFileString(envFile)).toBe(
            `CONVEX_DEPLOY_KEY=${key}\n`,
          );
          expect((yield* fs.stat(envFile)).mode & 0o777).toBe(0o600);
        }
        const child = yield* realSpawner.spawn(
          ChildProcess.make(
            process.execPath,
            [
              "-e",
              options.failCommand === step
                ? "process.exit(7)"
                : options.hangDeploy && step === "deploy"
                  ? "setInterval(() => {}, 1000)"
                  : "process.exit(0)",
            ],
            command.options,
          ),
        );
        if (step === "deploy") {
          yield* Deferred.succeed(deployStarted, command.args[5]);
        }
        return child;
      }),
    ),
  );
  const client = HttpClient.make((request) =>
    Effect.gen(function* () {
      events.push(request.method);
      expect(request.headers.authorization).toBe(`Convex ${key}`);
      expect(request.url).toBe(
        `${props.url}/api/${request.method === "GET" ? "list" : "update"}_environment_variables`,
      );
      if (request.method === "POST") {
        assert(request.body._tag === "Uint8Array");
        updates.push(
          yield* Schema.decodeEffect(Schema.fromJsonString(Schema.Unknown))(
            new TextDecoder().decode(request.body.body),
          ).pipe(Effect.orDie),
        );
      }
      return HttpClientResponse.fromWeb(
        request,
        options.failHttp === request.method
          ? new Response("fake-sensitive-response", { status: 500 })
          : options.malformedResponse
            ? Response.json({ invalid: "fake-sensitive-response" })
            : Response.json({
                environmentVariables: options.environment ?? {},
              }),
      );
    }),
  );
  const layer = Layer.mergeAll(
    commandLayer,
    Layer.succeed(HttpClient.HttpClient, client),
    ConfigProvider.layer(
      ConfigProvider.fromUnknown(
        options.config ?? {
          DEPLOY_KEY: key,
          LOCAL_APP_ENV: "poc",
          LOCAL_EMAIL_KEY: "fake-email-secret",
        },
      ),
    ),
  );
  return {
    events,
    commands,
    credentialsFiles,
    updates,
    deployStarted,
    run: (input: Deployment.Props = props) =>
      Deployment.deploy({ ...input, cwd }).pipe(Effect.provide(layer)),
  };
});

describe("validate", () => {
  it("accepts a matching deployment key and regional URL without mutating inputs", () => {
    expect(Deployment.validate(props, Redacted.make(key))).toEqual(
      Result.succeed(undefined),
    );
    expect(
      Deployment.validate(
        { ...props, url: "https://careful-otter-123.eu-west-1.convex.cloud" },
        Redacted.make(key),
      ),
    ).toEqual(Result.succeed(undefined));
    expect(props.env).toEqual({
      APP_ENV: "LOCAL_APP_ENV",
      EMAIL_KEY: "LOCAL_EMAIL_KEY",
    });
  });

  it.each([
    "preview:team:project|fake-key",
    "project:project|fake-key",
    "prod:another-deployment|fake-key",
    "dev:careful-otter-123|key\nINJECTED=value",
    "dev:careful-otter-123|key#comment",
  ])("rejects a wrong or unsafe deployment key", (invalidKey) => {
    const result = Deployment.validate(props, Redacted.make(invalidKey));
    assert(Result.isFailure(result));
    expect(result.failure.field).toBe("deployKeyEnv");
    expect(String(result.failure)).not.toContain(invalidKey);
  });

  it.each([
    "http://careful-otter-123.convex.cloud",
    "https://careful-otter-123.convex.cloud.evil.example",
    "https://careful-otter-123.convex.cloud/path",
    "https://careful-otter-123.convex.cloud?key=secret",
    "https://careful-otter-123.convex.cloud/",
  ])("rejects a noncanonical target URL", (url) => {
    const result = Deployment.validate({ ...props, url }, Redacted.make(key));
    assert(Result.isFailure(result));
    expect(result.failure.field).toBe("url");
  });

  it("rejects empty directories and invalid environment names", () => {
    expect(
      Result.isFailure(
        Deployment.validate({ ...props, cwd: " " }, Redacted.make(key)),
      ),
    ).toBe(true);
    expect(
      Result.isFailure(
        Deployment.validate(
          { ...props, env: { "BAD-NAME": "LOCAL" } },
          Redacted.make(key),
        ),
      ),
    ).toBe(true);
    expect(
      Result.isFailure(
        Deployment.validate(
          { ...props, env: { VALID: "BAD-NAME" } },
          Redacted.make(key),
        ),
      ),
    ).toBe(true);
  });
});

describe("deploy", () => {
  it.effect(
    "runs codegen, changes only differing variables, and deploys with scoped credentials",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const harness = yield* makeHarness({
          environment: { APP_ENV: "poc", UNMANAGED: "keep" },
        });
        expect(yield* harness.run()).toEqual({ url: props.url });
        expect(harness.events).toEqual(["codegen", "GET", "POST", "deploy"]);
        expect(harness.updates).toEqual([
          { changes: [{ name: "EMAIL_KEY", value: "fake-email-secret" }] },
        ]);
        expect(harness.commands[0].args).toEqual([
          "exec",
          "confect",
          "codegen",
        ]);
        expect(harness.commands[1].args.slice(0, 5)).toEqual([
          "exec",
          "convex",
          "deploy",
          "--yes",
          "--env-file",
        ]);
        expect(yield* fs.exists(harness.credentialsFiles[0])).toBe(false);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "reruns deployment but does not rewrite an unchanged environment",
    () =>
      Effect.gen(function* () {
        const harness = yield* makeHarness({
          environment: { APP_ENV: "poc", EMAIL_KEY: "fake-email-secret" },
        });
        yield* harness.run();
        yield* harness.run();
        expect(harness.events).toEqual([
          "codegen",
          "GET",
          "deploy",
          "codegen",
          "GET",
          "deploy",
        ]);
        expect(harness.updates).toEqual([]);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("does not contact the environment API when env is omitted", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness();
      yield* harness.run({
        cwd: props.cwd,
        url: props.url,
        deployKeyEnv: props.deployKeyEnv,
      });
      expect(harness.events).toEqual(["codegen", "deploy"]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("fails before any side effect for mismatched credentials", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness({
        config: { DEPLOY_KEY: "prod:wrong-deployment|fake-key" },
      });
      const result = yield* Effect.result(harness.run());
      assert(Result.isFailure(result));
      expect(result.failure._tag).toBe("ConfectAlchemyInvalidConfiguration");
      expect(harness.events).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("resolves all environment values before starting codegen", () =>
    Effect.gen(function* () {
      const harness = yield* makeHarness({ config: { DEPLOY_KEY: key } });
      expect(Result.isFailure(yield* Effect.result(harness.run()))).toBe(true);
      expect(harness.events).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "stops after a failed codegen without changing the remote environment",
    () =>
      Effect.gen(function* () {
        const harness = yield* makeHarness({ failCommand: "codegen" });
        const result = yield* Effect.result(harness.run());
        assert(Result.isFailure(result));
        expect(result.failure).toMatchObject({
          _tag: "ConfectAlchemyDeploymentStepError",
          step: "codegen",
          exitCode: 7,
        });
        expect(harness.events).toEqual(["codegen"]);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect("cleans up credentials after a failed deploy and can retry", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const harness = yield* makeHarness({ failCommand: "deploy" });
      const result = yield* Effect.result(harness.run());
      assert(Result.isFailure(result));
      expect(result.failure).toMatchObject({
        _tag: "ConfectAlchemyDeploymentStepError",
        step: "deploy",
        exitCode: 7,
      });
      expect(String(result.failure)).not.toContain(key);
      expect(yield* fs.exists(harness.credentialsFiles[0])).toBe(false);
      const retry = yield* makeHarness({
        environment: { APP_ENV: "poc", EMAIL_KEY: "fake-email-secret" },
      });
      expect(yield* retry.run()).toEqual({ url: props.url });
      expect(retry.updates).toEqual([]);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "removes the credentials file when a running deploy is interrupted",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const harness = yield* makeHarness({ hangDeploy: true });
        const fiber = yield* harness.run().pipe(Effect.forkScoped);
        const envFile = yield* Deferred.await(harness.deployStarted);
        expect(yield* fs.exists(envFile)).toBe(true);
        yield* Fiber.interrupt(fiber);
        expect(yield* fs.exists(envFile)).toBe(false);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "stops before environment writes when reading the environment fails",
    () =>
      Effect.gen(function* () {
        const harness = yield* makeHarness({ failHttp: "GET" });
        const result = yield* Effect.result(harness.run());
        assert(Result.isFailure(result));
        expect(result.failure).toMatchObject({ step: "readEnvironment" });
        expect(harness.events).toEqual(["codegen", "GET"]);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "does not push code after a failed environment update or reveal its response",
    () =>
      Effect.gen(function* () {
        const harness = yield* makeHarness({ failHttp: "POST" });
        const result = yield* Effect.result(harness.run());
        assert(Result.isFailure(result));
        expect(result.failure).toMatchObject({ step: "updateEnvironment" });
        expect(String(result.failure)).not.toContain("fake-sensitive-response");
        expect(harness.events).toEqual(["codegen", "GET", "POST"]);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );

  it.effect(
    "rejects malformed environment responses without exposing their payload",
    () =>
      Effect.gen(function* () {
        const harness = yield* makeHarness({ malformedResponse: true });
        const result = yield* Effect.result(harness.run());
        assert(Result.isFailure(result));
        expect(result.failure).toMatchObject({ step: "readEnvironment" });
        expect(String(result.failure)).not.toContain("fake-sensitive-response");
        expect(harness.events).toEqual(["codegen", "GET"]);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer)),
  );
});
