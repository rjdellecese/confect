import { OwnedBySomeoneElse, Unowned } from "alchemy/AdoptPolicy";
import { isResolved } from "alchemy/Diff";
import * as Provider from "alchemy/Provider";
import { Resource } from "alchemy/Resource";
import * as Arr from "effect/Array";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { ConvexClient } from "./ConvexClient.js";
import type { Providers } from "./Providers.js";
import { resourceName } from "./internal/ResourceIdentity.js";
import { checkpointResource } from "./internal/Lifecycle.js";

export interface ProjectProps {
  readonly teamId: number;
  readonly name?: string;
}

export interface ProjectAttributes {
  readonly projectId: number;
  readonly teamId: number;
  readonly name: string;
  readonly managedName?: string;
  readonly slug: string;
}

export type Project = Resource<
  "Convex.Project",
  ProjectProps,
  ProjectAttributes,
  never,
  Providers
>;
export const Project = Resource<Project>("Convex.Project", {
  defaultRemovalPolicy: "retain",
});

export class ProjectTeamChange extends Schema.TaggedError<
  ProjectTeamChange,
  { readonly brand: unique symbol }
>()("ProjectTeamChange", {
  projectId: Schema.Finite,
  teamId: Schema.Finite,
  requestedTeamId: Schema.Finite,
}) {}

export class AmbiguousProject extends Schema.TaggedError<
  AmbiguousProject,
  { readonly brand: unique symbol }
>()("AmbiguousProject", {
  teamId: Schema.Finite,
  projectName: Schema.String,
  projectIds: Schema.Array(Schema.Finite),
}) {}

export const provider = Effect.gen(function* () {
  const client = yield* ConvexClient;
  const attributes = (
    project: {
      id: number;
      teamId: number;
      name: string;
      slug: string;
    },
    managedName = project.name,
  ): ProjectAttributes => ({
    projectId: project.id,
    teamId: project.teamId,
    name: project.name,
    ...(managedName === project.name ? {} : { managedName }),
    slug: project.slug,
  });
  const get = (projectId: number) =>
    client
      .getProject(projectId)
      .pipe(Effect.catchTag("ConvexNotFound", () => Effect.void));
  const validateTeam = (
    projectId: number,
    teamId: number,
    requestedTeamId: number,
  ) =>
    teamId === requestedTeamId
      ? Effect.void
      : Effect.fail(
          ProjectTeamChange.make({ projectId, teamId, requestedTeamId }),
        );
  const find = Effect.fn("Project.find")(function* (
    teamId: number,
    name: string,
  ) {
    const projects = yield* client.listProjects(teamId);
    const matches = Arr.filter(projects, (project) => project.name === name);
    if (matches.length > 1)
      return yield* AmbiguousProject.make({
        teamId,
        projectName: name,
        projectIds: Arr.map(matches, (project) => project.id),
      });
    return matches[0];
  });
  return {
    diff: Effect.fn("Project.diff")(function* ({ news, output }) {
      if (!isResolved(news) || output === undefined) return;
      yield* validateTeam(output.projectId, output.teamId, news.teamId);
      const project = yield* get(output.projectId);
      if (project === undefined) return { action: "update" };
      yield* validateTeam(project.id, project.teamId, news.teamId);
      if (
        (news.name ?? output.managedName ?? output.name) !== project.name ||
        output.slug !== project.slug
      )
        return { action: "update" };
    }),
    read: Effect.fn("Project.read")(function* ({ instanceId, olds, output }) {
      if (output !== undefined) {
        const project = yield* get(output.projectId);
        return project !== undefined
          ? attributes(project, output.managedName ?? output.name)
          : undefined;
      }
      if (olds.teamId === undefined) return;
      const project = yield* find(
        olds.teamId,
        olds.name ?? resourceName("project", instanceId),
      ).pipe(Effect.catchTag("ConvexNotFound", () => Effect.void));
      return project !== undefined ? Unowned(attributes(project)) : undefined;
    }),
    reconcile: Effect.fn("Project.reconcile")(function* ({
      fqn,
      instanceId,
      news,
      output,
    }) {
      if (output === undefined)
        yield* checkpointResource(fqn, instanceId, news);
      if (output !== undefined)
        yield* validateTeam(output.projectId, output.teamId, news.teamId);
      let project =
        output !== undefined ? yield* get(output.projectId) : undefined;
      const name =
        news.name ??
        output?.managedName ??
        output?.name ??
        resourceName("project", instanceId);
      if (project === undefined) {
        const existing = yield* find(news.teamId, name);
        if (existing !== undefined)
          return yield* new OwnedBySomeoneElse({
            message: "An existing project requires explicit adoption.",
            resourceType: Project.Type,
            physicalName: name,
          });
        const created = yield* client.createProject(news.teamId, {
          projectName: name,
        });
        return attributes({
          id: created.id,
          teamId: news.teamId,
          name,
          slug: created.slug,
        });
      }
      yield* validateTeam(project.id, project.teamId, news.teamId);
      if (project.name !== name)
        project = yield* client.updateProject(project.id, {
          name,
        });
      return attributes(project);
    }),
    delete: Effect.fn("Project.delete")(function* ({ olds, output }) {
      const project = yield* get(output.projectId);
      if (project === undefined) return;
      yield* validateTeam(output.projectId, output.teamId, olds.teamId);
      yield* validateTeam(project.id, project.teamId, output.teamId);
      yield* client
        .deleteProject(output.projectId)
        .pipe(Effect.catchTag("ConvexNotFound", () => Effect.void));
    }),
  } satisfies Provider.ProviderServiceInput<Project>;
});

export const layer = Provider.effect(Project, provider);
