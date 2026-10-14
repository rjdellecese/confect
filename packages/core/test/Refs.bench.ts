import { bench } from "confect-bench-harness";
import * as Schema from "effect/Schema";
import * as FunctionSpec from "@confect/core/FunctionSpec";
import * as GroupSpec from "@confect/core/GroupSpec";
import type * as Ref from "@confect/core/Ref";
import type * as Refs from "@confect/core/Refs";
import * as Spec from "@confect/core/Spec";

const Args = { id: Schema.String };
const Returns = Schema.String;

// --- Small spec: 1 group, 2 functions ---
const SmallGroups = {
  auth: GroupSpec.make()
    .addFunction(
      FunctionSpec.publicQuery({
        name: "login",
        returns: () => Returns,
      }),
    )
    .addFunction(
      FunctionSpec.publicMutation({
        name: "logout",
        returns: () => Returns,
      }),
    ),
};
const SmallSpec = Spec.fromGroups(SmallGroups) as Spec.Spec<{
  readonly auth: GroupSpec.GroupSpec<
    "Convex",
    "auth",
    GroupSpec.Functions<typeof SmallGroups.auth>
  >;
}>;
type SmallSpec = typeof SmallSpec;

// --- Medium spec (original): 4 groups, 12 functions ---
const MediumGroups = {
  users: GroupSpec.make()
    .addFunction(
      FunctionSpec.publicQuery({
        name: "list",
        args: () => Args,
        returns: () => Returns,
      }),
    )
    .addFunction(
      FunctionSpec.internalQuery({
        name: "getById",
        args: () => Args,
        returns: () => Returns,
      }),
    )
    .addFunction(
      FunctionSpec.publicMutation({
        name: "create",
        args: () => Args,
        returns: () => Returns,
      }),
    )
    .addFunction(
      FunctionSpec.internalMutation({
        name: "remove",
        args: () => Args,
        returns: () => Returns,
      }),
    ),
  posts: GroupSpec.make()
    .addFunction(
      FunctionSpec.publicQuery({
        name: "list",
        args: () => Args,
        returns: () => Returns,
      }),
    )
    .addFunction(
      FunctionSpec.publicQuery({
        name: "getById",
        args: () => Args,
        returns: () => Returns,
      }),
    )
    .addFunction(
      FunctionSpec.internalMutation({
        name: "archive",
        args: () => Args,
        returns: () => Returns,
      }),
    ),
  comments: GroupSpec.make()
    .addFunction(
      FunctionSpec.publicQuery({
        name: "list",
        args: () => Args,
        returns: () => Returns,
      }),
    )
    .addFunction(
      FunctionSpec.publicMutation({
        name: "create",
        args: () => Args,
        returns: () => Returns,
      }),
    )
    .addFunction(
      FunctionSpec.internalQuery({
        name: "flagged",
        args: () => Args,
        returns: () => Returns,
      }),
    ),
  analytics: GroupSpec.make()
    .addFunction(
      FunctionSpec.internalQuery({
        name: "aggregate",
        args: () => Args,
        returns: () => Returns,
      }),
    )
    .addFunction(
      FunctionSpec.internalAction({
        name: "exportData",
        args: () => Args,
        returns: () => Returns,
      }),
    ),
};
const MediumSpec = Spec.fromGroups(MediumGroups) as Spec.Spec<{
  readonly users: GroupSpec.GroupSpec<
    "Convex",
    "users",
    GroupSpec.Functions<typeof MediumGroups.users>
  >;
  readonly posts: GroupSpec.GroupSpec<
    "Convex",
    "posts",
    GroupSpec.Functions<typeof MediumGroups.posts>
  >;
  readonly comments: GroupSpec.GroupSpec<
    "Convex",
    "comments",
    GroupSpec.Functions<typeof MediumGroups.comments>
  >;
  readonly analytics: GroupSpec.GroupSpec<
    "Convex",
    "analytics",
    GroupSpec.Functions<typeof MediumGroups.analytics>
  >;
}>;

type MediumSpec = typeof MediumSpec;

