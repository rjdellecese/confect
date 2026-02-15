import { bench } from "@ark/attest";
import { Schema } from "effect";
import * as FunctionSpec from "../src/FunctionSpec";
import * as GroupSpec from "../src/GroupSpec";
import type * as Ref from "../src/Ref";
import type * as Refs from "../src/Refs";
import * as Spec from "../src/Spec";

const Args = Schema.Struct({});
const Returns = Schema.String;

// --- Small spec: 1 group, 2 functions ---
const SmallSpec = Spec.make().add(
  GroupSpec.make("auth")
    .addFunction(
      FunctionSpec.publicQuery({ name: "login", args: Args, returns: Returns }),
    )
    .addFunction(
      FunctionSpec.publicMutation({
        name: "logout",
        args: Args,
        returns: Returns,
      }),
    ),
);
type SmallSpec = typeof SmallSpec;

// --- Medium spec (original): 4 groups, 12 functions ---
const MediumSpec = Spec.make()
  .add(
    GroupSpec.make("users")
      .addFunction(
        FunctionSpec.publicQuery({
          name: "list",
          args: Args,
          returns: Returns,
        }),
      )
      .addFunction(
        FunctionSpec.internalQuery({
          name: "getById",
          args: Args,
          returns: Returns,
        }),
      )
      .addFunction(
        FunctionSpec.publicMutation({
          name: "create",
          args: Args,
          returns: Returns,
        }),
      )
      .addFunction(
        FunctionSpec.internalMutation({
          name: "remove",
          args: Args,
          returns: Returns,
        }),
      ),
  )
  .add(
    GroupSpec.make("posts")
      .addFunction(
        FunctionSpec.publicQuery({
          name: "list",
          args: Args,
          returns: Returns,
        }),
      )
      .addFunction(
        FunctionSpec.publicQuery({
          name: "getById",
          args: Args,
          returns: Returns,
        }),
      )
      .addFunction(
        FunctionSpec.internalMutation({
          name: "archive",
          args: Args,
          returns: Returns,
        }),
      ),
  )
  .add(
    GroupSpec.make("comments")
      .addFunction(
        FunctionSpec.publicQuery({
          name: "list",
          args: Args,
          returns: Returns,
        }),
      )
      .addFunction(
        FunctionSpec.publicMutation({
          name: "create",
          args: Args,
          returns: Returns,
        }),
      )
      .addFunction(
        FunctionSpec.internalQuery({
          name: "flagged",
          args: Args,
          returns: Returns,
        }),
      ),
  )
  .add(
    GroupSpec.make("analytics")
      .addFunction(
        FunctionSpec.internalQuery({
          name: "aggregate",
          args: Args,
          returns: Returns,
        }),
      )
      .addFunction(
        FunctionSpec.internalAction({
          name: "exportData",
          args: Args,
          returns: Returns,
        }),
      ),
  );

type MediumSpec = typeof MediumSpec;

// --- Large spec: 8 groups, 28 functions ---
const LargeSpec = Spec.make()
  .add(
    GroupSpec.make("users")
      .addFunction(
        FunctionSpec.publicQuery({
          name: "list",
          args: Args,
          returns: Returns,
        }),
      )
      .addFunction(
        FunctionSpec.internalQuery({
          name: "getById",
          args: Args,
          returns: Returns,
        }),
      )
      .addFunction(
        FunctionSpec.publicMutation({
          name: "create",
          args: Args,
          returns: Returns,
        }),
      )
      .addFunction(
        FunctionSpec.internalMutation({
          name: "remove",
          args: Args,
          returns: Returns,
        }),
      ),
  )
  .add(
    GroupSpec.make("posts")
      .addFunction(
        FunctionSpec.publicQuery({
          name: "list",
          args: Args,
          returns: Returns,
        }),
      )
      .addFunction(
        FunctionSpec.publicQuery({
          name: "getById",
          args: Args,
          returns: Returns,
        }),
      )
      .addFunction(
        FunctionSpec.internalMutation({
          name: "archive",
          args: Args,
          returns: Returns,
        }),
      ),
  )
  .add(
    GroupSpec.make("comments")
      .addFunction(
        FunctionSpec.publicQuery({
          name: "list",
          args: Args,
          returns: Returns,
        }),
      )
      .addFunction(
        FunctionSpec.publicMutation({
          name: "create",
          args: Args,
          returns: Returns,
        }),
      )
      .addFunction(
        FunctionSpec.internalQuery({
          name: "flagged",
          args: Args,
          returns: Returns,
        }),
      ),
  )
  .add(
    GroupSpec.make("analytics")
      .addFunction(
        FunctionSpec.internalQuery({
          name: "aggregate",
          args: Args,
          returns: Returns,
        }),
      )
      .addFunction(
        FunctionSpec.internalAction({
          name: "exportData",
          args: Args,
          returns: Returns,
        }),
      ),
  )
  .add(
    GroupSpec.make("products")
      .addFunction(
        FunctionSpec.publicQuery({
          name: "list",
          args: Args,
          returns: Returns,
        }),
      )
      .addFunction(
        FunctionSpec.publicQuery({
          name: "getById",
          args: Args,
          returns: Returns,
        }),
      )
      .addFunction(
        FunctionSpec.publicMutation({
          name: "create",
          args: Args,
          returns: Returns,
        }),
      )
      .addFunction(
        FunctionSpec.internalMutation({
          name: "archive",
          args: Args,
          returns: Returns,
        }),
      ),
  )
  .add(
    GroupSpec.make("orders")
      .addFunction(
        FunctionSpec.publicQuery({
          name: "list",
          args: Args,
          returns: Returns,
        }),
      )
      .addFunction(
        FunctionSpec.publicQuery({
          name: "getById",
          args: Args,
          returns: Returns,
        }),
      )
      .addFunction(
        FunctionSpec.publicMutation({
          name: "create",
          args: Args,
          returns: Returns,
        }),
      )
      .addFunction(
        FunctionSpec.internalMutation({
          name: "cancel",
          args: Args,
          returns: Returns,
        }),
      ),
  )
  .add(
    GroupSpec.make("notifications")
      .addFunction(
        FunctionSpec.publicQuery({
          name: "list",
          args: Args,
          returns: Returns,
        }),
      )
      .addFunction(
        FunctionSpec.publicMutation({
          name: "markRead",
          args: Args,
          returns: Returns,
        }),
      )
      .addFunction(
        FunctionSpec.internalQuery({
          name: "flagged",
          args: Args,
          returns: Returns,
        }),
      ),
  )
  .add(
    GroupSpec.make("settings")
      .addFunction(
        FunctionSpec.publicQuery({ name: "get", args: Args, returns: Returns }),
      )
      .addFunction(
        FunctionSpec.publicMutation({
          name: "update",
          args: Args,
          returns: Returns,
        }),
      )
      .addFunction(
        FunctionSpec.internalAction({
          name: "reset",
          args: Args,
          returns: Returns,
        }),
      ),
  );

