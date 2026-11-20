import type { ProviderServiceInput } from "alchemy/Provider";
import * as Array from "effect/Array";
import * as Equal from "effect/Equal";
import { pipe } from "effect/Function";
import * as Order from "effect/Order";
import * as Option from "effect/Option";
import * as Str from "effect/String";

import type { ManagementApi } from "@confect/platform";
import type { DeployKey as KeyMetadata } from "../ConvexClient.js";
import { Unowned } from "alchemy/AdoptPolicy";
import { isResolved } from "alchemy/Diff";

import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import * as Schema from "effect/Schema";
import * as Stream from "effect/Stream";
import * as Platform from "./PlatformClients.js";

import { ConvexClient, type ConvexClientError } from "../ConvexClient.js";
import {
  ProjectTeamChange,
  AmbiguousProject,
  DeploymentIdentityChange,
  UnsupportedLocalDeployment,
  AmbiguousDeployment,
  DeployKeyRecoveryRequired,
  DeployKeyChangeRequiresNewResource,
} from "./DomainErrors.js";
import {
  Deployment,
  DeployKey,
  Project,
  type DeploymentProps,
  type ProjectAttributes,
  type DeployKeyProps,
  type DeployKeyAttributes,
} from "./Resources.js";

import { access, allowDiscovery, attempt } from "./Recovery.js";
import * as Predicate from "effect/Predicate";
import { cloudOrigin, isDeploymentName, usableKey } from "./Target.js";

class IdentityConflict extends Schema.TaggedError<
  IdentityConflict,
  { readonly brand: unique symbol }
>()("IdentityConflict", { resource: Schema.String, field: Schema.String }) {
  override get message(): string {
    return `Cannot reconcile ${this.resource}: conflicting ${this.field}.`;
  }
}
const physicalName = (kind: string, fqn: string, instanceId: string) => {
  const readable = pipe(
    fqn,
    Str.toLowerCase,
    Str.replace(/[^a-z0-9-]+/gu, "-"),
    Str.slice(0, 16),
  );
  return `alchemy-${kind}-${readable}-${instanceId}`;
};

const ifPresent = <A>(request: Effect.Effect<A, ConvexClientError>) =>
  request.pipe(Effect.catchTag("ConvexNotFound", () => Effect.undefined));
const identity = (matches: boolean, resource: string, field: string) =>
  matches
    ? Result.succeed(undefined)
    : Result.fail(IdentityConflict.make({ resource, field }));

const projectTeam = (
  projectId: number | undefined,
  current: number,
  requested: number,
): Result.Result<void, ProjectTeamChange | IdentityConflict> => {
  if (current === requested) return Result.succeed(undefined);
  if (projectId === undefined)
    return Result.fail(
      IdentityConflict.make({ resource: Project.Type, field: "teamId" }),
    );
  return Result.fail(
    ProjectTeamChange.make({
      projectId,
      teamId: current,
      requestedTeamId: requested,
    }),
  );
};
const findProject = Effect.fn("Convex.findProject")(function* (
  stream: (
    teamId: number,
  ) => Stream.Stream<ManagementApi.ProjectResponse, ConvexClientError>,
  teamId: number,
  name: string,
) {
  const matches = yield* ifPresent(
    stream(teamId).pipe(
      Stream.filter(
        (project) => project.teamId === teamId && project.name === name,
      ),
      Stream.take(2),
      Stream.runCollect,
    ),
  );
  if (matches === undefined) return undefined;
  if (matches.length > 1)
    return yield* AmbiguousProject.make({
      teamId,
      projectName: name,
      projectIds: Array.map(matches, (p) => p.id),
    });
  return Array.get(matches, 0).pipe(Option.getOrUndefined);
});

const projectState = (
  p: ManagementApi.ProjectResponse,
  managedName: string,
): ProjectAttributes => ({
  projectId: p.id,
  teamId: p.teamId,
  name: p.name,
  slug: p.slug,
  managedName,
});