// --- Large spec: 8 groups, 28 functions ---
const LargeGroups = {
  users: GroupSpec.make()
    .addFunction(
      FunctionSpec.publicQuery({
        name: "list",
        args: () => Args,
        returns: () => Returns,
      }),
    )
    .addFunction(
      FunctionSpec.internalQuery({
        name: "getById",
        args: () => Args,
        returns: () => Returns,
      }),
    )
    .addFunction(
      FunctionSpec.publicMutation({
        name: "create",
        args: () => Args,
        returns: () => Returns,
      }),
    )
    .addFunction(
      FunctionSpec.internalMutation({
        name: "remove",
        args: () => Args,
        returns: () => Returns,
      }),
    ),
  posts: GroupSpec.make()
    .addFunction(
      FunctionSpec.publicQuery({
        name: "list",
        args: () => Args,
        returns: () => Returns,
      }),
    )
    .addFunction(
      FunctionSpec.publicQuery({
        name: "getById",
        args: () => Args,
        returns: () => Returns,
      }),
    )
    .addFunction(
      FunctionSpec.internalMutation({
        name: "archive",
        args: () => Args,
        returns: () => Returns,
      }),
    ),
  comments: GroupSpec.make()
    .addFunction(
      FunctionSpec.publicQuery({
        name: "list",
        args: () => Args,
        returns: () => Returns,
      }),
    )
    .addFunction(
      FunctionSpec.publicMutation({
        name: "create",
        args: () => Args,
        returns: () => Returns,
      }),
    )
    .addFunction(
      FunctionSpec.internalQuery({
        name: "flagged",
        args: () => Args,
        returns: () => Returns,
      }),
    ),
  analytics: GroupSpec.make()
    .addFunction(
      FunctionSpec.internalQuery({
        name: "aggregate",
        args: () => Args,
        returns: () => Returns,
      }),
    )
    .addFunction(
      FunctionSpec.internalAction({
        name: "exportData",
        args: () => Args,
        returns: () => Returns,
      }),
    ),
  products: GroupSpec.make()
    .addFunction(
      FunctionSpec.publicQuery({
        name: "list",
        args: () => Args,
        returns: () => Returns,
      }),
    )
    .addFunction(
      FunctionSpec.publicQuery({
        name: "getById",
        args: () => Args,
        returns: () => Returns,
      }),
    )
    .addFunction(
      FunctionSpec.publicMutation({
        name: "create",
        args: () => Args,
        returns: () => Returns,
      }),
    )
    .addFunction(
      FunctionSpec.internalMutation({
        name: "archive",
        args: () => Args,
        returns: () => Returns,
      }),
    ),
  orders: GroupSpec.make()
    .addFunction(
      FunctionSpec.publicQuery({
        name: "list",
        args: () => Args,
        returns: () => Returns,
      }),
    )
    .addFunction(
      FunctionSpec.publicQuery({
        name: "getById",
        args: () => Args,
        returns: () => Returns,
      }),
    )
    .addFunction(
      FunctionSpec.publicMutation({
        name: "create",
        args: () => Args,
        returns: () => Returns,
      }),
    )
    .addFunction(
      FunctionSpec.internalMutation({
        name: "cancel",
        args: () => Args,
        returns: () => Returns,
      }),
    ),
  notifications: GroupSpec.make()
    .addFunction(
      FunctionSpec.publicQuery({
        name: "list",
        args: () => Args,
        returns: () => Returns,
      }),
    )
    .addFunction(
      FunctionSpec.publicMutation({
        name: "markRead",
        args: () => Args,
        returns: () => Returns,
      }),
    )
    .addFunction(
      FunctionSpec.internalQuery({
        name: "flagged",
        args: () => Args,
        returns: () => Returns,
      }),
    ),
  settings: GroupSpec.make()
    .addFunction(
      FunctionSpec.publicQuery({
        name: "get",
        args: () => Args,
        returns: () => Returns,
      }),
    )
    .addFunction(
      FunctionSpec.publicMutation({
        name: "update",
        args: () => Args,
        returns: () => Returns,
      }),
    )
    .addFunction(
      FunctionSpec.internalAction({
        name: "reset",
        args: () => Args,
        returns: () => Returns,
      }),
    ),
};
const LargeSpec = Spec.fromGroups(LargeGroups) as Spec.Spec<{
  readonly users: GroupSpec.GroupSpec<
    "Convex",
    "users",
    GroupSpec.Functions<typeof LargeGroups.users>
  >;
  readonly posts: GroupSpec.GroupSpec<
    "Convex",
    "posts",
    GroupSpec.Functions<typeof LargeGroups.posts>
  >;
  readonly comments: GroupSpec.GroupSpec<
    "Convex",
    "comments",
    GroupSpec.Functions<typeof LargeGroups.comments>
  >;
  readonly analytics: GroupSpec.GroupSpec<
    "Convex",
    "analytics",
    GroupSpec.Functions<typeof LargeGroups.analytics>
  >;
  readonly products: GroupSpec.GroupSpec<
    "Convex",
    "products",
    GroupSpec.Functions<typeof LargeGroups.products>
  >;
  readonly orders: GroupSpec.GroupSpec<
    "Convex",
    "orders",
    GroupSpec.Functions<typeof LargeGroups.orders>
  >;
  readonly notifications: GroupSpec.GroupSpec<
    "Convex",
    "notifications",
    GroupSpec.Functions<typeof LargeGroups.notifications>
  >;
  readonly settings: GroupSpec.GroupSpec<
    "Convex",
    "settings",
    GroupSpec.Functions<typeof LargeGroups.settings>
  >;
}>;

