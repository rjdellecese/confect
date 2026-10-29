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
      expect(
        yield* provider.diff({
          ...lifecycle,
          olds: news,
          news,
          output: first,
          oldBindings: [],
          newBindings: [],
        }),
      ).toEqual({ action: "update" });
      const restored = yield* provider.reconcile({
        ...lifecycle,
        news,
        olds: news,
        output: observed,
      });

      expect(restored.name).toBe("example");
      expect(mock.client.updateProject).toHaveBeenCalledTimes(1);
    }).pipe(Effect.provide(mock.layer));
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
    }).pipe(Effect.provide(mock.layer));
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
    }).pipe(Effect.provide(mock.layer));
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
      expect(mock.state.projects).toEqual([]);
      expect(
        yield* provider.read({ ...lifecycle, olds, output }),
      ).toBeUndefined();
    }).pipe(Effect.provide(mock.layer));
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
      expect(yield* provider.diff(input)).toBeUndefined();
      mock.state.projects = [];
      expect(yield* provider.diff(input)).toEqual({ action: "update" });
      mock.state.projects = [project({ teamId: 20 })];
      expect((yield* Effect.flip(provider.diff(input)))._tag).toBe(
        "ProjectTeamChange",
      );
      expect(mock.client.createProject).not.toHaveBeenCalled();
      expect(mock.client.updateProject).not.toHaveBeenCalled();
    }).pipe(Effect.provide(mock.layer));
  },
);
