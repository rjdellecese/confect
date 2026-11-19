import * as Exit from "effect/Exit";
import * as Cause from "effect/Cause";
import type * as Schema from "effect/Schema";
import { Convex } from "@confect/alchemy";
import type { ConvexClient } from "@confect/alchemy/ConvexClient";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import { apply } from "alchemy/Apply";
import { provideFreshArtifactStore } from "alchemy/Artifacts";
import * as Drift from "alchemy/Drift";
import * as Plan from "alchemy/Plan";
import { Stack, type StackServices } from "alchemy/Stack";
import { Stage } from "alchemy/Stage";
import { inMemoryState, type ResourceState, type State } from "alchemy/State";
import type * as Config from "effect/Config";
import * as ConfigProvider from "effect/ConfigProvider";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import type { StandardCommand } from "effect/process/ChildProcess";
import {
  ChildProcessSpawner,
  ExitCode,
} from "effect/process/ChildProcessSpawner";
import * as SecureRandom from "effect/crypto/SecureRandom";
import * as Digest from "effect/crypto/Digest";
import type * as Redacted from "effect/Redacted";
import type { PlatformError } from "effect/PlatformError";

import { mockFetch } from "../fixtures/Fetch.js";

export const stackFixture = (
  options: {
    readonly fetch?: (
      request: Request,
    ) => Effect.Effect<Response, Schema.SchemaError>;
    readonly run?: (
      command: StandardCommand,
    ) => Effect.Effect<number, PlatformError>;
    readonly token?: Redacted.Redacted<string>;
    readonly config?: Readonly<Record<string, string>>;
    readonly client?: Layer.Layer<ConvexClient>;
    readonly state?: Layer.Layer<State, never, StackServices>;
  } = {},
) => {
  const rows: Record<
    string,
    Record<string, Record<string, ResourceState>>
  > = {};
  const state = options.state ?? inMemoryState(rows);
  const runtime = Layer.mergeAll(
    NodeFileSystem.layer,
    Path.layer,
    SecureRandom.layerWebCrypto,
    Digest.layerWebCrypto,
    ConfigProvider.layer(ConfigProvider.fromUnknown(options.config ?? {})),
    Layer.succeed(Stage, "test"),
    Layer.succeed(
      FetchHttpClient.Fetch,
      mockFetch((input, init) => {
        if (options.fetch === undefined)
          return Promise.reject(new Error("Unexpected HTTP request in test"));
        return options
          .fetch(input instanceof Request ? input : new Request(input, init))
          .pipe(Effect.runPromise);
      }),
    ),
    Layer.mock(ChildProcessSpawner)({
      exitCode: (command) => {
        if (command._tag !== "StandardCommand" || options.run === undefined)
          return Effect.die("Unexpected child process in test");
        return options.run(command).pipe(Effect.map(ExitCode));
      },
    }),
  );
  const compile = <A>(
    body: Effect.Effect<A, Config.ConfigError, Convex.Providers>,
  ) =>
    Stack(
      "Fixture",
      {
        state,
        providers: Convex.providers(
          options.token === undefined ? {} : { token: options.token },
        ).pipe(Layer.provide(options.client ?? Layer.empty)),
      },
      body,
    );
  const run = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.scoped(
      Effect.gen(function* () {
        const ctx = yield* Layer.build(runtime);
        return yield* effect.pipe(
          provideFreshArtifactStore,
          Effect.provide(ctx),
        );
      }),
    );
  const plan = <A>(
    body: Effect.Effect<A, Config.ConfigError, Convex.Providers>,
  ) =>
    compile(body).pipe(
      Effect.flatMap((s) => Plan.make(s).pipe(Effect.provide(s.services))),
      run,
    );
  const deploy = <A>(
    body: Effect.Effect<A, Config.ConfigError, Convex.Providers>,
  ) =>
    compile(body).pipe(
      Effect.flatMap((s) =>
        Plan.make(s).pipe(
          Effect.flatMap(apply),
          Effect.map((result: unknown) => result),
          Effect.provide(s.services),
        ),
      ),
      run,
    );
  const drift = compile(Effect.void).pipe(
    Effect.flatMap((s) =>
      Effect.succeed(s).pipe(
        Effect.flatMap(Drift.detect),
        Effect.orDie,
        Effect.provide(s.services),
      ),
    ),
    run,
  );
  return { plan, deploy, drift, rows };
};

export const failureOf = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  effect.pipe(
    Effect.exit,
    Effect.flatMap((exit) =>
      Exit.isFailure(exit)
        ? exit.cause.pipe(Cause.pretty, Effect.succeed)
        : Effect.die("Expected a failing stack"),
    ),
  );