export const projects = Effect.gen(function* () {
  const client = yield* ConvexClient;
  const platform = yield* Platform.forFacade(client);
  const stream =
    platform !== undefined
      ? (teamId: number) =>
          Platform.streamProjects(platform.management("listProjects"), teamId)
      : (teamId: number) =>
          Stream.fromIterableEffect(client.listProjects(teamId));
  return {
    list: () => Effect.succeed([]),
    read: Effect.fn("Convex.Project.read")(function* ({
      fqn,
      instanceId,
      olds,
      output,
    }) {
      const managedName =
        output?.managedName ??
        olds.name ??
        physicalName("project", fqn, instanceId);
      const project =
        output !== undefined
          ? yield* ifPresent(client.getProject(output.projectId))
          : yield* findProject(stream, olds.teamId, managedName);
      if (project === undefined) return undefined;
      yield* Effect.fromResult(
        projectTeam(project.id, project.teamId, olds.teamId),
      );
      yield* Effect.fromResult(
        identity(
          output === undefined || output.projectId === project.id,
          Project.Type,
          "team or project ID",
        ),
      );
      const attributes = projectState(project, managedName);
      return output !== undefined ? attributes : Unowned(attributes);
    }),
    diff: Effect.fn("Convex.Project.diff")(function* ({ news, olds, output }) {
      if (isResolved(news))
        yield* Effect.fromResult(
          projectTeam(output?.projectId, olds.teamId, news.teamId),
        );
      if (output !== undefined) {
        const actual = yield* ifPresent(client.getProject(output.projectId));
        if (actual === undefined) return { action: "update" as const };
        yield* Effect.fromResult(
          projectTeam(actual.id, actual.teamId, olds.teamId),
        );
        if (
          actual.name !== (output.managedName ?? output.name) ||
          actual.name !== output.name ||
          actual.slug !== output.slug
        )
          return { action: "update" as const };
      }
    }),
    reconcile: Effect.fn("Convex.Project.reconcile")(function* ({
      fqn,
      instanceId,
      news,
      olds,
      output,
    }) {
      yield* Effect.fromResult(
        projectTeam(
          output?.projectId,
          output?.teamId ?? olds?.teamId ?? news.teamId,
          news.teamId,
        ),
      );
      const name =
        news.name ??
        output?.managedName ??
        physicalName("project", fqn, instanceId);
      const owner = { fqn, instanceId, type: Project.Type };
      const actual =
        output === undefined
          ? undefined
          : yield* ifPresent(client.getProject(output.projectId));
      if (actual !== undefined && output !== undefined) {
        yield* Effect.fromResult(
          projectTeam(actual.id, actual.teamId, news.teamId),
        );
        yield* Effect.fromResult(
          identity(actual.id === output.projectId, Project.Type, "project ID"),
        );
        if (actual.name === name) return projectState(actual, name);
        yield* access(owner);
        const updated = yield* client.updateProject(actual.id, { name });
        return projectState(updated, name);
      }
      const found = yield* findProject(stream, news.teamId, name);
      if (found !== undefined) {
        if (!(yield* allowDiscovery(owner)))
          return yield* IdentityConflict.make({
            resource: Project.Type,
            field: "existing project requires adoption",
          });
        return projectState(found, name);
      }
      const journal = yield* access(owner);
      yield* journal.checkpoint({ props: { ...news }, attr: undefined });
      const project = yield* client.createProject(news.teamId, {
        projectName: name,
      });
      return {
        projectId: project.id,
        teamId: news.teamId,
        name,
        managedName: name,
        slug: project.slug,
      };
    }),
    delete: Effect.fn("Convex.Project.delete")(function* ({
      output,
      fqn,
      instanceId,
    }) {
      const actual = yield* ifPresent(client.getProject(output.projectId));
      if (actual === undefined) return;
      yield* Effect.fromResult(
        projectTeam(actual.id, actual.teamId, output.teamId),
      );
      yield* Effect.fromResult(
        identity(
          actual.id === output.projectId,
          Project.Type,
          "team or project ID",
        ),
      );
      yield* access({ fqn, instanceId, type: Project.Type }, true);
      yield* ifPresent(client.deleteProject(output.projectId));
    }),
  } satisfies ProviderServiceInput<Project>;
});

const deploymentState = (
  d: ManagementApi.PlatformDeploymentResponse,
  props: DeploymentProps,
  managedReference: string,
  expectedName?: string,
) =>
  Result.gen(function* () {
    if (d.kind !== "cloud")
      return yield* Result.fail(
        UnsupportedLocalDeployment.make({ deploymentName: d.name }),
      );
    yield* sameDeployment(d.name, props, {
      projectId: d.projectId,
      type: d.deploymentType,
      region: d.region,
    });
    if (expectedName !== undefined && expectedName !== d.name)
      return yield* Result.fail(
        DeploymentIdentityChange.make({
          deploymentName: expectedName,
          field: "name",
          current: expectedName,
          requested: d.name,
        }),
      );
    const url = yield* cloudOrigin(d.deploymentUrl, d.name);
    return {
      projectId: d.projectId,
      name: d.name,
      reference: d.reference,
      managedReference,
      type: d.deploymentType,
      url,
      region: d.region,
    };
  });

