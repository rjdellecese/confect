import type { Schema, Types } from "effect";
import { pipe, Record } from "effect";
import type * as FunctionSpec from "./FunctionSpec";
import type * as GroupSpec from "./GroupSpec";
import type * as Spec from "./Spec";

export type Refs<Spec_ extends Spec.AnyWithProps> = Types.Simplify<
  Helper<Spec.Groups<Spec_>>
>;

type Helper<Groups extends GroupSpec.AnyWithProps> = {
  [GroupName in GroupSpec.Name<Groups>]: GroupSpec.WithName<
    Groups,
    GroupName
  > extends infer Group extends GroupSpec.AnyWithProps
    ? GroupSpec.Groups<Group> extends infer SubGroups extends
        GroupSpec.AnyWithProps
      ? Types.Simplify<
          Helper<SubGroups> & {
            [FunctionName in FunctionSpec.Name<
              GroupSpec.Functions<Group>
            >]: FunctionSpec.WithName<
              GroupSpec.Functions<Group>,
              FunctionName
            > extends infer Function extends FunctionSpec.AnyWithProps
              ? Ref<
                  FunctionSpec.GetFunctionType<Function>,
                  FunctionSpec.GetFunctionVisibility<Function>,
                  FunctionSpec.Args<Function>,
                  FunctionSpec.Returns<Function>
                >
              : never;
          }
        >
      : never
    : never;
};

type FilterRefs<Refs_, Predicate> = Types.Simplify<{
  [K in keyof Refs_ as Refs_[K] extends Predicate
    ? K
    : Refs_[K] extends Any
      ? never
      : FilterRefs<Refs_[K], Predicate> extends Record<string, never>
        ? never
        : K]: Refs_[K] extends Predicate
    ? Refs_[K]
    : FilterRefs<Refs_[K], Predicate>;
}>;

export const justInternal = <Refs_ extends RefsAnyWithProps>(
  refs: Refs_,
): FilterRefs<Refs_, AnyInternal> => refs as any;

export const justPublic = <Refs_ extends RefsAnyWithProps>(
  refs: Refs_,
): FilterRefs<Refs_, AnyPublic> => refs as any;

export type RefsAnyWithProps =
  | {
      readonly [key: string]: RefsAnyWithProps;
    }
  | Any;

const HiddenFunctionKey = "@confect/core/api/HiddenFunctionKey";
type HiddenFunctionKey = typeof HiddenFunctionKey;
type HiddenFunction<Ref_ extends Any> = FunctionSpec.FunctionSpec<
  FunctionType<Ref_>,
  FunctionVisibility<Ref_>,
  string,
  Args<Ref_>,
  Returns<Ref_>
>;

export const getFunction = <
  FunctionType_ extends FunctionSpec.FunctionType,
  FunctionVisibility_ extends FunctionSpec.FunctionVisibility,
  Args_ extends Schema.Schema.AnyNoContext,
  Returns_ extends Schema.Schema.AnyNoContext,
  Ref_ extends Ref<FunctionType_, FunctionVisibility_, Args_, Returns_>,
>(
  ref: Ref_,
): HiddenFunction<Ref_> => (ref as any)[HiddenFunctionKey];

const HiddenConvexFunctionNameKey =
  "@confect/core/api/HiddenConvexFunctionNameKey";
type HiddenConvexFunctionNameKey = typeof HiddenConvexFunctionNameKey;
type HiddenConvexFunctionName = string;

export const getConvexFunctionName = <
  FunctionType_ extends FunctionSpec.FunctionType,
  FunctionVisibility_ extends FunctionSpec.FunctionVisibility,
  Args_ extends Schema.Schema.AnyNoContext,
  Returns_ extends Schema.Schema.AnyNoContext,
>(
  ref: Ref<FunctionType_, FunctionVisibility_, Args_, Returns_>,
): HiddenConvexFunctionName => (ref as any)[HiddenConvexFunctionNameKey];

// TODO: Move `Ref` stuff into own module
export interface Ref<
  _FunctionType extends FunctionSpec.FunctionType,
  _FunctionVisibility extends FunctionSpec.FunctionVisibility,
  _Args extends Schema.Schema.AnyNoContext,
  _Returns extends Schema.Schema.AnyNoContext,
