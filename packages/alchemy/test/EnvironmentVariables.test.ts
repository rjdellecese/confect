import * as Record from "effect/Record";
import { it, expect, assert } from "@effect/vitest";
import { AdoptPolicy, Unowned } from "alchemy/AdoptPolicy";
import * as Output from "alchemy/Output";
import { Stack } from "alchemy/Stack";
import { InMemoryService } from "alchemy/State/InMemoryState";
import { State } from "alchemy/State/State";
import * as Config from "effect/Config";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

import * as EnvironmentVariables from "@confect/alchemy/EnvironmentVariables";
import { Providers } from "@confect/alchemy/Providers";
import { ConvexClient, ConvexNotFound } from "@confect/alchemy/ConvexClient";
import { lifecycle, mockClient } from "./fixtures/ConvexClient";

const props: EnvironmentVariables.EnvironmentVariablesProps = {
  url: "https://happy-otter-123.convex.cloud",
  deployKey: Redacted.make("test-key"),
  variables: { MANAGED: Redacted.make("desired-secret") },
};

it.effect("deletes idempotently when the deployment is already gone", () => {
  const mock = mockClient();
  return Effect.gen(function* () {
    const provider = yield* EnvironmentVariables.provider;
    const missing = yield* provider.read({
      ...lifecycle,
      olds: props,
      output: undefined,
    });
    expect(missing).toBeUndefined();
    yield* provider.delete({
      ...lifecycle,
      olds: props,
      output: {
        url: props.url,
        deployKey: props.deployKey,
        ownedNames: ["MANAGED"],
        variables: { MANAGED: Redacted.make("desired-secret") },
        originals: {},
      },
    });
    expect(mock.client.updateEnvironmentVariables).not.toHaveBeenCalled();
  }).pipe(
    Effect.provideService(ConvexClient, {
      ...mock.client,
      listEnvironmentVariables: () =>
        Effect.fail(
          ConvexNotFound.make({
            operation: "listEnvironmentVariables",
            status: 404,
            code: "HttpError",
          }),
        ),
    }),
  );
});

it.effect(
  "rejects an invalid target during cold discovery and reconcile",
  () => {
    const mock = mockClient();
    const news = { ...props, deploymentName: "other-deployment" };
    return Effect.gen(function* () {
      const provider = yield* EnvironmentVariables.provider;
      const rejected = yield* Effect.flip(
        provider.read({
          ...lifecycle,
          olds: news,
          output: undefined,
        }),
      );
      expect(rejected._tag).toBe("InvalidDeploymentTarget");
      const failed = yield* Effect.flip(
        provider.reconcile({
          ...lifecycle,
          news,
          olds: undefined,
          output: undefined,
        }),
      );
      expect(failed).toMatchObject({ _tag: "InvalidDeploymentTarget" });
      expect(mock.client.listEnvironmentVariables).not.toHaveBeenCalled();
      expect(mock.client.updateEnvironmentVariables).not.toHaveBeenCalled();
    }).pipe(Effect.provideService(ConvexClient, mock.client));
  },
);