const findDeployment = Effect.fn("Convex.findDeployment")(function* (
  client: typeof ConvexClient.Service,
  projectId: number,
  reference: string,
) {
  const deployments = yield* ifPresent(client.listDeployments(projectId));
  if (deployments === undefined) return undefined;
  const matches = Array.filter(
    deployments,
    (d) => d.kind === "cloud" && d.reference === reference,
  );
  if (matches.length > 1)
    return yield* AmbiguousDeployment.make({ projectId, reference });
  return Array.get(matches, 0).pipe(Option.getOrUndefined);
});
const sameDeployment = (
  deploymentName: string,
  news: DeploymentProps,
  old: DeploymentProps,
) =>
  Result.gen(function* () {
    for (const field of ["projectId", "type", "region"] as const) {
      const current = old[field],
        requested = news[field];
      if (
        current !== undefined &&
        requested !== undefined &&
        current !== requested
      )
        return yield* Result.fail(
          DeploymentIdentityChange.make({
            deploymentName,
            field,
            current: String(current),
            requested: String(requested),
          }),
        );
    }
  });

export const deployments = Effect.gen(function* () {
  const client = yield* ConvexClient;
  return {
    list: () => Effect.succeed([]),
    read: Effect.fn("Convex.Deployment.read")(function* ({
      fqn,
      instanceId,
      olds,
      output,
    }) {
      const reference =
        output?.managedReference ??
        olds.reference ??
        physicalName("deployment", fqn, instanceId);
      const d =
        output !== undefined
          ? yield* ifPresent(client.getDeployment(output.name))
          : yield* findDeployment(client, olds.projectId, reference);
      if (d === undefined) return undefined;
      const attrs = yield* Effect.fromResult(
        deploymentState(d, olds, reference, output?.name),
      );
      return output !== undefined ? attrs : Unowned(attrs);
    }),
    diff: Effect.fn("Convex.Deployment.diff")(function* ({
      news,
      olds,
      output,
    }) {
      if (isResolved(news))
        yield* Effect.fromResult(
          sameDeployment(output?.name ?? "", news, output ?? olds),
        );
      if (output !== undefined) {
        const actual = yield* ifPresent(client.getDeployment(output.name));
        if (actual === undefined) return { action: "update" as const };
        const saved = yield* Effect.fromResult(
          deploymentState(
            actual,
            output,
            output.managedReference ?? output.reference,
            output.name,
          ),
        );
        if (
          saved.reference !== (output.managedReference ?? output.reference) ||
          saved.reference !== output.reference ||
          saved.url !== output.url
        )
          return { action: "update" as const };
      }
    }),
    reconcile: Effect.fn("Convex.Deployment.reconcile")(function* ({
      fqn,
      instanceId,
      news,
      olds,
      output,
    }) {
      if (output !== undefined || olds !== undefined)
        yield* Effect.fromResult(
          sameDeployment(output?.name ?? "", news, output ?? olds ?? news),
        );
      const reference =
        news.reference ??
        output?.managedReference ??
        physicalName("deployment", fqn, instanceId);
      const owner = { fqn, instanceId, type: Deployment.Type };
      const actual =
        output === undefined
          ? undefined
          : yield* ifPresent(client.getDeployment(output.name));
      if (actual !== undefined && output !== undefined) {
        yield* Effect.fromResult(
          deploymentState(actual, output, reference, output.name),
        );
        const attrs = yield* Effect.fromResult(
          deploymentState(actual, news, reference, output.name),
        );
        if (attrs.reference === reference) return attrs;
        yield* access(owner);
        yield* client.updateDeployment(output.name, { reference });
        return { ...attrs, reference };
      }
      const found = yield* findDeployment(client, news.projectId, reference);
      if (found !== undefined) {
        const attrs = yield* Effect.fromResult(
          deploymentState(found, news, reference),
        );
        if (!(yield* allowDiscovery(owner)))
          return yield* IdentityConflict.make({
            resource: Deployment.Type,
            field: "existing deployment requires adoption",
          });
        return attrs;
      }
      const journal = yield* access(owner);
      yield* journal.checkpoint({ props: { ...news }, attr: undefined });
      const d = yield* client.createDeployment(news.projectId, {
        type: news.type,
        reference,
        ...(news.region === undefined ? {} : { region: news.region }),
      });
      return yield* Effect.fromResult(deploymentState(d, news, reference));
    }),
    delete: Effect.fn("Convex.Deployment.delete")(function* ({
      output,
      fqn,
      instanceId,
    }) {
      const d = yield* ifPresent(client.getDeployment(output.name));
      if (d === undefined) return;
      yield* Effect.fromResult(
        deploymentState(d, output, output.reference, output.name),
      );
      yield* access({ fqn, instanceId, type: Deployment.Type }, true);
      yield* ifPresent(client.deleteDeployment(output.name));
    }),
  } satisfies ProviderServiceInput<Deployment>;
});

