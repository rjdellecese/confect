import { OwnedBySomeoneElse, Unowned } from "alchemy/AdoptPolicy";
import { isResolved } from "alchemy/Diff";
import * as Provider from "alchemy/Provider";
import { Resource } from "alchemy/Resource";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Rec from "effect/Record";
import * as Redacted from "effect/Redacted";
import * as Schema from "effect/Schema";

import { ConvexClient } from "./ConvexClient";
import type { Providers } from "./Providers";
import { checkpointCreate, shouldAdopt } from "./internal/Lifecycle";

export interface EnvironmentVariablesProps {
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

export const provider = Effect.gen(function* () {
  const client = yield* ConvexClient;
  const redacted = (value: string | Redacted.Redacted<string>) =>
    typeof value === "string" ? Redacted.make(value) : value;
  const valueAt = (
    variables: Readonly<Record<string, Redacted.Redacted<string>>>,
    name: string,
  ) => (Rec.has(variables, name) ? variables[name] : undefined);
  const select = (
    variables: Readonly<Record<string, Redacted.Redacted<string>>>,
    names: ReadonlyArray<string>,
  ) =>
    Rec.fromEntries(
      Arr.flatMap(names, (name) =>
        !Rec.has(variables, name) ? [] : [[name, variables[name]] as const],
      ),
    );
  return {
    diff: Effect.fn("EnvironmentVariables.diff")(function* ({ news, output }) {
      if (!isResolved(news) || output === undefined) return;
      if (news.url !== output.url)
        return yield* EnvironmentTargetChange.make({
          url: output.url,
        });
      const names = Rec.keys(news.variables);
      if (
        names.length !== output.ownedNames.length ||
        Arr.some(names, (name) => !Arr.contains(output.ownedNames, name))
      )
        return { action: "update" };
      const variables = yield* client.listEnvironmentVariables(
        news.url,
        news.deployKey,
      );
      for (const [name, value] of Rec.toEntries(news.variables)) {
        const observed = valueAt(variables, name);
        if (
          observed === undefined ||
          Redacted.value(observed) !== Redacted.value(redacted(value))
        )
          return { action: "update" };
      }
    }),
    read: Effect.fn("EnvironmentVariables.read")(function* ({ olds, output }) {
      const url = output?.url ?? olds.url;
      if (url === undefined || olds.deployKey === undefined) return;
      const observed = yield* client.listEnvironmentVariables(
        url,
        olds.deployKey,
      );
      const ownedNames = output?.ownedNames ?? Rec.keys(olds.variables);
      const variables = select(observed, ownedNames);
      if (output !== undefined)
        return { ...output, deployKey: olds.deployKey, variables };
      if (Rec.keys(variables).length === 0) return undefined;
      return Unowned({
        url,
        deployKey: olds.deployKey,
        ownedNames,
        variables,
        originals: variables,
      });
    }),
    reconcile: Effect.fn("EnvironmentVariables.reconcile")(function* ({
      fqn,
      instanceId,
      news,
      output,
    }) {
      if (output === undefined) yield* checkpointCreate(fqn, instanceId, news);
      if (output !== undefined && output.url !== news.url)
        return yield* EnvironmentTargetChange.make({
          url: output.url,
        });
      const observed = yield* client.listEnvironmentVariables(
        news.url,
        news.deployKey,
      );
      const ownedNames = Rec.keys(news.variables);
      if (output === undefined && (yield* shouldAdopt(fqn))) {
        const variables = select(observed, ownedNames);
        output = {
          url: news.url,
          deployKey: news.deployKey,
          ownedNames,
          variables,
          originals: variables,
        };
        yield* checkpointCreate(fqn, instanceId, news, output);
      }
      const previousNames = output?.ownedNames ?? [];
      for (const name of ownedNames) {
        if (
          !Arr.contains(previousNames, name) &&
          valueAt(observed, name) !== undefined
        )
          return yield* new OwnedBySomeoneElse({
            message:
              "An existing environment variable requires explicit adoption in a separate resource.",
            resourceType: EnvironmentVariables.Type,
            physicalName: name,
          });
      }
      const desired = Rec.fromEntries(
        Arr.map(
          Rec.toEntries(news.variables),
          ([name, value]) => [name, redacted(value)] as const,
        ),
      );
      const changes: Array<{
        name: string;
        value?: Redacted.Redacted<string>;
      }> = [];
      for (const [name, value] of Rec.toEntries(desired)) {
        const current = valueAt(observed, name);
        if (
          current === undefined ||
          Redacted.value(current) !== Redacted.value(value)
        )
          changes.push({ name, value });
      }
      for (const name of previousNames) {
        if (Rec.has(desired, name)) continue;
        const original =
          output !== undefined ? valueAt(output.originals, name) : undefined;
        const current = valueAt(observed, name);
        if (original !== undefined) {
          if (
            current === undefined ||
            Redacted.value(current) !== Redacted.value(original)
          )
            changes.push({ name, value: original });
        } else if (current !== undefined) changes.push({ name });
      }
      if (changes.length > 0)
        yield* client.updateEnvironmentVariables(
          news.url,
          news.deployKey,
          changes,
        );
      return {
        url: news.url,
        deployKey: news.deployKey,
        ownedNames,
        variables: desired,
        originals: select(output?.originals ?? {}, ownedNames),
      };
    }),
    delete: Effect.fn("EnvironmentVariables.delete")(function* ({ output }) {
      const observed = yield* client
        .listEnvironmentVariables(output.url, output.deployKey)
        .pipe(Effect.catchTag("ConvexNotFound", () => Effect.void));
      if (observed === undefined) return;
      const changes: Array<{
        name: string;
        value?: Redacted.Redacted<string>;
      }> = [];
      for (const name of output.ownedNames) {
        const original = valueAt(output.originals, name);
        const current = valueAt(observed, name);
        if (original !== undefined) {
          if (
            current === undefined ||
            Redacted.value(current) !== Redacted.value(original)
          )
            changes.push({ name, value: original });
        } else if (current !== undefined) changes.push({ name });
      }
      if (changes.length > 0)
        yield* client
          .updateEnvironmentVariables(output.url, output.deployKey, changes)
          .pipe(Effect.catchTag("ConvexNotFound", () => Effect.void));
    }),
  } satisfies Provider.ProviderServiceInput<EnvironmentVariables>;
});

export const layer = Provider.effect(EnvironmentVariables, provider);