it.effect(
  "updates only differences, repairs drift, and preserves unrelated variables",
  () => {
    const mock = mockClient();
    mock.state.variables = {
      MANAGED: Redacted.make("original-secret"),
      OTHER: Redacted.make("unrelated"),
    };
    return Effect.gen(function* () {
      const provider = yield* EnvironmentVariables.provider;
      const candidate = yield* provider.read({
        ...lifecycle,
        olds: props,
        output: undefined,
      });
      expect(Unowned.is(candidate)).toBe(true);
      const first = yield* provider.reconcile({
        ...lifecycle,
        news: props,
        olds: undefined,
        output: candidate,
      });
      const again = yield* provider.reconcile({
        ...lifecycle,
        news: props,
        olds: props,
        output: first,
      });
      expect(again).toEqual(first);
      expect(mock.client.updateEnvironmentVariables).toHaveBeenCalledTimes(1);
      expect(Redacted.value(mock.state.variables.OTHER)).toBe("unrelated");
      mock.state.variables.MANAGED = Redacted.make("drift");
      const observed = yield* provider.read({
        ...lifecycle,
        olds: props,
        output: first,
      });
      assert(observed);
      expect(Redacted.value(observed.variables.MANAGED)).toBe("drift");
      const diffResult = yield* provider.diff({
        ...lifecycle,
        olds: props,
        news: props,
        output: first,
        oldBindings: [],
        newBindings: [],
      });
      expect(diffResult).toEqual({ action: "update" });
      yield* provider.reconcile({
        ...lifecycle,
        news: props,
        olds: props,
        output: observed,
      });
      expect(Redacted.value(mock.state.variables.MANAGED)).toBe(
        "desired-secret",
      );
      const encodedResult = yield* Schema.encodeEffect(
        Schema.fromJsonString(Schema.Unknown),
      )(first);
      expect(encodedResult).not.toContain("desired-secret");
      expect(encodedResult).not.toContain("test-key");
      expect(encodedResult).not.toContain("original-secret");
      yield* provider.delete({ ...lifecycle, olds: props, output: first });
      yield* provider.delete({ ...lifecycle, olds: props, output: first });
      expect(Record.map(mock.state.variables, Redacted.value)).toEqual({
        MANAGED: "original-secret",
        OTHER: "unrelated",
      });
      expect(mock.client.updateEnvironmentVariables).toHaveBeenCalledTimes(3);
    }).pipe(Effect.provideService(ConvexClient, mock.client));
  },
);

it.effect(
  "requires cold adoption and restores adopted values on release",
  () => {
    const mock = mockClient();
    mock.state.variables = {
      MANAGED: Redacted.make("original-secret"),
      OTHER: Redacted.make("unrelated"),
    };
    return Effect.gen(function* () {
      const provider = yield* EnvironmentVariables.provider;
      const found = yield* provider.read({
        ...lifecycle,
        olds: props,
        output: undefined,
      });
      expect(Unowned.is(found)).toBe(true);
      const rejected = yield* Effect.flip(
        provider.reconcile({
          ...lifecycle,
          news: props,
          olds: undefined,
          output: undefined,
        }),
      );
      expect(rejected._tag).toBe("OwnedBySomeoneElse");
      const adopted = yield* provider.reconcile({
        ...lifecycle,
        news: props,
        olds: undefined,
        output: found,
      });
      expect(Redacted.value(adopted.originals.MANAGED)).toBe("original-secret");
      const released = yield* provider.reconcile({
        ...lifecycle,
        news: { ...props, variables: {} },
        olds: props,
        output: adopted,
      });
      expect(Redacted.value(mock.state.variables.MANAGED)).toBe(
        "original-secret",
      );
      expect(Redacted.value(mock.state.variables.OTHER)).toBe("unrelated");
      expect(released.ownedNames).toEqual([]);
      expect(released.originals).toEqual({});
      expect(adopted.ownedNames).toEqual(["MANAGED"]);
    }).pipe(Effect.provideService(ConvexClient, mock.client));
  },
);

it.effect(
  "refuses target changes and newly introduced foreign variable collisions",
  () => {
    const mock = mockClient();
    mock.state.variables.MANAGED = Redacted.make("original-secret");
    return Effect.gen(function* () {
      const provider = yield* EnvironmentVariables.provider;
      const first = yield* provider.read({
        ...lifecycle,
        olds: props,
        output: undefined,
      });
      assert(first);
      const target = yield* Effect.flip(
        provider.reconcile({
          ...lifecycle,
          news: {
            ...props,
            url: "https://token-in-url@other.convex.cloud/?key=secret-query",
          },
          olds: props,
          output: first,
        }),
      );
      expect(target._tag).toBe("EnvironmentTargetChange");
      const errorJson = yield* Schema.encodeEffect(
        Schema.fromJsonString(Schema.Unknown),
      )(target);
      expect(errorJson).not.toContain("token-in-url");
      expect(errorJson).not.toContain("secret-query");
      mock.state.variables.FOREIGN = Redacted.make("external");
      const collision = yield* Effect.flip(
        provider
          .reconcile({
            ...lifecycle,
            news: {
              ...props,
              variables: { ...props.variables, FOREIGN: "replacement" },
            },
            olds: props,
            output: first,
          })
          .pipe(Effect.provideService(AdoptPolicy, true)),
      );
      expect(collision).toMatchObject({
        _tag: "OwnedBySomeoneElse",
        physicalName: "FOREIGN",
      });
      expect(Redacted.value(mock.state.variables.FOREIGN)).toBe("external");
      expect(Redacted.value(mock.state.variables.MANAGED)).toBe(
        "original-secret",
      );
      expect(mock.client.updateEnvironmentVariables).not.toHaveBeenCalled();
    }).pipe(Effect.provideService(ConvexClient, mock.client));
  },
);

