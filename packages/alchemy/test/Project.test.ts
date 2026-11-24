import * as Project from "@confect/alchemy/Project";
import * as Api from "@confect/alchemy/ConvexClient";
import { it, expect } from "@effect/vitest";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import * as Layer from "effect/Layer";
import * as Redacted from "effect/Redacted";
import { mockFetch } from "./fixtures/Fetch.js";

it.effect(
  "stops discovery at the second matching project without truncating listProjects",
  () =>
    Effect.gen(function* () {
      const cursors: (string | null)[] = [];
      const item = (id: number, name: string, teamId = 7) => ({
        id,
        teamId,
        name,
        slug: `project-${id}`,
        teamSlug: "team",
        createTime: 1,
      });
      const cloud = Api.layer({ token: Redacted.make("test-token") }).pipe(
        Layer.provide(
          Layer.succeed(
            FetchHttpClient.Fetch,
            mockFetch((input, init) => {
              const url = new URL(new Request(input, init).url);
              expect(url.pathname).toBe("/v1/teams/7/projects");
              const cursor = url.searchParams.get("cursor");
              cursors.push(cursor);
              const page =
                cursor === null
                  ? {
                      items: [item(1, "Notes", 8), item(2, "Notes")],
                      pagination: { hasMore: true, nextCursor: "two" },
                    }
                  : cursor === "two"
                    ? {
                        items: [item(3, "Other"), item(4, "Notes")],
                        pagination: { hasMore: true, nextCursor: "three" },
                      }
                    : {
                        items: [item(5, "Unique"), item(6, "Notes")],
                        pagination: { hasMore: false },
                      };
              return Promise.resolve(Response.json(page));
            }),
          ),
        ),
      );
      const services = yield* Layer.build(cloud);
      const provider = yield* Project.provider.pipe(Effect.provide(services));
      const read = (name: string) =>
        provider.read({
          id: "Project",
          fqn: "Project",
          instanceId: "01",
          olds: { teamId: 7, name },
          output: undefined,
        });
      const duplicate = yield* read("Notes").pipe(Effect.flip);
      expect(duplicate).toMatchObject({
        _tag: "AmbiguousProject",
        projectIds: [2, 4],
      });
      expect(cursors).toEqual([null, "two"]);
      cursors.length = 0;
      const unique = yield* read("Unique");
      expect(unique?.projectId).toBe(5);
      expect(cursors).toEqual([null, "two", "three"]);
      cursors.length = 0;
      const client = yield* Api.ConvexClient.pipe(Effect.provide(services));
      const all = yield* client.listProjects(7);
      expect(all).toHaveLength(6);
      expect(cursors).toEqual([null, "two", "three"]);
      cursors.length = 0;
      const override = yield* Project.provider.pipe(
        Effect.provideService(Api.ConvexClient, {
          ...client,
          listProjects: () => Effect.succeed([item(99, "Custom")]),
        }),
        Effect.provide(services),
      );
      expect(
        (yield* override.read({
          id: "Project",
          fqn: "Project",
          instanceId: "01",
          olds: { teamId: 7, name: "Custom" },
          output: undefined,
        }))?.projectId,
      ).toBe(99);
      expect(cursors).toEqual([]);
    }),
);