> {
  readonly _FunctionType?: _FunctionType;
  readonly _FunctionVisibility?: _FunctionVisibility;
  readonly _Args?: _Args;
  readonly _Returns?: _Returns;
}

export interface Any extends Ref<any, any, any, any> {}

export interface AnyInternal extends Ref<any, "Internal", any, any> {}

export interface AnyPublic extends Ref<any, "Public", any, any> {}

export interface AnyQuery
  extends Ref<
    "Query",
    FunctionSpec.FunctionVisibility,
    Schema.Schema.AnyNoContext,
    Schema.Schema.AnyNoContext
  > {}

export interface AnyMutation
  extends Ref<
    "Mutation",
    FunctionSpec.FunctionVisibility,
    Schema.Schema.AnyNoContext,
    Schema.Schema.AnyNoContext
  > {}

export interface AnyAction
  extends Ref<
    "Action",
    FunctionSpec.FunctionVisibility,
    Schema.Schema.AnyNoContext,
    Schema.Schema.AnyNoContext
  > {}

export interface AnyPublicQuery
  extends Ref<
    "Query",
    "Public",
    Schema.Schema.AnyNoContext,
    Schema.Schema.AnyNoContext
  > {}

export interface AnyPublicMutation
  extends Ref<
    "Mutation",
    "Public",
    Schema.Schema.AnyNoContext,
    Schema.Schema.AnyNoContext
  > {}

export interface AnyPublicAction
  extends Ref<
    "Action",
    "Public",
    Schema.Schema.AnyNoContext,
    Schema.Schema.AnyNoContext
  > {}

export type FunctionType<Ref_> =
  Ref_ extends Ref<
    infer FunctionType_,
    infer _FunctionVisibility,
    infer _Args,
    infer _Returns
  >
    ? FunctionType_
    : never;

export type FunctionVisibility<Ref_> =
  Ref_ extends Ref<
    infer _FunctionType,
    infer FunctionVisibility_,
    infer _Args,
    infer _Returns
  >
    ? FunctionVisibility_
    : never;

export type Args<Ref_> =
  Ref_ extends Ref<
    infer _FunctionType,
    infer _FunctionVisibility,
    infer Args_,
    infer _Returns
  >
    ? Args_
    : never;

export type Returns<Ref_> =
  Ref_ extends Ref<
    infer _FunctionType,
    infer _FunctionVisibility,
    infer _Args,
    infer Returns_
  >
    ? Returns_
    : never;

const makeRef = <
  FunctionType_ extends FunctionSpec.FunctionType,
  FunctionVisibility_ extends FunctionSpec.FunctionVisibility,
  Args_ extends Schema.Schema.AnyNoContext,
  Returns_ extends Schema.Schema.AnyNoContext,
>(
  /**
   * This is a Convex "function name" of the format "myGroupDir/myGroupMod:myFunc".
   */
  convexFunctionName: string,
  function_: FunctionSpec.FunctionSpec<
    FunctionType_,
    FunctionVisibility_,
    string,
    Args_,
    Returns_
  >,
): Ref<FunctionType_, FunctionVisibility_, Args_, Returns_> =>
  ({
    [HiddenFunctionKey]: function_,
    [HiddenConvexFunctionNameKey]: convexFunctionName,
  }) as Ref<FunctionType_, FunctionVisibility_, Args_, Returns_>;

export const make = <Spec_ extends Spec.AnyWithProps>(
  spec: Spec_,
): Refs<Spec_> => makeHelper(spec.groups) as Refs<Spec_>;

const makeHelper = (
  groups: Record.ReadonlyRecord<string, GroupSpec.Any>,
  groupPath: string | null = null,
): RefsAnyWithProps =>
  pipe(
    groups as Record.ReadonlyRecord<string, GroupSpec.AnyWithProps>,
    Record.map((group) => {
      const currentGroupPath = groupPath
        ? `${groupPath}/${group.name}`
        : group.name;

      return Record.union(
        makeHelper(group.groups, currentGroupPath),
        Record.map(group.functions, (function_) =>
          makeRef(`${currentGroupPath}:${function_.name}`, function_),
        ),
        (_subGroup, _function) => {
          throw new Error(
            `Group and function at same level have same name ('${getConvexFunctionName(_function)}')`,
          );
        },
      );
    }),
  );