it.effect(
  "removes readable names created by a legacy row without touching unrelated variables",
  () => {
    const mock = mockClient();
    mock.state.variables = {
      MANAGED: Redacted.make("legacy"),
      NEXT: Redacted.make("legacy-next"),
      OTHER: Redacted.make("external"),
    };
    return Effect.gen(function* () {
      const provider = yield* EnvironmentVariables.provider;
      const first = {
        url: props.url,
        deployKey: props.deployKey,
        ownedNames: ["MANAGED", "NEXT"],
        variables: {
          MANAGED: mock.state.variables.MANAGED,
          NEXT: mock.state.variables.NEXT,
        },
        originals: {},
      };
      const output = yield* provider.reconcile({
        ...lifecycle,
        news: { ...props, variables: { NEXT: "next" } },
        olds: props,
        output: first,
      });
      expect(output.ownedNames).toEqual(["NEXT"]);
      expect(Record.keys(mock.state.variables).sort()).toEqual([
        "NEXT",
        "OTHER",
      ]);
      expect(Redacted.isRedacted(output.variables.NEXT)).toBe(true);
      expect(output.originals).toEqual({});
      expect(props.variables).toHaveProperty("MANAGED");
      yield* provider.delete({ ...lifecycle, olds: props, output });
      expect(Record.keys(mock.state.variables)).toEqual(["OTHER"]);
    }).pipe(Effect.provideService(ConvexClient, mock.client));
  },
);

it.effect(
  "treats prototype property names as ordinary environment variables",
  () => {
    const mock = mockClient();
    return Effect.gen(function* () {
      const provider = yield* EnvironmentVariables.provider;
      const news = {
        ...props,
        variables: {
          constructor: "constructor-value",
          toString: "string-value",
        },
      };
      const readResult = yield* provider.read({
        ...lifecycle,
        olds: news,
        output: undefined,
      });
      expect(readResult).toBeUndefined();
      mock.state.variables = {
        constructor: Redacted.make("old-constructor"),
        toString: Redacted.make("old-string"),
      };
      const candidate = yield* provider.read({
        ...lifecycle,
        olds: news,
        output: undefined,
      });
      expect(Unowned.is(candidate)).toBe(true);
      const output = yield* provider.reconcile({
        ...lifecycle,
        news,
        olds: undefined,
        output: candidate,
      });
      const diffResult2 = yield* provider.diff({
        ...lifecycle,
        olds: news,
        news,
        output,
        oldBindings: [],
        newBindings: [],
      });
      expect(diffResult2).toBeUndefined();
      yield* provider.delete({ ...lifecycle, olds: news, output });
      expect(Record.map(mock.state.variables, Redacted.value)).toEqual({
        constructor: "old-constructor",
        toString: "old-string",
      });
    }).pipe(Effect.provideService(ConvexClient, mock.client));
  },
);

