import { OwnedBySomeoneElse, Unowned } from "alchemy/AdoptPolicy";
import { isResolved } from "alchemy/Diff";
import * as Provider from "alchemy/Provider";
import { Resource } from "alchemy/Resource";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

import { ConvexClient } from "./ConvexClient";
import type { Providers } from "./Providers";
import { resourceName } from "./internal/ResourceIdentity";
import { checkpointCreate, shouldAdopt } from "./internal/Lifecycle";

export interface ProjectProps {
  readonly teamId: number;
  readonly name?: string;
}

export interface ProjectAttributes {
  readonly projectId: number;
  readonly teamId: number;
  readonly name: string;
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

export class ProjectTeamChange extends Schema.TaggedError<ProjectTeamChange>()(
  "ProjectTeamChange",
  {
    projectId: Schema.Finite,
    teamId: Schema.Finite,
    requestedTeamId: Schema.Finite,
  },
) {}

export class AmbiguousProject extends Schema.TaggedError<AmbiguousProject>()(
  "AmbiguousProject",
  {
    teamId: Schema.Finite,
    name: Schema.String,
    projectIds: Schema.Array(Schema.Finite),
  },
) {}

export const provider = Effect.gen(function* () {
  const client = yield* ConvexClient;
  const attributes = (project: {
    id: number;
    teamId: number;
    name: string;
    slug: string;
  }): ProjectAttributes => ({
    projectId: project.id,
    teamId: project.teamId,
    name: project.name,
    slug: project.slug,
  });
  const find = Effect.fn("Project.find")(function* (
    teamId: number,
    name: string,
  ) {
    const matches = (yield* client.listProjects(teamId)).filter(
      (project) => project.name === name,
    );
    if (matches.length > 1)
      return yield* new AmbiguousProject({
        teamId,
        name,
        projectIds: matches.map((project) => project.id),
      });
    return matches[0];
  });
  return {
    diff: Effect.fn("Project.diff")(function* ({ news, output }) {
      if (!isResolved(news) || !output) return;
      if (output.teamId !== news.teamId)
        return yield* new ProjectTeamChange({
          projectId: output.projectId,
          teamId: output.teamId,
          requestedTeamId: news.teamId,
        });
      const project = yield* client
        .getProject(output.projectId)
        .pipe(Effect.catchTag("ConvexNotFound", () => Effect.void));
      if (!project) return { action: "update" };
      if (project.teamId !== news.teamId)
        return yield* new ProjectTeamChange({
          projectId: project.id,
          teamId: project.teamId,
          requestedTeamId: news.teamId,
        });
      if ((news.name ?? output.name) !== project.name)
        return { action: "update" };
    }),
    read: Effect.fn("Project.read")(function* ({
      fqn,
      instanceId,
      olds,
      output,
    }) {
      if (output) {
        const project = yield* client
          .getProject(output.projectId)
          .pipe(Effect.catchTag("ConvexNotFound", () => Effect.void));
        return project ? attributes(project) : undefined;
      }
      if (olds.teamId === undefined) return;
      const project = yield* find(
        olds.teamId,
        olds.name ?? (yield* resourceName("project", fqn, instanceId)),
      );
      return project ? Unowned(attributes(project)) : undefined;
    }),
    reconcile: Effect.fn("Project.reconcile")(function* ({
      fqn,
      instanceId,
      news,
      output,
    }) {
      if (!output) yield* checkpointCreate(fqn, instanceId, news);
      if (output && output.teamId !== news.teamId)
        return yield* new ProjectTeamChange({
          projectId: output.projectId,
          teamId: output.teamId,
          requestedTeamId: news.teamId,
        });
      let project = output
        ? yield* client
            .getProject(output.projectId)
            .pipe(Effect.catchTag("ConvexNotFound", () => Effect.void))
        : undefined;
      const name =
        news.name ??
        output?.name ??
        (yield* resourceName("project", fqn, instanceId));
      if (!project) {
        const existing = yield* find(news.teamId, name);
        if (existing && !(yield* shouldAdopt(fqn)))
          return yield* new OwnedBySomeoneElse({
            message: "An existing project requires explicit adoption.",
            resourceType: Project.Type,
            physicalName: name,
          });
        if (existing) {
          project = existing;
          yield* checkpointCreate(fqn, instanceId, news, attributes(existing));
        } else {
          const created = yield* client.createProject(news.teamId, {
            projectName: name,
          });
          project = yield* client.getProject(created.id);
        }
      }
      if (project.teamId !== news.teamId)
        return yield* new ProjectTeamChange({
          projectId: project.id,
          teamId: project.teamId,
          requestedTeamId: news.teamId,
        });
      if (project.name !== name)
        project = yield* client.updateProject(project.id, {
          name,
        });
      return attributes(project);
    }),
    delete: Effect.fn("Project.delete")(function* ({ output }) {
      yield* client
        .deleteProject(output.projectId)
        .pipe(Effect.catchTag("ConvexNotFound", () => Effect.void));
    }),
  } satisfies Provider.ProviderServiceInput<Project>;
});

export const layer = Provider.effect(Project, provider);
