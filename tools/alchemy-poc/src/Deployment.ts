import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Path from "effect/Path";
import * as Redacted from "effect/Redacted";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as HttpClientRequest from "effect/unstable/http/HttpClientRequest";
import * as HttpClientResponse from "effect/unstable/http/HttpClientResponse";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";

export interface Props {
  readonly cwd: string;
  readonly url: string;
  readonly deployKeyEnv: string;
  readonly env?: Readonly<Record<string, string>>;
}

export class InvalidConfiguration extends Schema.TaggedError<InvalidConfiguration>()(
  "ConfectAlchemyInvalidConfiguration",
  { field: Schema.String, reason: Schema.String },
) {}

export class DeploymentStepError extends Schema.TaggedError<DeploymentStepError>()(
  "ConfectAlchemyDeploymentStepError",
  {
    step: Schema.Literals([
      "codegen",
      "readEnvironment",
      "updateEnvironment",
      "deploy",
      "credentialsFile",
    ]),
    reason: Schema.String,
    exitCode: Schema.optional(Schema.Finite),
  },
) {}

export const validate = (
  props: Props,
  key: Redacted.Redacted<string>,
): Result.Result<void, InvalidConfiguration> => {
  if (props.cwd.trim() === "") {
    return Result.fail(
      new InvalidConfiguration({
        field: "cwd",
        reason: "A project directory is required",
      }),
    );
  }
  const host = /^https:\/\/([a-z0-9-]+)(?:\.[a-z0-9-]+)?\.convex\.cloud$/.exec(
    props.url,
  );
  if (!host) {
    return Result.fail(
      new InvalidConfiguration({
        field: "url",
        reason: "Expected a Convex Cloud origin without a trailing slash",
      }),
    );
  }
  const target = /^(dev|prod):([a-z0-9-]+)\|[A-Za-z0-9+/=_-]+$/.exec(
    Redacted.value(key),
  );
  if (!target || target[2] !== host[1]) {
    return Result.fail(
      new InvalidConfiguration({
        field: "deployKeyEnv",
        reason:
          "Expected a dev or prod deployment key matching the URL; project and preview provisioning keys are not supported",
      }),
    );
  }
  for (const name of [
    props.deployKeyEnv,
    ...Object.keys(props.env ?? {}),
    ...Object.values(props.env ?? {}),
  ]) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
      return Result.fail(
        new InvalidConfiguration({
          field: "env",
          reason: "Environment names must be valid identifiers",
        }),
      );
    }
  }
  return Result.succeed(undefined);
};

const runCommand = Effect.fn("ConfectAlchemy.runCommand")(function* (
  cwd: string,
  step: "codegen" | "deploy",
  args: ReadonlyArray<string>,
) {
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  yield* Effect.logInfo(`Confect proof of concept: ${step}`);
  const exitCode = yield* Effect.gen(function* () {
    const child = yield* spawner.spawn(
      ChildProcess.make("pnpm", ["exec", ...args], {
        cwd,
        stdin: "ignore",
        stdout: "ignore",
        stderr: "ignore",
        env: { CI: "true", CONVEX_AGENT_MODE: "" },
        extendEnv: true,
      }),
    );
    return yield* child.exitCode;
  }).pipe(
    Effect.scoped,
    Effect.timeout("5 minutes"),
    Effect.mapError(
      () =>
        new DeploymentStepError({
          step,
          reason: "Could not complete command within five minutes",
        }),
    ),
  );
  if (exitCode !== 0) {
    return yield* new DeploymentStepError({
      step,
      reason:
        "Command failed; output is suppressed to avoid exposing credentials",
      exitCode,
    });
  }
});

const EnvironmentResponse = Schema.Struct({
  environmentVariables: Schema.Record(Schema.String, Schema.String),
});

const EnvironmentUpdate = Schema.Struct({
  changes: Schema.Array(
    Schema.Struct({ name: Schema.String, value: Schema.String }),
  ),
});

export const deploy = Effect.fn("ConfectAlchemy.deploy")(function* (
  props: Props,
) {
  const key = yield* Config.Redacted(props.deployKeyEnv);
  yield* Effect.fromResult(validate(props, key));
  const desired = yield* Effect.forEach(
    Object.entries(props.env ?? {}),
    ([name, source]) =>
      Config.Redacted(source).pipe(Effect.map((value) => ({ name, value }))),
  );
  yield* runCommand(props.cwd, "codegen", ["confect", "codegen"]);

  if (desired.length > 0) {
    const client = yield* HttpClient.HttpClient;
    const current = yield* client
      .execute(
        HttpClientRequest.get(
          `${props.url}/api/list_environment_variables`,
        ).pipe(
          HttpClientRequest.setHeader(
            "Authorization",
            `Convex ${Redacted.value(key)}`,
          ),
        ),
      )
      .pipe(
        Effect.flatMap(HttpClientResponse.filterStatusOk),
        Effect.flatMap(HttpClientResponse.schemaBodyJson(EnvironmentResponse)),
        Effect.timeout("30 seconds"),
        Effect.mapError(
          () =>
            new DeploymentStepError({
              step: "readEnvironment",
              reason: "Could not read deployment environment",
            }),
        ),
      );
    const changes = desired.flatMap(({ name, value }) =>
      current.environmentVariables[name] === Redacted.value(value)
        ? []
        : [{ name, value: Redacted.value(value) }],
    );
    if (changes.length > 0) {
      yield* HttpClientRequest.post(
        `${props.url}/api/update_environment_variables`,
      ).pipe(
        HttpClientRequest.setHeader(
          "Authorization",
          `Convex ${Redacted.value(key)}`,
        ),
        HttpClientRequest.schemaBodyJson(EnvironmentUpdate)({ changes }),
        Effect.flatMap(client.execute),
        Effect.flatMap(HttpClientResponse.filterStatusOk),
        Effect.timeout("30 seconds"),
        Effect.mapError(
          () =>
            new DeploymentStepError({
              step: "updateEnvironment",
              reason: "Could not update deployment environment",
            }),
        ),
      );
    }
  }

  yield* Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directory = yield* fs.makeTempDirectoryScoped({
      prefix: "confect-alchemy-poc-",
    });
    const envFile = path.join(directory, "deploy.env");
    yield* fs.writeFileString(
      envFile,
      `CONVEX_DEPLOY_KEY=${Redacted.value(key)}\n`,
      { mode: 0o600 },
    );
    yield* runCommand(props.cwd, "deploy", [
      "convex",
      "deploy",
      "--yes",
      "--env-file",
      envFile,
    ]);
  }).pipe(
    Effect.scoped,
    Effect.catchTag(
      "PlatformError",
      () =>
        new DeploymentStepError({
          step: "credentialsFile",
          reason: "Could not prepare deployment credentials",
        }),
    ),
  );
  return { url: props.url };
});
