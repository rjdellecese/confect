// Single source of truth for the synthetic workload's schema shapes.
//
// For each complexity level we emit two notations of the SAME logical shape:
//   - `effect`: an Effect `Schema.*` expression (used by the Confect app)
//   - `convex`: the equivalent Convex `v.*` validator (used by the vanilla app)
//
// Every shape has a top-level `text: string` field so tables can declare a
// `by_text` index in both frameworks. The shapes are deliberately identical in
// structure so any measured difference is attributable to the framework, not to
// a different logical workload.

export const COMPLEXITIES = ["small", "medium", "large"];

const EFFECT = {
  small: `Schema.Struct({
  text: Schema.String,
})`,

  medium: `Schema.Struct({
  text: Schema.String,
  tag: Schema.optional(Schema.String),
  author: Schema.optional(
    Schema.Struct({
      role: Schema.Literal("admin", "user"),
      name: Schema.String,
    }),
  ),
  embedding: Schema.optional(Schema.Array(Schema.Number)),
})`,

  large: `Schema.Struct({
  text: Schema.String,
  count: Schema.Number,
  active: Schema.Boolean,
  tag: Schema.optional(Schema.String),
  kind: Schema.Literal("a", "b", "c", "d"),
  tags: Schema.Array(Schema.String),
  scores: Schema.Array(Schema.Number),
  author: Schema.Struct({
    role: Schema.Literal("admin", "user", "guest"),
    name: Schema.String,
    contact: Schema.Struct({
      email: Schema.String,
      address: Schema.Struct({
        city: Schema.String,
        zip: Schema.String,
      }),
    }),
  }),
  meta: Schema.optional(
    Schema.Struct({
      created: Schema.Number,
      labels: Schema.Array(
        Schema.Struct({ key: Schema.String, value: Schema.String }),
      ),
    }),
  ),
  status: Schema.Union(
    Schema.Literal("open"),
    Schema.Literal("closed"),
    Schema.Struct({ pending: Schema.Boolean }),
    Schema.Null,
  ),
  ratings: Schema.Array(
    Schema.Struct({ stars: Schema.Number, note: Schema.optional(Schema.String) }),
  ),
  flags: Schema.optional(Schema.Array(Schema.Boolean)),
})`,
};

const CONVEX = {
  small: `v.object({
  text: v.string(),
})`,

  medium: `v.object({
  text: v.string(),
  tag: v.optional(v.string()),
  author: v.optional(
    v.object({
      role: v.union(v.literal("admin"), v.literal("user")),
      name: v.string(),
    }),
  ),
  embedding: v.optional(v.array(v.number())),
})`,

  large: `v.object({
  text: v.string(),
  count: v.number(),
  active: v.boolean(),
  tag: v.optional(v.string()),
  kind: v.union(v.literal("a"), v.literal("b"), v.literal("c"), v.literal("d")),
  tags: v.array(v.string()),
  scores: v.array(v.number()),
  author: v.object({
    role: v.union(v.literal("admin"), v.literal("user"), v.literal("guest")),
    name: v.string(),
    contact: v.object({
      email: v.string(),
      address: v.object({
        city: v.string(),
        zip: v.string(),
      }),
    }),
  }),
  meta: v.optional(
    v.object({
      created: v.number(),
      labels: v.array(v.object({ key: v.string(), value: v.string() })),
    }),
  ),
  status: v.union(
    v.literal("open"),
    v.literal("closed"),
    v.object({ pending: v.boolean() }),
    v.null(),
  ),
  ratings: v.array(
    v.object({ stars: v.number(), note: v.optional(v.string()) }),
  ),
  flags: v.optional(v.array(v.boolean())),
})`,
};

export const effectBody = (complexity) => EFFECT[complexity];
export const convexBody = (complexity) => CONVEX[complexity];
