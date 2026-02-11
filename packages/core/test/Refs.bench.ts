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
      FunctionSpec.query({ name: "login", args: Args, returns: Returns }),
    )
    .addFunction(
      FunctionSpec.mutation({ name: "logout", args: Args, returns: Returns }),
    ),
);
type SmallSpec = typeof SmallSpec;

// --- Medium spec (original): 4 groups, 12 functions ---
const MediumSpec = Spec.make()
  .add(
    GroupSpec.make("users")
      .addFunction(
        FunctionSpec.query({ name: "list", args: Args, returns: Returns }),
      )
      .addFunction(
        FunctionSpec.internalQuery({
          name: "getById",
          args: Args,
          returns: Returns,
        }),
      )
      .addFunction(
        FunctionSpec.mutation({ name: "create", args: Args, returns: Returns }),
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
        FunctionSpec.query({ name: "list", args: Args, returns: Returns }),
      )
      .addFunction(
        FunctionSpec.query({ name: "getById", args: Args, returns: Returns }),
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
        FunctionSpec.query({ name: "list", args: Args, returns: Returns }),
      )
      .addFunction(
        FunctionSpec.mutation({ name: "create", args: Args, returns: Returns }),
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
        FunctionSpec.query({ name: "list", args: Args, returns: Returns }),
      )
      .addFunction(
        FunctionSpec.internalQuery({
          name: "getById",
          args: Args,
          returns: Returns,
        }),
      )
      .addFunction(
        FunctionSpec.mutation({ name: "create", args: Args, returns: Returns }),
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
        FunctionSpec.query({ name: "list", args: Args, returns: Returns }),
      )
      .addFunction(
        FunctionSpec.query({ name: "getById", args: Args, returns: Returns }),
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
        FunctionSpec.query({ name: "list", args: Args, returns: Returns }),
      )
      .addFunction(
        FunctionSpec.mutation({ name: "create", args: Args, returns: Returns }),
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
        FunctionSpec.query({ name: "list", args: Args, returns: Returns }),
      )
      .addFunction(
        FunctionSpec.query({ name: "getById", args: Args, returns: Returns }),
      )
      .addFunction(
        FunctionSpec.mutation({ name: "create", args: Args, returns: Returns }),
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
        FunctionSpec.query({ name: "list", args: Args, returns: Returns }),
      )
      .addFunction(
        FunctionSpec.query({ name: "getById", args: Args, returns: Returns }),
      )
      .addFunction(
        FunctionSpec.mutation({ name: "create", args: Args, returns: Returns }),
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
        FunctionSpec.query({ name: "list", args: Args, returns: Returns }),
      )
      .addFunction(
        FunctionSpec.mutation({
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
        FunctionSpec.query({ name: "get", args: Args, returns: Returns }),
      )
      .addFunction(
        FunctionSpec.mutation({ name: "update", args: Args, returns: Returns }),
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
}).types([2113, "instantiations"]);

bench("Refs<Spec, AnyPublic> (public-filtered)", () => {
  return {} as Refs.Refs<MediumSpec, Ref.AnyPublic>;
}).types([2032, "instantiations"]);

bench("Refs<Spec, AnyInternal> (internal-filtered)", () => {
  return {} as Refs.Refs<MediumSpec, Ref.AnyInternal>;
}).types([2058, "instantiations"]);

// Laziness: accessing one leaf should be cheaper than accessing all leaves.
// If the type were eagerly evaluated, both benchmarks would have the same
// instantiation count. The gap between them proves lazy evaluation.

bench("resolve one leaf", () => {
  return {} as Refs.Refs<MediumSpec, Ref.AnyPublic>["users"]["list"];
}).types([2143, "instantiations"]);

bench("resolve all leaves", () => {
  return [
    {} as Refs.Refs<MediumSpec, Ref.AnyPublic>["users"]["list"],
    {} as Refs.Refs<MediumSpec, Ref.AnyPublic>["users"]["create"],
    {} as Refs.Refs<MediumSpec, Ref.AnyPublic>["posts"]["list"],
    {} as Refs.Refs<MediumSpec, Ref.AnyPublic>["posts"]["getById"],
    {} as Refs.Refs<MediumSpec, Ref.AnyPublic>["comments"]["list"],
    {} as Refs.Refs<MediumSpec, Ref.AnyPublic>["comments"]["create"],
  ];
}).types([2457, "instantiations"]);

// --- Small spec (1 group, 2 functions) ---

bench("small: Refs (unfiltered)", () => {
  return {} as Refs.Refs<SmallSpec>;
}).types([655, "instantiations"]);

bench("small: Refs (public-filtered)", () => {
  return {} as Refs.Refs<SmallSpec, Ref.AnyPublic>;
}).types([655, "instantiations"]);

bench("small: Refs (internal-filtered)", () => {
  return {} as Refs.Refs<SmallSpec, Ref.AnyInternal>;
}).types([632, "instantiations"]);

bench("small: Refs (resolve one leaf)", () => {
  return {} as Refs.Refs<SmallSpec, Ref.AnyPublic>["auth"]["login"];
}).types([730, "instantiations"]);

bench("small: Refs (resolve all leaves)", () => {
  return [
    {} as Refs.Refs<SmallSpec, Ref.AnyPublic>["auth"]["login"],
    {} as Refs.Refs<SmallSpec, Ref.AnyPublic>["auth"]["logout"],
  ];
}).types([770, "instantiations"]);

// --- Large spec (8 groups, 28 functions) ---

bench("large: Refs (unfiltered)", () => {
  return {} as Refs.Refs<LargeSpec>;
}).types([4082, "instantiations"]);

bench("large: Refs (public-filtered)", () => {
  return {} as Refs.Refs<LargeSpec, Ref.AnyPublic>;
}).types([3941, "instantiations"]);

bench("large: Refs (internal-filtered)", () => {
  return {} as Refs.Refs<LargeSpec, Ref.AnyInternal>;
}).types([3956, "instantiations"]);

bench("large: Refs (resolve one leaf)", () => {
  return {} as Refs.Refs<LargeSpec, Ref.AnyPublic>["users"]["list"];
}).types([4078, "instantiations"]);

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
}).types([5156, "instantiations"]);
