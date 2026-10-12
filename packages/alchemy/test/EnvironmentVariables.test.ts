import { it, expect, assert } from "@effect/vitest";
import { Unowned } from "alchemy/AdoptPolicy";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

import * as EnvironmentVariables from "@confect/alchemy/EnvironmentVariables";
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
          new ConvexNotFound({
            operation: "listEnvironmentVariables",
            status: 404,
            code: "HttpError",
          }),
        ),
    }),
  );
});

it.effect(
  "updates only differences, repairs drift, and preserves unrelated variables",
  () => {
    const mock = mockClient();
    mock.state.variables = { OTHER: Redacted.make("unrelated") };
    return Effect.gen(function* () {
      const provider = yield* EnvironmentVariables.provider;
      const first = yield* provider.reconcile({
        ...lifecycle,
        news: props,
        olds: undefined,
        output: undefined,
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
      expect(
        yield* provider.diff({
          ...lifecycle,
          olds: props,
          news: props,
          output: first,
          oldBindings: [],
          newBindings: [],
        }),
      ).toEqual({ action: "update" });
      yield* provider.reconcile({
        ...lifecycle,
        news: props,
        olds: props,
        output: observed,
      });
      expect(Redacted.value(mock.state.variables.MANAGED)).toBe(
        "desired-secret",
      );
      expect(
        yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(
          first,
        ),
      ).not.toContain("desired-secret");
      expect(
        yield* Schema.encodeEffect(Schema.fromJsonString(Schema.Unknown))(
          first,
        ),
      ).not.toContain("test-key");
      yield* provider.delete({ ...lifecycle, olds: props, output: first });
      yield* provider.delete({ ...lifecycle, olds: props, output: first });
      expect(Object.keys(mock.state.variables)).toEqual(["OTHER"]);
      expect(mock.client.updateEnvironmentVariables).toHaveBeenCalledTimes(3);
    }).pipe(Effect.provide(mock.layer));
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
      yield* provider.reconcile({
        ...lifecycle,
        news: { ...props, variables: {} },
        olds: props,
        output: adopted,
      });
      expect(Redacted.value(mock.state.variables.MANAGED)).toBe(
        "original-secret",
      );
      expect(Redacted.value(mock.state.variables.OTHER)).toBe("unrelated");
      mock.state.variables.MANAGED = Redacted.make("desired-secret");
      yield* provider.delete({ ...lifecycle, olds: props, output: adopted });
      expect(Redacted.value(mock.state.variables.MANAGED)).toBe(
        "original-secret",
      );
    }).pipe(Effect.provide(mock.layer));
  },
);

it.effect(
  "refuses target changes and newly introduced foreign variable collisions",
  () => {
    const mock = mockClient();
    return Effect.gen(function* () {
      const provider = yield* EnvironmentVariables.provider;
      const first = yield* provider.reconcile({
        ...lifecycle,
        news: props,
        olds: undefined,
        output: undefined,
      });
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
        provider.reconcile({
          ...lifecycle,
          news: {
            ...props,
            variables: { ...props.variables, FOREIGN: "replacement" },
          },
          olds: props,
          output: first,
        }),
      );
      expect(collision._tag).toBe("OwnedBySomeoneElse");
      expect(Redacted.value(mock.state.variables.FOREIGN)).toBe("external");
      expect(mock.client.updateEnvironmentVariables).toHaveBeenCalledTimes(1);
    }).pipe(Effect.provide(mock.layer));
  },
);

it.effect(
  "removes only previously managed names when desired variables shrink",
  () => {
    const mock = mockClient();
    return Effect.gen(function* () {
      const provider = yield* EnvironmentVariables.provider;
      const first = yield* provider.reconcile({
        ...lifecycle,
        news: props,
        olds: undefined,
        output: undefined,
      });
      mock.state.variables.OTHER = Redacted.make("external");
      const output = yield* provider.reconcile({
        ...lifecycle,
        news: { ...props, variables: { NEXT: "next" } },
        olds: props,
        output: first,
      });
      expect(output.ownedNames).toEqual(["NEXT"]);
      expect(Object.keys(mock.state.variables).sort()).toEqual([
        "NEXT",
        "OTHER",
      ]);
      expect(Redacted.isRedacted(output.variables.NEXT)).toBe(true);
      expect(props.variables).toHaveProperty("MANAGED");
    }).pipe(Effect.provide(mock.layer));
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
      expect(
        yield* provider.read({ ...lifecycle, olds: news, output: undefined }),
      ).toBeUndefined();
      const output = yield* provider.reconcile({
        ...lifecycle,
        news,
        olds: undefined,
        output: undefined,
      });
      expect(
        yield* provider.diff({
          ...lifecycle,
          olds: news,
          news,
          output,
          oldBindings: [],
          newBindings: [],
        }),
      ).toBeUndefined();
      yield* provider.delete({ ...lifecycle, olds: news, output });
      expect(Object.keys(mock.state.variables)).toEqual([]);
    }).pipe(Effect.provide(mock.layer));
  },
);