type LargeSpec = typeof LargeSpec;

// Baseline expression: force the Refs module types to load so module-level
// instantiations are not counted in individual benchmarks.
void ({} as Refs.Refs<any>);

bench("Refs<Spec> (unfiltered)", () => {
  return {} as Refs.Refs<MediumSpec>;
}).types([2274, "instantiations"]);

bench("Refs<Spec, AnyPublic> (public-filtered)", () => {
  return {} as Refs.Refs<MediumSpec, Ref.AnyPublic>;
}).types([2351, "instantiations"]);

bench("Refs<Spec, AnyInternal> (internal-filtered)", () => {
  return {} as Refs.Refs<MediumSpec, Ref.AnyInternal>;
}).types([2335, "instantiations"]);

// Laziness: accessing one leaf should be cheaper than accessing all leaves.
// If the type were eagerly evaluated, both benchmarks would have the same
// instantiation count. The gap between them proves lazy evaluation.

bench("resolve one leaf", () => {
  return {} as Refs.Refs<MediumSpec, Ref.AnyPublic>["users"]["list"];
}).types([2654, "instantiations"]);

bench("resolve all leaves", () => {
  return [
    {} as Refs.Refs<MediumSpec, Ref.AnyPublic>["users"]["list"],
    {} as Refs.Refs<MediumSpec, Ref.AnyPublic>["users"]["create"],
    {} as Refs.Refs<MediumSpec, Ref.AnyPublic>["posts"]["list"],
    {} as Refs.Refs<MediumSpec, Ref.AnyPublic>["posts"]["getById"],
    {} as Refs.Refs<MediumSpec, Ref.AnyPublic>["comments"]["list"],
    {} as Refs.Refs<MediumSpec, Ref.AnyPublic>["comments"]["create"],
  ];
}).types([3279, "instantiations"]);

// --- Small spec (1 group, 2 functions) ---

bench("small: Refs (unfiltered)", () => {
  return {} as Refs.Refs<SmallSpec>;
}).types([884, "instantiations"]);

bench("small: Refs (public-filtered)", () => {
  return {} as Refs.Refs<SmallSpec, Ref.AnyPublic>;
}).types([909, "instantiations"]);

bench("small: Refs (internal-filtered)", () => {
  return {} as Refs.Refs<SmallSpec, Ref.AnyInternal>;
}).types([950, "instantiations"]);

bench("small: Refs (resolve one leaf)", () => {
  return {} as Refs.Refs<SmallSpec, Ref.AnyPublic>["auth"]["login"];
}).types([1095, "instantiations"]);

bench("small: Refs (resolve all leaves)", () => {
  return [
    {} as Refs.Refs<SmallSpec, Ref.AnyPublic>["auth"]["login"],
    {} as Refs.Refs<SmallSpec, Ref.AnyPublic>["auth"]["logout"],
  ];
}).types([1194, "instantiations"]);

// --- Large spec (8 groups, 28 functions) ---

bench("large: Refs (unfiltered)", () => {
  return {} as Refs.Refs<LargeSpec>;
}).types([3913, "instantiations"]);

bench("large: Refs (public-filtered)", () => {
  return {} as Refs.Refs<LargeSpec, Ref.AnyPublic>;
}).types([3991, "instantiations"]);

bench("large: Refs (internal-filtered)", () => {
  return {} as Refs.Refs<LargeSpec, Ref.AnyInternal>;
}).types([3969, "instantiations"]);

bench("large: Refs (resolve one leaf)", () => {
  return {} as Refs.Refs<LargeSpec, Ref.AnyPublic>["users"]["list"];
}).types([4320, "instantiations"]);

bench("large: Refs (resolve all leaves)", () => {
  type PublicRefs = Refs.Refs<LargeSpec, Ref.AnyPublic>;
  return [
    {} as PublicRefs["users"]["list"],
    {} as PublicRefs["users"]["create"],
    {} as PublicRefs["posts"]["list"],
    {} as PublicRefs["posts"]["getById"],
    {} as PublicRefs["comments"]["list"],
    {} as PublicRefs["comments"]["create"],
    {} as PublicRefs["products"]["list"],
    {} as PublicRefs["products"]["getById"],
    {} as PublicRefs["products"]["create"],
    {} as PublicRefs["orders"]["list"],
    {} as PublicRefs["orders"]["getById"],
    {} as PublicRefs["orders"]["create"],
    {} as PublicRefs["notifications"]["list"],
    {} as PublicRefs["notifications"]["markRead"],
    {} as PublicRefs["settings"]["get"],
    {} as PublicRefs["settings"]["update"],
  ];
}).types([6280, "instantiations"]);
