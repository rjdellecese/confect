import { Convex } from "@confect/alchemy";
import { provider } from "@confect/alchemy/AuthoritativeEnvironmentVariable";
import {
  ConvexApiError,
  ConvexClient,
  ConvexNotFound,
} from "@confect/alchemy/ConvexClient";
import { Providers } from "@confect/alchemy/Providers";
import { expect, it } from "@effect/vitest";
import * as RemovalPolicy from "alchemy/RemovalPolicy";
import { Stack } from "alchemy/Stack";
import type * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import { vi } from "vitest";
import { lifecycle, mockClient } from "./fixtures/ConvexClient";

const props: Convex.AuthoritativeEnvironmentVariableProps = {
  deployment: {
    name: "happy-otter-123",
    url: "https://happy-otter-123.convex.cloud",
  },
  deployKey: Redacted.make("prod:happy-otter-123|test-key"),
  name: "TOKEN",
  value: Redacted.make("test-value"),
};
const output = { name: props.name, url: props.deployment.url };
const bindings = { oldBindings: [], newBindings: [] };

it.effect("retains by default and accepts an explicit destroy policy", () =>
  Effect.gen(function* () {
    const retained = yield* Convex.AuthoritativeEnvironmentVariable(
      "Retained",
      props,
    );
    const removed = yield* Convex.AuthoritativeEnvironmentVariable("Removed", {
      ...props,
      name: "OTHER_TOKEN",
      deployment: { name: props.deployment.name, url: retained.url },
    }).pipe(RemovalPolicy.destroy());
    expect(retained.RemovalPolicy).toBe("retain");
    expect(removed.RemovalPolicy).toBe("destroy");
  }).pipe(
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
  ),
);

it.effect.each([false, true])(
  "writes only the declared name on every deploy without reading it (already exists=%s)",
  (exists) => {
    const mock = mockClient();
    const unrelated = Redacted.make("unrelated");
    mock.state.variables = {
      ...(exists ? { TOKEN: Redacted.make("existing") } : {}),
      OTHER: unrelated,
    };
    return Effect.gen(function* () {
      const p = yield* provider;
      expect(p).not.toHaveProperty("read");
      expect(p).not.toHaveProperty("stables");
      const first = yield* p.reconcile({
        ...lifecycle,
        news: props,
        olds: undefined,
        output: undefined,
      });
      expect(first).toStrictEqual(output);
      expect(mock.client.updateEnvironmentVariables.mock.calls).toEqual([
        [
          output.url,
          props.deployKey,
          [{ name: props.name, value: props.value }],
        ],
      ]);
      expect(Redacted.value(mock.state.variables.TOKEN)).toBe("test-value");
      expect(mock.state.variables.OTHER).toBe(unrelated);

      const diff = yield* p.diff({
        ...lifecycle,
        ...bindings,
        news: props,
        olds: props,
        output: first,
      });
      expect(diff).toEqual({ action: "update" });
      const repeated = yield* p.reconcile({
        ...lifecycle,
        news: props,
        olds: props,
        output: first,
      });
      expect(repeated).toEqual(output);
      expect(mock.client.updateEnvironmentVariables).toHaveBeenCalledTimes(2);

      const next = {
        ...props,
        value: "replacement",
        deployKey: Redacted.make("prod:happy-otter-123|rotated"),
      };
      const updated = yield* p.reconcile({
        ...lifecycle,
        news: next,
        olds: props,
        output: repeated,
      });
      expect(updated).toStrictEqual(output);
      expect(mock.client.updateEnvironmentVariables.mock.lastCall?.[1]).toBe(
        next.deployKey,
      );
      expect(mock.client.updateEnvironmentVariables.mock.lastCall).toEqual([
        updated.url,
        next.deployKey,
        [{ name: props.name, value: next.value }],
      ]);
      expect(Redacted.value(mock.state.variables.TOKEN)).toBe(next.value);
      expect(mock.client.listEnvironmentVariables).not.toHaveBeenCalled();
    }).pipe(Effect.provideService(ConvexClient, mock.client));
  },
);