it.effect.each(["__proto__", "__redacted__", "__date__", "__bytes__"])(
  "rejects the state codec's reserved key %s before any cloud mutation",
  (name) => {
    const fixture = mockClient();
    const variables = { READABLE: "next", [name]: "value" };
    return Effect.gen(function* () {
      const Env = EnvironmentVariables.EnvironmentVariables;
      const ctor = yield* Env;
      const news = { ...props, variables };
      const expected = {
        _tag: "ReservedEnvironmentVariableName",
        variableName: name,
      };
      const direct = yield* Env("Direct", {
        ...news,
        deployKey: Output.literal(props.deployKey),
      }).pipe(Effect.catchDefect(Effect.succeed));
      expect(direct).toMatchObject(expected);
      const yielded = yield* ctor("ViaEffect", Effect.succeed(news)).pipe(
        Effect.catchDefect(Effect.succeed),
      );
      expect(yielded).toMatchObject(expected);
      const provider = yield* EnvironmentVariables.provider;
      const readable = Record.map(variables, (value) => Redacted.make(value));
      fixture.state.variables = readable;
      const output = {
        url: props.url,
        deployKey: props.deployKey,
        ownedNames: Record.keys(variables),
        variables: readable,
        originals: {},
      };
      const read = yield* Effect.flip(
        provider.read({ ...lifecycle, olds: news, output: undefined }),
      );
      expect(read).toMatchObject(expected);
      const write = yield* Effect.flip(
        provider.reconcile({ ...lifecycle, olds: props, news, output }),
      );
      expect(write).toMatchObject(expected);
      const remove = yield* Effect.flip(
        provider.delete({ ...lifecycle, olds: news, output }),
      );
      expect(remove).toMatchObject(expected);
      expect(fixture.client.updateEnvironmentVariables).not.toHaveBeenCalled();
    }).pipe(
      Effect.provideService(ConvexClient, fixture.client),
      Effect.provideService(Stack, {
        name: "test",
        stage: "test",
        resources: {},
        bindings: {},
        actions: {},
      }),
      Effect.provideService(Providers, {
        kind: "ProviderCollection",
        providers: {},
        get: () => undefined,
      }),
    );
  },
);

it.effect("validates whole-map inputs when Alchemy resolves them", () =>
  Effect.gen(function* () {
    const Env = EnvironmentVariables.EnvironmentVariables;
    const ref = yield* Env.ref("External", { stage: "other" });
    expect(Output.isRefExpr(ref)).toBe(true);
    const source = yield* Env("Source", props);
    const deferred = yield* Env("Deferred", {
      ...props,
      variables: source.variables,
    });
    const resolved = yield* Output.evaluate(deferred.Props, {
      [source.FQN]: { variables: props.variables },
    });
    expect(resolved.variables).toEqual(props.variables);
    const unsafe = { ["__bytes__"]: "example" };
    const rejected = yield* Output.evaluate(deferred.Props, {
      [source.FQN]: { variables: unsafe },
    }).pipe(Effect.catchDefect(Effect.succeed));
    expect(rejected).toMatchObject({ _tag: "ReservedEnvironmentVariableName" });
    const config = yield* Env("Config", {
      ...props,
      variables: Config.succeed(unsafe),
    });
    const invalidConfig = yield* Output.evaluate(config.Props, {}).pipe(
      Effect.catchDefect(Effect.succeed),
    );
    expect(invalidConfig).toMatchObject({
      _tag: "ReservedEnvironmentVariableName",
    });
  }).pipe(
    Effect.provideService(Providers, {
      kind: "ProviderCollection",
      providers: {},
      get: () => undefined,
    }),
    Effect.provideService(Stack, {
      name: "test",
      stage: "test",
      resources: {},
      bindings: {},
      actions: {},
    }),
    Effect.provideService(State, InMemoryService()),
  ),
);

