import { OwnedBySomeoneElse, Unowned } from "alchemy/AdoptPolicy";
import { isResolved } from "alchemy/Diff";
import * as Provider from "alchemy/Provider";
import { Resource } from "alchemy/Resource";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Rec from "effect/Record";
import * as Redacted from "effect/Redacted";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";

import { ConvexClient, type EnvironmentVariableChange } from "./ConvexClient";
import type { Providers } from "./Providers";
import { validateTarget } from "./internal/DeploymentTarget";

export interface EnvironmentVariablesProps {
  readonly deploymentName?: string;
  readonly url: string;
  readonly deployKey: Redacted.Redacted<string>;
  readonly variables: Readonly<
    Record<string, string | Redacted.Redacted<string>>
  >;
}

export interface EnvironmentVariablesAttributes {
  readonly url: string;
  readonly deployKey: Redacted.Redacted<string>;
  readonly ownedNames: ReadonlyArray<string>;
  readonly variables: Readonly<Record<string, Redacted.Redacted<string>>>;
  readonly originals: Readonly<Record<string, Redacted.Redacted<string>>>;
}

export type EnvironmentVariables = Resource<
  "Convex.EnvironmentVariables",
  EnvironmentVariablesProps,
  EnvironmentVariablesAttributes,
  never,
  Providers
>;
export const EnvironmentVariables = Resource<EnvironmentVariables>(
  "Convex.EnvironmentVariables",
);

export class EnvironmentTargetChange extends Schema.TaggedError<
  EnvironmentTargetChange,
  { readonly brand: unique symbol }
>()("EnvironmentTargetChange", { url: Schema.String }) {}

export class UnreadableEnvironmentVariable extends Schema.TaggedError<
  UnreadableEnvironmentVariable,
  { readonly brand: unique symbol }
>()("UnreadableEnvironmentVariable", { variableName: Schema.String }) {}

const redacted = (value: string | Redacted.Redacted<string>) =>
  typeof value === "string" ? Redacted.make(value) : value;

const planChanges = (
  observed: EnvironmentVariablesAttributes["variables"],
  desired: EnvironmentVariablesAttributes["variables"],
  output?: EnvironmentVariablesAttributes,
): Result.Result<
  ReadonlyArray<EnvironmentVariableChange>,
  OwnedBySomeoneElse | UnreadableEnvironmentVariable
> => {
  const owned = new Set(output?.ownedNames);
  const originals = output?.originals ?? {};
  const requested = Rec.keys(desired);
  for (const variableName of [...requested, ...owned]) {
    if (!Rec.has(observed, variableName))
      return Result.fail(UnreadableEnvironmentVariable.make({ variableName }));
  }
  for (const name of requested) {
    if (!owned.has(name))
      return Result.fail(
        new OwnedBySomeoneElse({
          message:
            "An existing environment variable requires explicit adoption in a separate resource.",
          resourceType: EnvironmentVariables.Type,
          physicalName: name,
        }),
      );
  }
  const changes: EnvironmentVariableChange[] = [];
  for (const name of owned) {
    const value = Rec.has(desired, name)
      ? desired[name]
      : Rec.has(originals, name)
        ? originals[name]
        : undefined;
    if (value === undefined) changes.push({ name });
    else if (Redacted.value(observed[name]) !== Redacted.value(value))
      changes.push({ name, value });
  }
  return Result.succeed(changes);
};

export const provider = Effect.gen(function* () {
  const client = yield* ConvexClient;
  return {
    diff: Effect.fn("EnvironmentVariables.diff")(function* ({ news, output }) {
      if (!isResolved(news) || output === undefined) return;
      if (news.deploymentName !== undefined)
        yield* Effect.fromResult(
          validateTarget(news.deploymentName, news.url, news.deployKey),
        );
      if (news.url !== output.url)
        return yield* EnvironmentTargetChange.make({
          url: output.url,
        });
      const observed = yield* client.listEnvironmentVariables(
        news.url,
        news.deployKey,
      );
      const changes = yield* Effect.fromResult(
        planChanges(observed, Rec.map(news.variables, redacted), output),
      );
      if (
        changes.length > 0 ||
        output.ownedNames.length !== Rec.size(news.variables)
      )
        return { action: "update" };
    }),
    read: Effect.fn("EnvironmentVariables.read")(function* ({ olds, output }) {
      const url = output?.url ?? olds.url;
      if (url === undefined || olds.deployKey === undefined) return;
      if (olds.deploymentName !== undefined)
        yield* Effect.fromResult(
          validateTarget(olds.deploymentName, url, olds.deployKey),
        );
      const observed = yield* client.listEnvironmentVariables(
        url,
        olds.deployKey,
      );
      const ownedNames = output?.ownedNames ?? Rec.keys(olds.variables);
      const variables = Rec.filter(observed, (_, name) =>
        Arr.contains(ownedNames, name),
      );
      if (output !== undefined)
        return { ...output, deployKey: olds.deployKey, variables };
      if (ownedNames.length === 0 || Rec.size(variables) !== ownedNames.length)
        return undefined;
      return Unowned({
        url,
        deployKey: olds.deployKey,
        ownedNames,
        variables,
        originals: variables,
      });
    }),
    reconcile: Effect.fn("EnvironmentVariables.reconcile")(function* ({
      news,
      output,
    }) {
      if (news.deploymentName !== undefined)
        yield* Effect.fromResult(
          validateTarget(news.deploymentName, news.url, news.deployKey),
        );
      if (output !== undefined && output.url !== news.url)
        return yield* EnvironmentTargetChange.make({
          url: output.url,
        });
      const observed = yield* client.listEnvironmentVariables(
        news.url,
        news.deployKey,
      );
      const desired = Rec.map(news.variables, redacted);
      const changes = yield* Effect.fromResult(
        planChanges(observed, desired, output),
      );
      if (changes.length > 0)
        yield* client.updateEnvironmentVariables(
          news.url,
          news.deployKey,
          changes,
        );
      return {
        url: news.url,
        deployKey: news.deployKey,
        ownedNames: Rec.keys(desired),
        variables: desired,
        originals: Rec.filter(output?.originals ?? {}, (_, name) =>
          Rec.has(desired, name),
        ),
      };
    }),
    delete: Effect.fn("EnvironmentVariables.delete")(function* ({ output }) {
      if (output.ownedNames.length === 0) return;
      const observed = yield* client
        .listEnvironmentVariables(output.url, output.deployKey)
        .pipe(Effect.catchTag("ConvexNotFound", () => Effect.void));
      if (observed === undefined) return;
      const changes = yield* Effect.fromResult(
        planChanges(observed, {}, output),
      );
      if (changes.length > 0)
        yield* client
          .updateEnvironmentVariables(output.url, output.deployKey, changes)
          .pipe(Effect.catchTag("ConvexNotFound", () => Effect.void));
    }),
  } satisfies Provider.ProviderServiceInput<EnvironmentVariables>;
});

export const layer = Provider.effect(EnvironmentVariables, provider);
