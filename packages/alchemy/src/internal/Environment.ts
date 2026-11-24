import type { ProviderServiceInput } from "alchemy/Provider";
import {
  UnreadableEnvironmentVariable,
  EnvironmentTargetChange,
  AuthoritativeEnvironmentVariableIdentityChange,
} from "./DomainErrors.js";
import { checkNames } from "./VariableNames.js";
import * as Array from "effect/Array";
import * as Rec from "effect/Record";

import { Unowned } from "alchemy/AdoptPolicy";
import { isResolved } from "alchemy/Diff";

import * as Effect from "effect/Effect";
import * as Redacted from "effect/Redacted";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import { ConvexClient } from "../ConvexClient.js";
import type {
  AuthoritativeEnvironmentVariable,
  EnvironmentVariables,
  EnvironmentVariablesAttributes,
  EnvironmentVariablesProps,
} from "./Resources.js";

import {
  access,
  allowDiscovery,
  attempt,
  type Owner,
  type Ownership,
} from "./Recovery.js";
import type { ConvexClientError } from "../ConvexClient.js";
import { authorize } from "./Target.js";
import * as Platform from "./PlatformClients.js";

type Secret = Redacted.Redacted<string>;
type Values = Readonly<Record<string, Secret>>;
class VariableOwnershipError extends Schema.TaggedError<
  VariableOwnershipError,
  { readonly brand: unique symbol }
>()("VariableOwnershipError", {
  reason: Schema.Literals([
    "unreadable name",
    "adopt in a separate resource",
    "missing original",
    "unavailable value",
  ]),
  names: Schema.Array(Schema.String),
}) {
  override get message(): string {
    return `Cannot manage environment variables: ${this.reason}.`;
  }
}

const issue = (
  reason: VariableOwnershipError["reason"],
  names: ReadonlyArray<string>,
) => VariableOwnershipError.make({ reason, names });
const select = (
  values: Values,
  names: ReadonlyArray<string>,
  reason: "unreadable name" | "missing original" | "unavailable value",
) => {
  const missing = Array.filter(
    names,
    (name) =>
      !Rec.has(values, name) ||
      !Redacted.isRedacted(values[name]) ||
      Result.isFailure(Result.try(() => Redacted.value(values[name]))),
  );
  if (missing.length > 0)
    return reason === "unreadable name"
      ? Result.fail(
          UnreadableEnvironmentVariable.make({ variableName: missing[0] }),
        )
      : Result.fail(issue(reason, missing));
  return Result.succeed(
    Rec.fromEntries(Array.map(names, (name) => [name, values[name]] as const)),
  );
};

const observe = (
  desired: EnvironmentVariablesProps,
  live: Values,
  output?: EnvironmentVariablesAttributes,
) =>
  Result.gen(function* () {
    const ownedNames = output?.ownedNames ?? Rec.keys(desired.variables);
    yield* checkNames(ownedNames);
    const variables = yield* select(live, ownedNames, "unreadable name");
    const originals =
      output !== undefined
        ? yield* select(output.originals, ownedNames, "missing original")
        : variables;
    return {
      ownedNames,
      variables,
      originals,
      deployKey: desired.deployKey,
      url: desired.url,
    };
  });

const editBatch = (
  desired: EnvironmentVariablesProps,
  live: Values,
  output?: EnvironmentVariablesAttributes,
) =>
  Result.gen(function* () {
    const names = Rec.keys(desired.variables);
    yield* checkNames(names);
    const owned = output === undefined ? [] : Rec.keys(output.originals);
    yield* checkNames(owned);
    yield* select(live, [...new Set([...names, ...owned])], "unreadable name");
    const additions = Array.filter(names, (n) => !owned.includes(n));
    if (additions.length > 0)
      return yield* Result.fail(
        issue("adopt in a separate resource", additions),
      );
    const originals = yield* select(
      output?.originals ?? {},
      owned,
      "missing original",
    );
    const variables = Rec.map(desired.variables, (v) =>
      typeof v === "string" ? Redacted.make(v) : v,
    );
    yield* select(variables, names, "unavailable value");
    const changes: globalThis.Array<{
      readonly name: string;
      readonly value: Secret;
    }> = [];
    for (const name of owned) {
      const value = Rec.has(variables, name)
        ? variables[name]
        : originals[name];
      if (Redacted.value(value) !== Redacted.value(live[name]))
        changes.push({ name, value });
    }
    const attributes: EnvironmentVariablesAttributes = {
      url: desired.url,
      deployKey: desired.deployKey,
      ownedNames: names,
      variables,
      originals: yield* select(originals, names, "missing original"),
    };
    return { changes, attributes };
  });

