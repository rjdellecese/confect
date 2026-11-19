import { ConvexClient } from "@confect/alchemy/ConvexClient";
import { it, expect } from "@effect/vitest";
import { Unowned } from "alchemy/AdoptPolicy";
import * as Effect from "effect/Effect";

import * as Project from "@confect/alchemy/Project";
import { lifecycle, mockClient, project } from "./fixtures/ConvexClient";

it.effect(
  "creates once, observes drift, and updates only changed names",
  () => {
    const mock = mockClient();
    return Effect.gen(function* () {
      const provider = yield* Project.provider;
      const news = { teamId: 10, name: "example" };
      const first = yield* provider.reconcile({
        ...lifecycle,
        news,
        olds: undefined,
        output: undefined,
      });
      expect(first).toEqual({
        projectId: 1,
        teamId: 10,
        name: "example",
        slug: "example",
      });
      expect(mock.client.getProject).not.toHaveBeenCalled();
      const second = yield* provider.reconcile({
        ...lifecycle,
        news,
        olds: news,
        output: first,
      });
      expect(second).toEqual(first);
      expect(mock.client.createProject).toHaveBeenCalledTimes(1);
      expect(mock.client.updateProject).not.toHaveBeenCalled();
      mock.state.projects = [project({ name: "drift" })];
      const observed = yield* provider.read({
        ...lifecycle,
        olds: news,
        output: first,
      });
      expect(observed?.name).toBe("drift");
      const diffResult = yield* provider.diff({
        ...lifecycle,
        olds: news,
        news,
        output: first,
        oldBindings: [],
        newBindings: [],
      });
      expect(diffResult).toEqual({ action: "update" });
      const restored = yield* provider.reconcile({
        ...lifecycle,
        news,
        olds: news,
        output: observed,
      });

      expect(restored.name).toBe("example");
      expect(mock.client.updateProject).toHaveBeenCalledTimes(1);
    }).pipe(Effect.provideService(ConvexClient, mock.client));
  },
);

it.effect(
  "requires adoption of cold name matches and rejects ambiguous projects",
  () => {
    const mock = mockClient();
    mock.state.projects = [project()];
    return Effect.gen(function* () {
      const provider = yield* Project.provider;
      const news = { teamId: 10, name: "example" };
      const found = yield* provider.read({
        ...lifecycle,
        olds: news,
        output: undefined,
      });
      expect(Unowned.is(found)).toBe(true);
      const rejected = yield* Effect.flip(
        provider.reconcile({
          ...lifecycle,
          news,
          olds: undefined,
          output: undefined,
        }),
      );
      expect(rejected._tag).toBe("OwnedBySomeoneElse");
      const adopted = yield* provider.reconcile({
        ...lifecycle,
        news,
        olds: undefined,
        output: found,
      });
      expect(adopted.projectId).toBe(1);
      mock.state.projects.push(project({ id: 2 }));
      const ambiguous = yield* Effect.flip(
        provider.read({ ...lifecycle, olds: news, output: undefined }),
      );
      expect(ambiguous._tag).toBe("AmbiguousProject");
      expect(mock.client.createProject).not.toHaveBeenCalled();
    }).pipe(Effect.provideService(ConvexClient, mock.client));
  },
);

it.effect(
  "detects deterministic retry names without claiming ownership",
  () => {
    const mock = mockClient();
    return Effect.gen(function* () {
      const provider = yield* Project.provider;
      const news = { teamId: 10 };
      const first = yield* provider.reconcile({
        ...lifecycle,
        news,
        olds: undefined,
        output: undefined,
      });
      const found = yield* provider.read({
        ...lifecycle,
        olds: news,
        output: undefined,
      });
      expect(found?.name).toBe(first.name);
      expect(Unowned.is(found)).toBe(true);
      const error = yield* Effect.flip(
        provider.reconcile({
          ...lifecycle,
          news,
          olds: undefined,
          output: undefined,
        }),
      );
      expect(error._tag).toBe("OwnedBySomeoneElse");
      expect(mock.client.createProject).toHaveBeenCalledTimes(1);
    }).pipe(Effect.provideService(ConvexClient, mock.client));
  },
);