it.effect(
  "does not offer a partial adoption or create an unlisted name",
  () => {
    const mock = mockClient();
    mock.state.variables.MANAGED = Redacted.make("original-secret");
    const news = {
      ...props,
      variables: { ...props.variables, UNLISTED: "unlisted-secret" },
    };
    return Effect.gen(function* () {
      const provider = yield* EnvironmentVariables.provider;
      const candidate = yield* provider.read({
        ...lifecycle,
        olds: news,
        output: undefined,
      });
      expect(candidate).toBeUndefined();
      const error = yield* Effect.flip(
        provider.reconcile({
          ...lifecycle,
          news,
          olds: undefined,
          output: candidate,
        }),
      );
      expect(error).toMatchObject({
        _tag: "UnreadableEnvironmentVariable",
        variableName: "UNLISTED",
      });
      const encoded = yield* Schema.encodeEffect(
        Schema.fromJsonString(Schema.Unknown),
      )(error);
      for (const secret of [
        "original-secret",
        "desired-secret",
        "unlisted-secret",
        "test-key",
      ])
        expect(encoded).not.toContain(secret);
      expect(mock.client.updateEnvironmentVariables).not.toHaveBeenCalled();
    }).pipe(
      Effect.provideService(ConvexClient, mock.client),
      Effect.provideService(AdoptPolicy, true),
    );
  },
);

it.effect.each([false, true])(
  "refuses drift repair, release, and deletion when an owned name is unlisted (legacy=%s)",
  (legacy) => {
    const mock = mockClient();
    mock.state.variables.MANAGED = Redacted.make("drift");
    const variables = {
      MANAGED: Redacted.make("desired-secret"),
      UNLISTED: Redacted.make("previously-readable"),
    };
    const olds = { ...props, variables };
    const output: EnvironmentVariables.EnvironmentVariablesAttributes = {
      url: props.url,
      deployKey: props.deployKey,
      ownedNames: Record.keys(variables),
      variables,
      originals: legacy
        ? {}
        : {
            MANAGED: Redacted.make("original-secret"),
            UNLISTED: Redacted.make("original-unlisted"),
          },
    };
    return Effect.gen(function* () {
      const provider = yield* EnvironmentVariables.provider;
      const live = yield* provider.read({ ...lifecycle, olds, output });
      assert(live);
      expect(live.ownedNames).toEqual(["MANAGED", "UNLISTED"]);
      expect(Record.keys(live.variables)).toEqual(["MANAGED"]);
      const unreadable = {
        _tag: "UnreadableEnvironmentVariable",
        variableName: "UNLISTED",
      };
      const diffFailure = yield* Effect.flip(
        provider.diff({
          ...lifecycle,
          olds,
          news: olds,
          output,
          oldBindings: [],
          newBindings: [],
        }),
      );
      expect(diffFailure).toMatchObject(unreadable);
      for (const news of [olds, props, { ...props, variables: {} }]) {
        const error = yield* Effect.flip(
          provider.reconcile({ ...lifecycle, olds, news, output: live }),
        );
        expect(error).toMatchObject(unreadable);
      }
      const error = yield* Effect.flip(
        provider.delete({ ...lifecycle, olds, output: live }),
      );
      expect(error).toMatchObject(unreadable);
      expect(mock.client.updateEnvironmentVariables).not.toHaveBeenCalled();
      expect(Redacted.value(mock.state.variables.MANAGED)).toBe("drift");
    }).pipe(Effect.provideService(ConvexClient, mock.client));
  },
);

it.effect("accepts an empty map without adopting unrelated variables", () => {
  const mock = mockClient();
  mock.state.variables.OTHER = Redacted.make("unrelated");
  const news = { ...props, variables: {} };
  return Effect.gen(function* () {
    const provider = yield* EnvironmentVariables.provider;
    const candidate = yield* provider.read({
      ...lifecycle,
      olds: news,
      output: undefined,
    });
    expect(candidate).toBeUndefined();
    const output = yield* provider.reconcile({
      ...lifecycle,
      news,
      olds: undefined,
      output: candidate,
    });
    expect(output).toMatchObject({
      ownedNames: [],
      variables: {},
      originals: {},
    });
    yield* provider.delete({ ...lifecycle, olds: news, output });
    expect(mock.client.updateEnvironmentVariables).not.toHaveBeenCalled();
  }).pipe(Effect.provideService(ConvexClient, mock.client));
});