it.effect.each([
  { field: "name", news: { ...props, name: "OTHER" } },
  {
    field: "url",
    news: {
      ...props,
      deployment: { name: "other", url: "https://other.convex.cloud" },
      deployKey: Redacted.make("prod:other|other-key"),
    },
  },
])(
  "rejects a changed $field before planning, writing, or unsetting",
  ({ field, news }) => {
    const mock = mockClient();
    return Effect.gen(function* () {
      const p = yield* provider;
      const input = { ...lifecycle, olds: props, news, output };
      const expected = {
        _tag: "AuthoritativeEnvironmentVariableIdentityChange",
        field,
      };
      const planned = yield* Effect.flip(p.diff({ ...input, ...bindings }));
      expect(planned).toMatchObject(expected);
      const applied = yield* Effect.flip(p.reconcile(input));
      expect(applied).toMatchObject(expected);
      const deleted = yield* Effect.flip(p.delete({ ...input, olds: news }));
      expect(deleted).toMatchObject(expected);
      expect(mock.client.updateEnvironmentVariables).not.toHaveBeenCalled();
      expect(mock.client.listEnvironmentVariables).not.toHaveBeenCalled();
    }).pipe(Effect.provideService(ConvexClient, mock.client));
  },
);

it.effect.each([
  {
    reason: "deployKey",
    news: { ...props, deployKey: Redacted.make("prod:other|misbound") },
  },
  {
    reason: "deployment",
    news: {
      ...props,
      deployment: { ...props.deployment, url: "https://untrusted.example" },
    },
  },
])(
  "rejects an invalid $reason before sending credentials",
  ({ reason, news }) => {
    const mock = mockClient();
    return Effect.gen(function* () {
      const p = yield* provider;
      const created = yield* Effect.flip(
        p.reconcile({ ...lifecycle, news, olds: undefined, output: undefined }),
      );
      expect(created).toMatchObject({
        _tag: "InvalidDeploymentTarget",
        reason,
      });
      const deleted = yield* Effect.flip(
        p.delete({ ...lifecycle, olds: news, output }),
      );
      expect(deleted).toMatchObject({
        _tag: "InvalidDeploymentTarget",
        reason,
      });
      expect(mock.client.updateEnvironmentVariables).not.toHaveBeenCalled();
      expect(mock.client.listEnvironmentVariables).not.toHaveBeenCalled();
    }).pipe(Effect.provideService(ConvexClient, mock.client));
  },
);

it.effect(
  "explicit destroy unsets only the authorized name, including repeated deletion",
  () => {
    const mock = mockClient();
    const unrelated = Redacted.make("untouched");
    mock.state.variables = {
      TOKEN: Redacted.make("external"),
      OTHER: unrelated,
    };
    return Effect.gen(function* () {
      const p = yield* provider;
      const input = { ...lifecycle, olds: props, output };
      yield* p.delete(input);
      yield* p.delete(input);
      expect(mock.client.updateEnvironmentVariables.mock.calls).toEqual([
        [output.url, props.deployKey, [{ name: props.name }]],
        [output.url, props.deployKey, [{ name: props.name }]],
      ]);
      expect(mock.state.variables).toEqual({ OTHER: unrelated });
      expect(mock.client.listEnvironmentVariables).not.toHaveBeenCalled();
    }).pipe(Effect.provideService(ConvexClient, mock.client));
  },
);

it.effect(
  "ignores a missing deployment only on unset and propagates other failures",
  () => {
    const mock = mockClient();
    const fields = {
      operation: "updateEnvironmentVariables",
      code: "HttpError",
    } as const;
    const missing = ConvexNotFound.make({ ...fields, status: 404 });
    const denied = ConvexApiError.make({ ...fields, status: 403 });
    const update = vi
      .fn<
        Context.Service.Shape<typeof ConvexClient>["updateEnvironmentVariables"]
      >()
      .mockReturnValueOnce(Effect.fail(missing))
      .mockReturnValueOnce(Effect.fail(denied))
      .mockReturnValueOnce(Effect.fail(missing));
    return Effect.gen(function* () {
      const p = yield* provider;
      const input = { ...lifecycle, olds: props, output };
      yield* p.delete(input);
      const forbidden = yield* Effect.flip(p.delete(input));
      expect(forbidden).toBe(denied);
      const failed = yield* Effect.flip(p.reconcile({ ...input, news: props }));
      expect(failed).toBe(missing);
      expect(update).toHaveBeenCalledTimes(3);
      expect(mock.client.listEnvironmentVariables).not.toHaveBeenCalled();
    }).pipe(
      Effect.provideService(ConvexClient, {
        ...mock.client,
        updateEnvironmentVariables: update,
      }),
    );
  },
);