const absentOK = <A>(op: Effect.Effect<A, ConvexClientError>) =>
  op.pipe(Effect.catchTag("ConvexNotFound", () => Effect.undefined));
const listed = (
  client: typeof ConvexClient.Service,
  url: string,
  deployKey: Secret,
  names: ReadonlyArray<string>,
) =>
  names.length > 0
    ? client.listEnvironmentVariables(url, deployKey)
    : Effect.succeed<Values>({});
export const environment = Effect.gen(function* () {
  const client = yield* ConvexClient;
  const platform = yield* Platform.forFacade(client);
  return {
    list: () => Effect.succeed([]),
    read: Effect.fn("Convex.EnvironmentVariables.read")(function* ({
      olds,
      output,
    }) {
      const target = yield* Effect.fromResult(
        authorize(olds.url, olds.deploymentName, olds.deployKey, true),
      );
      const names = output?.ownedNames ?? Rec.keys(olds.variables);
      yield* Effect.fromResult(checkNames(names));
      if (output === undefined && names.length === 0) return undefined;
      const live = yield* listed(client, target.url, olds.deployKey, names);
      const attrs = yield* Effect.fromResult(
        observe({ ...olds, url: target.url }, live, output),
      );
      return output !== undefined
        ? attrs
        : Unowned({ ...attrs, ownedNames: [] });
    }),
    diff: Effect.fn("Convex.EnvironmentVariables.diff")(function* ({
      news,
      output,
    }) {
      if (!isResolved(news)) return;
      const target = yield* Effect.fromResult(
        authorize(news.url, news.deploymentName, news.deployKey, true),
      );
      const names = Rec.keys(news.variables);
      yield* Effect.fromResult(checkNames(names));
      if (output !== undefined && output.url !== target.url)
        return yield* EnvironmentTargetChange.make({ url: output.url });
      if (output !== undefined) {
        const live = yield* listed(client, target.url, news.deployKey, [
          ...names,
          ...output.ownedNames,
        ]);
        const { changes } = yield* Effect.fromResult(
          editBatch(news, live, output),
        );
        if (changes.length > 0) return { action: "update" as const };
      }
    }),
    reconcile: Effect.fn("Convex.EnvironmentVariables.reconcile")(function* ({
      news,
      output,
      olds,
      fqn,
      instanceId,
    }) {
      const owner = { fqn, instanceId, type: "Convex.EnvironmentVariables" };
      const target = yield* Effect.fromResult(
        authorize(news.url, news.deploymentName, news.deployKey, true),
      );
      if (output !== undefined && output.url !== target.url)
        return yield* EnvironmentTargetChange.make({ url: output.url });
      const names = Rec.keys(news.variables);
      yield* Effect.fromResult(checkNames(names));
      const needsRead =
        names.length > 0 || (output?.ownedNames.length ?? 0) > 0;
      const deployment =
        platform !== undefined && needsRead
          ? yield* platform
              .deployment(
                "listEnvironmentVariables",
                target.url,
                news.deployKey,
              )
              .pipe(Effect.map(Platform.environment))
          : undefined;
      const live = needsRead
        ? yield* (
            deployment?.list ??
            client.listEnvironmentVariables(target.url, news.deployKey)
          )
        : {};
      let basis = output;
      if (
        names.length > 0 &&
        (output === undefined ||
          (output.ownedNames.length === 0 &&
            Rec.keys(output.originals).length > 0))
      ) {
        if (output === undefined && !(yield* allowDiscovery(owner)))
          return yield* issue("adopt in a separate resource", names);
        if (
          output !== undefined &&
          Array.some(names, (name) => !Rec.has(output.originals, name))
        )
          return yield* issue("adopt in a separate resource", names);
        basis = yield* Effect.fromResult(
          observe({ ...news, url: target.url }, live),
        );
      }
      const { changes, attributes } = yield* Effect.fromResult(
        editBatch({ ...news, url: target.url }, live, basis),
      );
      if (changes.length > 0 && basis !== undefined) {
        const before: Ownership =
          output !== undefined && output.ownedNames.length > 0
            ? {
                _tag: "Managed",
                previous: {
                  props: {
                    ...(olds ?? news),
                    url: output.url,
                    deployKey: output.deployKey,
                    variables: output.variables,
                  },
                  attr: { ...output },
                },
              }
            : {
                _tag: "Unclaimed",
                desired: {
                  props: { ...news },
                  attr: { ...basis, ownedNames: [] },
                },
              };
        const uncertain = {
          props: { ...news },
          attr: {
            ...basis,
            url: target.url,
            deployKey:
              before._tag === "Managed"
                ? (output?.deployKey ?? news.deployKey)
                : news.deployKey,
          },
        };
        yield* attempt(
          owner,
          before,
          uncertain,
          () =>
            deployment?.update(changes) ??
            client.updateEnvironmentVariables(
              target.url,
              news.deployKey,
              changes,
            ),
        );
      }
      return attributes;
    }),
    delete: Effect.fn("Convex.EnvironmentVariables.delete")(function* ({
      output,
      olds,
      fqn,
      instanceId,
    }) {
      if (output.ownedNames.length === 0) return;
      const target = yield* Effect.fromResult(
        authorize(output.url, undefined, output.deployKey, true),
      );
      const live = yield* absentOK(
        listed(client, target.url, output.deployKey, output.ownedNames),
      );
      if (live === undefined) return;
      const { changes } = yield* Effect.fromResult(
        editBatch({ ...olds, variables: {} }, live, output),
      );
      if (changes.length > 0) {
        yield* access(
          { fqn, instanceId, type: "Convex.EnvironmentVariables" },
          true,
        );
        yield* absentOK(
          client.updateEnvironmentVariables(
            target.url,
            output.deployKey,
            changes,
          ),
        );
      }
    }),
  } satisfies ProviderServiceInput<EnvironmentVariables>;
});

