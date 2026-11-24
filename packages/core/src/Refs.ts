/**
 * Builds the application's generated function refs. Default-import `refs` from
 * `confect/_generated/refs` rather than importing this package subpath.
 *
 * @module
 *
 * @internal
 */

import type { Types } from "effect";
import { pipe } from "effect/Function";
import * as Option from "effect/Option";
import * as Record from "effect/Record";
import type * as FunctionSpec from "./FunctionSpec";
import type * as GroupSpec from "./GroupSpec";
import type * as MiddlewareSpec from "./MiddlewareSpec";
import * as Ref from "./Ref";
import * as Spec from "./Spec";

/**
 * Computes the filtered tree used by generated function refs. For an
 * application type, use `typeof refs.public` or `typeof refs.internal` on the
 * default import from `confect/_generated/refs`.
 *
 * @internal
 */
export type Refs<
  Spec_ extends Spec.AnyWithProps,
  Predicate extends Ref.Any = Ref.Any,
> = Types.Simplify<OmitEmpty<Helper<Spec.Groups<Spec_>, Predicate>>>;

/**
 * Names the two views of a generated ref tree. Use the default `refs` from
 * `confect/_generated/refs` and its `public` and `internal` members instead of
 * naming this interface.
 *
 * @internal
 */
export interface FromSpec<Spec_ extends Spec.AnyWithProps> {
  /**
   * Refs typed for public functions, usable by clients and server-side callers.
   *
   * @category Models
   */
  public: Refs<Spec_, Ref.AnyPublic>;
  /**
   * Refs typed for internal functions, usable only by server-side callers.
   *
   * @category Models
   */
  internal: Refs<Spec_, Ref.AnyInternal>;
}

type GroupRefs<
  Group extends GroupSpec.AnyWithProps,
  Predicate extends Ref.Any,
> = Types.Simplify<
  OmitEmpty<Helper<GroupSpec.Groups<Group>, Predicate>> &
    FilteredFunctions<
      GroupSpec.Functions<Group>,
      Predicate,
      MiddlewareSpec.Error<GroupSpec.MiddlewareSpecs<Group>>
    >
>;

type OmitEmpty<T> = {
  [K in keyof T as keyof T[K] extends never ? never : K]: T[K];
};

type FunctionSpecMatchesPredicate<
  FunctionSpec_ extends FunctionSpec.AnyWithProps,
  Predicate extends Ref.Any,
> =
  Ref.Ref<
    FunctionSpec.GetRuntimeAndFunctionType<FunctionSpec_>,
    FunctionSpec.GetFunctionVisibility<FunctionSpec_>,
    any,
    any,
    any
  > extends Predicate
    ? true
    : false;

type FilteredFunctions<
  FunctionSpecs extends FunctionSpec.AnyWithProps,
  Predicate extends Ref.Any,
  MiddlewareError,
> = {
  [
    Name in FunctionSpec.Name<FunctionSpecs> as FunctionSpec.WithName<
      FunctionSpecs,
      Name
    > extends infer FunctionSpec_ extends FunctionSpec.AnyWithProps
      ? FunctionSpecMatchesPredicate<FunctionSpec_, Predicate> extends true
        ? Name
        : never
      : never
  ]: FunctionSpec.WithName<FunctionSpecs, Name> extends infer F extends
    FunctionSpec.AnyWithProps
    ? Ref.FromFunctionSpec<
        F,
        F extends {
          readonly functionProvenance: { readonly _tag: "Confect" };
        }
          ? | MiddlewareError
            | MiddlewareSpec.Error<FunctionSpec.MiddlewareSpecs<F>>
          : never
      >
    : never;
};

type Helper<
  Groups extends GroupSpec.AnyWithProps,
  Predicate extends Ref.Any,
> = {
  [GroupName in GroupSpec.Name<Groups>]: GroupSpec.WithName<
    Groups,
    GroupName
  > extends infer Group extends GroupSpec.AnyWithProps
    ? GroupRefs<Group, Predicate>
    : never;
};

type Any =
  | {
      readonly [key: string]: Any;
    }
  | Ref.Any;

/**
 * Builds the generated ref tree from the project spec. Default-import `refs`
 * from `confect/_generated/refs` instead of constructing the tree directly.
 *
 * @internal
 */
export const make = <Spec_ extends Spec.AnyWithProps>(
  spec: Spec_,
): FromSpec<Spec_> => {
  const refs = makeHelper(Spec.groups(spec));
  return {
    public: refs as Refs<Spec_, Ref.AnyPublic>,
    internal: refs as Refs<Spec_, Ref.AnyInternal>,
  };
};

const makeHelper = (
  groups: Record.ReadonlyRecord<string, GroupSpec.AnyWithProps>,
  convexFunctionNamespace: Option.Option<string> = Option.none(),
): Any =>
  pipe(
    groups,
    Record.map((group, name) => {
      const currentConvexFunctionNamespace = Option.match(
        convexFunctionNamespace,
        {
          onNone: () => name,
          onSome: (parentNamespace) => `${parentNamespace}/${name}`,
        },
      );

      return Record.union(
        makeHelper(group.groups, Option.some(currentConvexFunctionNamespace)),
        Record.map(group.functions, (function_) =>
          Ref.make(
            currentConvexFunctionNamespace,
            function_,
            group.middlewareAttachments,
          ),
        ),
        (_subGroup, _function) => {
          throw new Error(
            `Group and function at same level have same name ('${Ref.getConvexFunctionName(_function)}')`,
          );
        },
      );
    }),
  );