const sameActions = (a: ReadonlyArray<string>, b: ReadonlyArray<string>) =>
  Equal.equals(Array.sort(a, Order.String), Array.sort(b, Order.String));
const recovery = (
  reason: DeployKeyRecoveryRequired["reason"],
  deploymentName: string,
  keyName: string,
  keyIds: ReadonlyArray<number>,
) =>
  DeployKeyRecoveryRequired.make({ reason, deploymentName, keyName, keyIds });
const savedKey = (output: DeployKeyAttributes) =>
  usableKey(output.deployKey).pipe(
    Result.mapError(() =>
      recovery("missing saved secret", output.deploymentName, output.name, [
        output.keyId,
      ]),
    ),
  );
const unchangedKey = (
  props: DeployKeyProps,
  olds: DeployKeyProps,
  output: DeployKeyAttributes,
) => {
  const field =
    props.deploymentName !== olds.deploymentName
      ? "deploymentName"
      : props.name !== olds.name
        ? "name"
        : (props.allowedActions === undefined) !==
              (olds.allowedActions === undefined) ||
            !sameActions(props.allowedActions ?? [], olds.allowedActions ?? [])
          ? "allowedActions"
          : undefined;
  return field === undefined
    ? Result.succeed(undefined)
    : Result.fail(
        DeployKeyChangeRequiresNewResource.make({
          deploymentName: output.deploymentName,
          keyId: output.keyId,
          field,
        }),
      );
};

const keyRequest = (props: DeployKeyProps) =>
  Result.gen(function* () {
    yield* identity(
      isDeploymentName(props.deploymentName),
      DeployKey.Type,
      "deploymentName",
    );
    yield* identity(
      props.allowedActions?.length !== 0,
      DeployKey.Type,
      "empty allowedActions",
    );
  });
const lookupKey = (
  keys: ReadonlyArray<KeyMetadata>,
  name: string,
  props: DeployKeyProps,
  output?: DeployKeyAttributes,
) =>
  Result.gen(function* () {
    if (output === undefined) {
      const related = Array.filter(keys, (k) => keyLabel(name, k.name));
      if (related.length > 0)
        return yield* Result.fail(
          recovery(
            "key name already exists",
            props.deploymentName,
            name,
            Array.map(related, (k) => k.id),
          ),
        );
      return undefined;
    }
    yield* savedKey(output);
    const key = Array.findFirst(
      keys,
      (k) => k.id === output.keyId && k.name === output.name,
    );
    if (Option.isNone(key))
      return yield* Result.fail(
        recovery("key not found", output.deploymentName, output.name, [
          output.keyId,
        ]),
      );
    if (
      props.allowedActions !== undefined &&
      !sameActions(props.allowedActions, key.value.allowedActions)
    )
      return yield* Result.fail(
        DeployKeyChangeRequiresNewResource.make({
          deploymentName: output.deploymentName,
          keyId: output.keyId,
          field: "allowedActions",
        }),
      );
    return { ...output, allowedActions: key.value.allowedActions };
  });
