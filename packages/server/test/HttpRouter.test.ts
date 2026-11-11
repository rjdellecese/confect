import * as DatabaseSchema from "@confect/server/DatabaseSchema";
import type { GenericId as ConfectId } from "@confect/core";
import { IdScope } from "@confect/core";
import * as Auth from "@confect/server/Auth";
import type * as StorageReader from "@confect/server/StorageReader";
import type * as Scheduler from "@confect/server/Scheduler";
import type * as DataModel from "@confect/server/DataModel";
import type * as ActionCtx from "@confect/server/ActionCtx";
import * as ConfectHttpRouter from "@confect/server/HttpRouter";
import * as Table from "@confect/server/Table";
import * as VectorSearch from "@confect/server/VectorSearch";
import type * as DatabaseWriter from "@confect/server/DatabaseWriter";
import type * as MutationAuth from "@confect/server/MutationAuth";
import type * as TransactionMetadata from "@confect/server/TransactionMetadata";
import { describe, expect, expectTypeOf, it } from "@effect/vitest";
import type { GenericId } from "convex/values";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as HttpRouter from "effect/http/HttpRouter";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import { vi } from "vitest";

describe("HttpRouter", () => {
  const documents = Table.make(() =>
    Schema.Struct({
      embedding: Schema.Array(Schema.Finite),
      category: Schema.String,
      text: Schema.String,
    }),
  )
    .index("by_category", ["category"])
    .vectorIndex("embedding", {
      vectorField: "embedding",
      filterFields: ["category"],
      dimensions: 2,
    })("documents");
  const schema = DatabaseSchema.make({ documents });
  const otherSchema = DatabaseSchema.make({});
  const wrongIndexSchema = DatabaseSchema.make({
    documents: Table.make(() =>
      Schema.Struct({ embedding: Schema.Array(Schema.Finite) }),
    ).vectorIndex("other", { vectorField: "embedding", dimensions: 2 })(
      "documents",
    ),
  });
  type Model = DataModel.FromSchema<typeof schema>;
  const Search = VectorSearch.VectorSearch<Model>();

  it("requires a matching schema for vector-search route requirements", () => {
    const routes = HttpRouter.add(
      "GET",
      "/search",
      Effect.gen(function* () {
        const search = yield* Search;
        expectTypeOf<
          Parameters<typeof search>[0]
        >().toEqualTypeOf<"documents">();
        expectTypeOf<
          Parameters<typeof search>[1]
        >().toEqualTypeOf<"embedding">();
        const result = search("documents", "embedding", {
          vector: [1, 0],
          limit: 10,
          filter: (q) => {
            expectTypeOf<
              Parameters<typeof q.eq>[0]
            >().toEqualTypeOf<"category">();
            expectTypeOf<Parameters<typeof q.eq>[1]>().toEqualTypeOf<string>();
            return q.eq("category", "public");
          },
        });
        expectTypeOf(result).toEqualTypeOf<
          Effect.Effect<Array<{ _id: GenericId<"documents">; _score: number }>>
        >();
        const results = yield* result;
        return yield* HttpServerResponse.json(results);
      }),
    );
    expectTypeOf<typeof routes>().toExtend<
      ConfectHttpRouter.Routes<typeof schema>
    >();
    expectTypeOf<[typeof routes]>().not.toExtend<
      Parameters<typeof ConfectHttpRouter.make<typeof schema>>
    >();
    expectTypeOf<typeof routes>().not.toExtend<
      ConfectHttpRouter.Routes<typeof otherSchema>
    >();
    expectTypeOf<[typeof otherSchema, typeof routes]>().not.toExtend<
      Parameters<typeof ConfectHttpRouter.make<typeof otherSchema>>
    >();
    expectTypeOf<typeof routes>().not.toExtend<
      ConfectHttpRouter.Routes<typeof wrongIndexSchema>
    >();
    ConfectHttpRouter.make(schema, routes);
  });

  it("requires a schema even when routes do not use vector search", () => {
    const routes = HttpRouter.add(
      "GET",
      "/health",
      HttpServerResponse.text("ok"),
    );
    expectTypeOf<[typeof routes]>().not.toExtend<
      Parameters<typeof ConfectHttpRouter.make<typeof schema>>
    >();
    expectTypeOf<
      Parameters<typeof ConfectHttpRouter.make>["length"]
    >().toEqualTypeOf<2>();
    expectTypeOf<typeof routes>().toExtend<
      ConfectHttpRouter.Routes<typeof schema>
    >();
    ConfectHttpRouter.make(otherSchema, routes);
    ConfectHttpRouter.make(schema, routes);
  });

  it("preserves component vector IDs and excludes application services", () => {
    const scope = IdScope.component("@example/search");
    const componentSchema = DatabaseSchema.make(
      {
        documents: Table.make(() =>
          Schema.Struct({ embedding: Schema.Array(Schema.Finite) }),
        ).vectorIndex("embedding", {
          vectorField: "embedding",
          dimensions: 2,
        })("documents", scope),
      },
      { kind: "component", scope },
    );
    type ComponentModel = DataModel.FromSchema<typeof componentSchema>;
    type Services = ConfectHttpRouter.Services<typeof componentSchema>;
    expectTypeOf<Auth.Auth>().not.toExtend<Services>();
    expectTypeOf<StorageReader.StorageReader>().not.toExtend<Services>();
    expectTypeOf<Scheduler.Scheduler>().not.toExtend<Services>();
    expectTypeOf<StorageReader.ForScope<typeof scope>>().toExtend<Services>();
    expectTypeOf<Scheduler.ForScope<typeof scope>>().toExtend<Services>();
    const routes = HttpRouter.add(
      "GET",
      "/search",
      Effect.gen(function* () {
        const search = yield* VectorSearch.VectorSearch<ComponentModel>();
        const matches = yield* search("documents", "embedding", {
          vector: [1, 0],
          limit: 10,
        });
        expectTypeOf<(typeof matches)[number]["_id"]>().toEqualTypeOf<
          ConfectId.GenericId<"documents", typeof scope>
        >();
        return yield* HttpServerResponse.json(matches);
      }),
    );
    expectTypeOf<typeof routes>().not.toExtend<
      ConfectHttpRouter.Routes<typeof schema>
    >();
    ConfectHttpRouter.make(componentSchema, routes);
    ConfectHttpRouter.forSchema(componentSchema)(routes);
    const authenticated = HttpRouter.add(
      "GET",
      "/auth",
      Auth.Auth.pipe(Effect.as(HttpServerResponse.text("unexpected"))),
    );
    expectTypeOf<typeof authenticated>().not.toExtend<
      ConfectHttpRouter.Routes<typeof componentSchema>
    >();
  });

  it("keeps non-HTTP capabilities unavailable with a schema", () => {
    type Services = ConfectHttpRouter.Services<typeof schema>;
    expectTypeOf<VectorSearch.VectorSearch<Model>>().toExtend<Services>();
    expectTypeOf<VectorSearch.VectorSearch<Model>>().not.toExtend<
      ConfectHttpRouter.Services<typeof otherSchema>
    >();
    expectTypeOf<
      DatabaseWriter.DatabaseWriter<typeof schema>
    >().not.toExtend<Services>();
    expectTypeOf<MutationAuth.MutationAuth>().not.toExtend<Services>();
    expectTypeOf<TransactionMetadata.TransactionMetadata>().not.toExtend<Services>();
    expectTypeOf<
      ActionCtx.ActionCtx<DataModel.ToConvex<Model>>
    >().not.toExtend<Services>();
  });

  it("does not evaluate or alter table schemas when constructing a router", () => {
    const fields = vi.fn(() =>
      Schema.Struct({ embedding: Schema.Array(Schema.Finite) }),
    );
    const table = Table.make(fields).vectorIndex("embedding", {
      vectorField: "embedding",
      dimensions: 2,
    })("lazy");
    const tables = { lazy: table };
    const lazySchema = DatabaseSchema.make(tables);
    const routes = HttpRouter.add(
      "GET",
      "/health",
      HttpServerResponse.text("ok"),
    );
    ConfectHttpRouter.make(lazySchema, routes);
    expect(fields).not.toHaveBeenCalled();
    expect(DatabaseSchema.tables(lazySchema)).toBe(tables);
    expect(DatabaseSchema.tables(lazySchema).lazy).toBe(table);
  });
});
