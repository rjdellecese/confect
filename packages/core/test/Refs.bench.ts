import { bench } from "@ark/attest";
import * as Schema from "effect/Schema";
import * as FunctionSpec from "@confect/core/FunctionSpec";
import * as GroupSpec from "@confect/core/GroupSpec";
import type * as Ref from "@confect/core/Ref";
import type * as Refs from "@confect/core/Refs";
import * as Spec from "@confect/core/Spec";

const Args = Schema.Struct({});
const Returns = Schema.String;

// --- Small spec: 1 group, 2 functions ---
const SmallSpec = Spec.make().add(
  GroupSpec.makeAt("auth")
    .addFunction(
      FunctionSpec.publicQuery({
        name: "login",
        args: () => Args,
        returns: () => Returns,
      }),
    )
    .addFunction(
      FunctionSpec.publicMutation({
        name: "logout",
        args: () => Args,
        returns: () => Returns,
      }),
    ),
);
type SmallSpec = typeof SmallSpec;

// --- Medium spec (original): 4 groups, 12 functions ---
const MediumSpec = Spec.make()
  .add(
    GroupSpec.makeAt("users")
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
  )
  .add(
    GroupSpec.makeAt("posts")
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
  )
  .add(
    GroupSpec.makeAt("comments")
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
  )
  .add(
    GroupSpec.makeAt("analytics")
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
  );

type MediumSpec = typeof MediumSpec;

// --- Large spec: 8 groups, 28 functions ---
const LargeSpec = Spec.make()
  .add(
    GroupSpec.makeAt("users")
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
  )
  .add(
    GroupSpec.makeAt("posts")
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
  )
  .add(
    GroupSpec.makeAt("comments")
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
  )
  .add(
    GroupSpec.makeAt("analytics")
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
  )
  .add(
    GroupSpec.makeAt("products")
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
  )
  .add(
    GroupSpec.makeAt("orders")
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
  )
  .add(
    GroupSpec.makeAt("notifications")
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
  )
  .add(
    GroupSpec.makeAt("settings")
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
  );

type LargeSpec = typeof LargeSpec;

// Baseline expression: force the Refs module types to load so module-level
// instantiations are not counted in individual benchmarks.
void ({} as Refs.Refs<any>);

bench("Refs<Spec> (unfiltered)", () => {
  return {} as Refs.Refs<MediumSpec>;
}).types([2484, "instantiations"]);

bench("Refs<Spec, AnyPublic> (public-filtered)", () => {
  return {} as Refs.Refs<MediumSpec, Ref.AnyPublic>;
}).types([2401, "instantiations"]);

bench("Refs<Spec, AnyInternal> (internal-filtered)", () => {
  return {} as Refs.Refs<MediumSpec, Ref.AnyInternal>;
}).types([2429, "instantiations"]);

// Laziness: accessing one leaf should be cheaper than accessing all leaves.
// If the type were eagerly evaluated, both benchmarks would have the same
// instantiation count. The gap between them proves lazy evaluation.

bench("resolve one leaf", () => {
  return {} as Refs.Refs<MediumSpec, Ref.AnyPublic>["users"]["list"];
}).types([2643, "instantiations"]);

bench("resolve all leaves", () => {
  return [
    {} as Refs.Refs<MediumSpec, Ref.AnyPublic>["users"]["list"],
    {} as Refs.Refs<MediumSpec, Ref.AnyPublic>["users"]["create"],
    {} as Refs.Refs<MediumSpec, Ref.AnyPublic>["posts"]["list"],
    {} as Refs.Refs<MediumSpec, Ref.AnyPublic>["posts"]["getById"],
    {} as Refs.Refs<MediumSpec, Ref.AnyPublic>["comments"]["list"],
    {} as Refs.Refs<MediumSpec, Ref.AnyPublic>["comments"]["create"],
  ];
}).types([3043, "instantiations"]);

// --- Small spec (1 group, 2 functions) ---

bench("small: Refs (unfiltered)", () => {
  return {} as Refs.Refs<SmallSpec>;
}).types([994, "instantiations"]);

bench("small: Refs (public-filtered)", () => {
  return {} as Refs.Refs<SmallSpec, Ref.AnyPublic>;
}).types([994, "instantiations"]);

bench("small: Refs (internal-filtered)", () => {
  return {} as Refs.Refs<SmallSpec, Ref.AnyInternal>;
}).types([970, "instantiations"]);

bench("small: Refs (resolve one leaf)", () => {
  return {} as Refs.Refs<SmallSpec, Ref.AnyPublic>["auth"]["login"];
}).types([1200, "instantiations"]);

bench("small: Refs (resolve all leaves)", () => {
  return [
    {} as Refs.Refs<SmallSpec, Ref.AnyPublic>["auth"]["login"],
    {} as Refs.Refs<SmallSpec, Ref.AnyPublic>["auth"]["logout"],
  ];
}).types([1282, "instantiations"]);

// --- Large spec (8 groups, 28 functions) ---

bench("large: Refs (unfiltered)", () => {
  return {} as Refs.Refs<LargeSpec>;
}).types([4492, "instantiations"]);

bench("large: Refs (public-filtered)", () => {
  return {} as Refs.Refs<LargeSpec, Ref.AnyPublic>;
}).types([4351, "instantiations"]);

bench("large: Refs (internal-filtered)", () => {
  return {} as Refs.Refs<LargeSpec, Ref.AnyInternal>;
}).types([4367, "instantiations"]);

bench("large: Refs (resolve one leaf)", () => {
  return {} as Refs.Refs<LargeSpec, Ref.AnyPublic>["users"]["list"];
}).types([4619, "instantiations"]);

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
}).types([5911, "instantiations"]);