const keyLabel = (requested: string, actual: string) =>
  actual === requested ||
  (Str.startsWith(requested)(actual) &&
    /^[ _(-]/u.test(Str.slice(requested.length)(actual)));
export const deployKeys = Effect.gen(function* () {
  const client = yield* ConvexClient;
  return {
    list: () => Effect.succeed([]),
    read: Effect.fn("Convex.DeployKey.read")(function* ({
      olds,
      output,
      fqn,
      instanceId,
      previous,
    }) {
      const name =
        olds.name ?? output?.name ?? physicalName("key", fqn, instanceId);
      yield* Effect.fromResult(keyRequest(olds));
      const keys = yield* ifPresent(client.listDeployKeys(olds.deploymentName));
      if (keys === undefined) return undefined;
      if (
        output === undefined &&
        Predicate.hasProperty(olds, "_confectKeyIssue") &&
        olds._confectKeyIssue === true
      )
        return yield* recovery(
          "issuance uncertain",
          olds.deploymentName,
          name,
          Array.map(
            Array.filter(keys, (k) => keyLabel(name, k.name)),
            (k) => k.id,
          ),
        );
      return yield* Effect.fromResult(
        lookupKey(
          keys,
          name,
          olds,
          output ??
            (previous?.deploymentName === olds.deploymentName &&
            previous.name === name
              ? previous
              : undefined),
        ),
      );
    }),
    diff: Effect.fn("Convex.DeployKey.diff")(function* ({
      news,
      olds,
      output,
    }) {
      if (output !== undefined) yield* Effect.fromResult(savedKey(output));
      if (isResolved(news)) yield* Effect.fromResult(keyRequest(news));
      if (isResolved(news) && output !== undefined)
        yield* Effect.fromResult(unchangedKey(news, olds, output));
      if (output !== undefined) {
        const keys = yield* ifPresent(
          client.listDeployKeys(output.deploymentName),
        );
        if (keys === undefined)
          return yield* recovery(
            "key not found",
            output.deploymentName,
            output.name,
            [output.keyId],
          );
        const actual = yield* Effect.fromResult(
          lookupKey(keys, output.name, olds, output),
        );
        if (
          actual !== undefined &&
          !sameActions(actual.allowedActions, output.allowedActions)
        )
          return { action: "update" as const };
      }
    }),
    reconcile: Effect.fn("Convex.DeployKey.reconcile")(function* ({
      fqn,
      instanceId,
      news,
      output,
      olds,
    }) {
      const name =
        news.name ?? output?.name ?? physicalName("key", fqn, instanceId);
      if (output !== undefined && olds !== undefined)
        yield* Effect.fromResult(unchangedKey(news, olds, output));
      const owner = { fqn, instanceId, type: DeployKey.Type };
      yield* Effect.fromResult(keyRequest(news));
      const before = yield* client.listDeployKeys(news.deploymentName);
      const saved = yield* Effect.fromResult(
        lookupKey(before, name, news, output),
      );
      if (saved !== undefined) return saved;
      const journal = yield* access(owner);
      if (
        journal.row.props?._confectKeyIssue === true &&
        journal.row.attr === undefined
      )
        return yield* recovery(
          "issuance uncertain",
          news.deploymentName,
          name,
          [],
        );
      const fresh = { props: { ...news }, attr: undefined };
      const { deployKey } = yield* attempt(
        owner,
        { _tag: "Unclaimed", desired: fresh },
        { props: { ...news, _confectKeyIssue: true }, attr: undefined },
        () =>
          client.createDeployKey(news.deploymentName, {
            name,
            ...(news.allowedActions === undefined
              ? {}
              : { allowedActions: [...news.allowedActions] }),
          }),
      );
      return yield* Effect.gen(function* () {
        yield* deployKey.pipe(usableKey, Effect.fromResult);
        const after = yield* client.listDeployKeys(news.deploymentName);
        const added = Array.filter(
          after,
          (k) =>
            !Array.some(before, (prev) => prev.id === k.id) &&
            keyLabel(name, k.name),
        );
        const [created] = added;
        if (created === undefined || added.length !== 1)
          return yield* recovery(
            "unverifiable issuance metadata",
            news.deploymentName,
            name,
            Array.map(added, (k) => k.id),
          );
        if (
          news.allowedActions !== undefined &&
          !sameActions(created.allowedActions, news.allowedActions)
        )
          return yield* recovery(
            "issued permissions differ",
            news.deploymentName,
            name,
            [created.id],
          );
        const attributes = {
          deploymentName: news.deploymentName,
          name: created.name,
          keyId: created.id,
          deployKey,
          allowedActions: created.allowedActions,
        };
        yield* journal.checkpoint({ props: { ...news }, attr: attributes });
        return attributes;
      }).pipe(
        Effect.tapError(() =>
          ifPresent(
            client.deleteDeployKey(news.deploymentName, deployKey),
          ).pipe(Effect.andThen(() => journal.checkpoint(fresh))),
        ),
      );
    }),
    delete: Effect.fn("Convex.DeployKey.delete")(function* ({
      output,
      fqn,
      instanceId,
    }) {
      const live = yield* ifPresent(
        client.listDeployKeys(output.deploymentName),
      );
      if (live === undefined || !Array.some(live, (k) => k.id === output.keyId))
        return;
      yield* Effect.fromResult(savedKey(output));
      yield* access({ fqn, instanceId, type: DeployKey.Type }, true);
      yield* ifPresent(
        client.deleteDeployKey(output.deploymentName, output.deployKey),
      );
    }),
  } satisfies ProviderServiceInput<DeployKey>;
});