it.effect(
  "rejects team changes without mutation and deletes idempotently",
  () => {
    const mock = mockClient();
    mock.state.projects = [project()];
    return Effect.gen(function* () {
      const provider = yield* Project.provider;
      const olds = { teamId: 10, name: "example" };
      const output = {
        projectId: 1,
        teamId: 10,
        name: "example",
        slug: "example",
      };
      const error = yield* Effect.flip(
        provider.reconcile({
          ...lifecycle,
          news: { ...olds, teamId: 20 },
          olds,
          output,
        }),
      );
      expect(error._tag).toBe("ProjectTeamChange");
      expect(mock.client.createProject).not.toHaveBeenCalled();
      expect(mock.client.updateProject).not.toHaveBeenCalled();
      expect(mock.client.deleteProject).not.toHaveBeenCalled();
      yield* provider.delete({ ...lifecycle, olds, output });
      yield* provider.delete({ ...lifecycle, olds, output });
      expect(mock.client.deleteProject).toHaveBeenCalledTimes(1);
      expect(mock.state.projects).toEqual([]);
      const readResult = yield* provider.read({ ...lifecycle, olds, output });
      expect(readResult).toBeUndefined();
    }).pipe(Effect.provideService(ConvexClient, mock.client));
  },
);

it.effect("refuses to destroy a project transferred to another team", () => {
  const mock = mockClient();
  mock.state.projects = [project({ teamId: 20 })];
  return Effect.gen(function* () {
    const provider = yield* Project.provider;
    const error = yield* Effect.flip(
      provider.delete({
        ...lifecycle,
        olds: { teamId: 10 },
        output: { projectId: 1, teamId: 10, name: "example", slug: "example" },
      }),
    );
    expect(error).toMatchObject({
      _tag: "ProjectTeamChange",
      teamId: 20,
      requestedTeamId: 10,
    });
    expect(mock.client.deleteProject).not.toHaveBeenCalled();
  }).pipe(Effect.provideService(ConvexClient, mock.client));
});

it.effect.each([undefined, "initial"])(
  "repairs the managed name after observation and an FQN move, initial name=%s",
  (name) => {
    const mock = mockClient();
    return Effect.gen(function* () {
      const provider = yield* Project.provider;
      const news = { teamId: 10 };
      const initial = name === undefined ? news : { ...news, name };
      const first = yield* provider.reconcile({
        ...lifecycle,
        news: initial,
        olds: undefined,
        output: undefined,
      });
      const renamed = { ...lifecycle, fqn: "migrated" };
      mock.state.projects = [project({ name: "external" })];
      const observed = yield* provider.read({
        ...renamed,
        olds: initial,
        output: first,
      });
      expect(observed?.name).toBe("external");
      const restored = yield* provider.reconcile({
        ...renamed,
        news,
        olds: initial,
        output: observed,
      });
      expect(restored).toEqual(first);
      expect(mock.client.updateProject).toHaveBeenCalledWith(first.projectId, {
        name: first.name,
      });
    }).pipe(Effect.provideService(ConvexClient, mock.client));
  },
);

it.effect(
  "refreshes an externally changed slug without renaming the project",
  () => {
    const mock = mockClient();
    return Effect.gen(function* () {
      const provider = yield* Project.provider;
      const news = { teamId: 10, name: "example" };
      const output = yield* provider.reconcile({
        ...lifecycle,
        news,
        olds: undefined,
        output: undefined,
      });
      mock.state.projects = [project({ slug: "new-slug" })];
      const input = { ...lifecycle, news, olds: news, output };
      const diff = yield* provider.diff({
        ...input,
        oldBindings: [],
        newBindings: [],
      });
      expect(diff).toEqual({ action: "update" });
      const refreshed = yield* provider.reconcile(input);
      expect(refreshed.slug).toBe("new-slug");
      expect(mock.client.updateProject).not.toHaveBeenCalled();
    }).pipe(Effect.provideService(ConvexClient, mock.client));
  },
);

it.effect(
  "plans live drift and disappearance without relying on refreshed attributes",
  () => {
    const mock = mockClient();
    mock.state.projects = [project()];
    return Effect.gen(function* () {
      const provider = yield* Project.provider;
      const news = { teamId: 10, name: "example" };
      const output = {
        projectId: 1,
        teamId: 10,
        name: "example",
        slug: "example",
      };
      const input = {
        ...lifecycle,
        olds: news,
        news,
        output,
        oldBindings: [],
        newBindings: [],
      };
      const diffResult2 = yield* provider.diff(input);
      expect(diffResult2).toBeUndefined();
      mock.state.projects = [];
      const diffResult3 = yield* provider.diff(input);
      expect(diffResult3).toEqual({ action: "update" });
      mock.state.projects = [project({ teamId: 20 })];
      const diffResult4 = yield* Effect.flip(provider.diff(input));
      expect(diffResult4._tag).toBe("ProjectTeamChange");
      expect(mock.client.createProject).not.toHaveBeenCalled();
      expect(mock.client.updateProject).not.toHaveBeenCalled();
    }).pipe(Effect.provideService(ConvexClient, mock.client));
  },
);