export const writer = Effect.gen(function* () {
  const client = yield* ConvexClient;
  return {
    list: () => Effect.succeed([]),
    diff: Effect.fn("Convex.AuthoritativeEnvironmentVariable.diff")(function* ({
      news,
      output,
    }) {
      if (isResolved(news)) {
        const target = yield* Effect.fromResult(
          authorize(
            news.deployment.url,
            news.deployment.name,
            news.deployKey,
            true,
          ),
        );
        if (
          output !== undefined &&
          (news.name !== output.name || target.url !== output.url)
        )
          return yield* AuthoritativeEnvironmentVariableIdentityChange.make({
            field: news.name !== output.name ? "name" : "url",
          });
      }
      return { action: "update" as const };
    }),
    reconcile: Effect.fn("Convex.AuthoritativeEnvironmentVariable.reconcile")(
      function* ({ fqn, instanceId, news, olds, output }) {
        const owner: Owner = {
          fqn,
          instanceId,
          type: "Convex.AuthoritativeEnvironmentVariable",
        };
        const journal = yield* access(owner);
        const receipt = { name: news.name, url: news.deployment.url };
        let before: Ownership = {
          _tag: "Unclaimed",
          desired: { props: { ...news }, attr: undefined },
        };
        if (output !== undefined) {
          const previousKey = olds?.deployKey ?? journal.row.props?.deployKey;
          const recovered = yield* Schema.decodeUnknownEffect(
            Schema.Redacted(Schema.String),
          )(previousKey).pipe(
            Effect.mapError(() => issue("unavailable value", [])),
          );
          const priorTarget = yield* Effect.fromResult(
            authorize(output.url, olds?.deployment.name, recovered, true),
          );
          before = {
            _tag: "Managed",
            previous: {
              props: {
                ...(olds ?? news),
                deployKey: recovered,
                deployment: priorTarget,
                name: output.name,
              },
              attr: { ...output },
            },
          };
          yield* journal.checkpoint(before.previous);
        }
        const target = yield* Effect.fromResult(
          authorize(
            news.deployment.url,
            news.deployment.name,
            news.deployKey,
            true,
          ),
        );
        if (
          output !== undefined &&
          (output.url !== target.url || output.name !== news.name)
        )
          return yield* AuthoritativeEnvironmentVariableIdentityChange.make({
            field: output.name !== news.name ? "name" : "url",
          });
        const attr = { ...receipt, url: target.url };
        yield* attempt(owner, before, { props: { ...news }, attr }, () =>
          client.updateEnvironmentVariables(target.url, news.deployKey, [
            { name: news.name, value: news.value },
          ]),
        );
        return attr;
      },
    ),
    delete: Effect.fn("Convex.AuthoritativeEnvironmentVariable.delete")(
      function* ({ fqn, instanceId, olds, output }) {
        const target = yield* Effect.fromResult(
          authorize(output.url, olds.deployment.name, olds.deployKey, true),
        );
        yield* access(
          { fqn, instanceId, type: "Convex.AuthoritativeEnvironmentVariable" },
          true,
        );
        yield* absentOK(
          client.updateEnvironmentVariables(target.url, olds.deployKey, [
            { name: output.name },
          ]),
        );
      },
    ),
  } satisfies ProviderServiceInput<AuthoritativeEnvironmentVariable>;
});