type LargeSpec = typeof LargeSpec;

// Baseline expression: force the Refs module types to load so module-level
// instantiations are not counted in individual benchmarks.
void ({} as Refs.Refs<any>);

bench("Refs<Spec> (unfiltered)", () => {
  return {} as Refs.Refs<MediumSpec>;
}).types([3632, "instantiations"]);

bench("Refs<Spec, AnyPublic> (public-filtered)", () => {
  return {} as Refs.Refs<MediumSpec, never, Ref.AnyPublic>;
}).types([3363, "instantiations"]);

bench("Refs<Spec, AnyInternal> (internal-filtered)", () => {
  return {} as Refs.Refs<MediumSpec, never, Ref.AnyInternal>;
}).types([3469, "instantiations"]);

// Laziness: accessing one leaf should be cheaper than accessing all leaves.
// If the type were eagerly evaluated, both benchmarks would have the same
// instantiation count. The gap between them proves lazy evaluation.

bench("resolve one leaf", () => {
  return {} as Refs.Refs<MediumSpec, never, Ref.AnyPublic>["users"]["list"];
}).types([3854, "instantiations"]);

bench("resolve all leaves", () => {
  return [
    {} as Refs.Refs<MediumSpec, never, Ref.AnyPublic>["users"]["list"],
    {} as Refs.Refs<MediumSpec, never, Ref.AnyPublic>["users"]["create"],
    {} as Refs.Refs<MediumSpec, never, Ref.AnyPublic>["posts"]["list"],
    {} as Refs.Refs<MediumSpec, never, Ref.AnyPublic>["posts"]["getById"],
    {} as Refs.Refs<MediumSpec, never, Ref.AnyPublic>["comments"]["list"],
    {} as Refs.Refs<MediumSpec, never, Ref.AnyPublic>["comments"]["create"],
  ];
}).types([4623, "instantiations"]);

// --- Small spec (1 group, 2 functions) ---

bench("small: Refs (unfiltered)", () => {
  return {} as Refs.Refs<SmallSpec>;
}).types([1088, "instantiations"]);

bench("small: Refs (public-filtered)", () => {
  return {} as Refs.Refs<SmallSpec, never, Ref.AnyPublic>;
}).types([1088, "instantiations"]);

bench("small: Refs (internal-filtered)", () => {
  return {} as Refs.Refs<SmallSpec, never, Ref.AnyInternal>;
}).types([1006, "instantiations"]);

bench("small: Refs (resolve one leaf)", () => {
  return {} as Refs.Refs<SmallSpec, never, Ref.AnyPublic>["auth"]["login"];
}).types([1373, "instantiations"]);

bench("small: Refs (resolve all leaves)", () => {
  return [
    {} as Refs.Refs<SmallSpec, never, Ref.AnyPublic>["auth"]["login"],
    {} as Refs.Refs<SmallSpec, never, Ref.AnyPublic>["auth"]["logout"],
  ];
}).types([1423, "instantiations"]);

// --- Large spec (8 groups, 28 functions) ---

bench("large: Refs (unfiltered)", () => {
  return {} as Refs.Refs<LargeSpec>;
}).types([6860, "instantiations"]);

bench("large: Refs (public-filtered)", () => {
  return {} as Refs.Refs<LargeSpec, never, Ref.AnyPublic>;
}).types([6437, "instantiations"]);

bench("large: Refs (internal-filtered)", () => {
  return {} as Refs.Refs<LargeSpec, never, Ref.AnyInternal>;
}).types([6503, "instantiations"]);

bench("large: Refs (resolve one leaf)", () => {
  return {} as Refs.Refs<LargeSpec, never, Ref.AnyPublic>["users"]["list"];
}).types([6954, "instantiations"]);

bench("large: Refs (resolve all leaves)", () => {
  type PublicRefs = Refs.Refs<LargeSpec, never, Ref.AnyPublic>;
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
}).types([9460, "instantiations"]);
