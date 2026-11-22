import * as Option from "effect/Option";
import * as Array from "effect/Array";
import * as MiddlewareAttachment from "./MiddlewareAttachment";
import * as Predicate from "effect/Predicate";
import * as Record from "effect/Record";
import * as Result from "effect/Result";
import type * as FunctionSpec from "./FunctionSpec";
import type * as MiddlewareSpec from "./MiddlewareSpec";
import type * as RuntimeAndFunctionType from "./RuntimeAndFunctionType";
import { validateConfectFunctionIdentifier } from "./Identifier";

/**
 * @internal
 */
export const TypeId = "~@confect/core/GroupSpec";
/**
 * @internal
 */
export type TypeId = typeof TypeId;

/**
 * @internal
 */
export const isGroupSpec = (u: unknown): u is AnyWithProps =>
  Predicate.hasProperty(u, TypeId);

/**
 * An immutable group of function declarations sharing one runtime. Build a
 * Convex group with {@link make} or a Node.js action group with
 * {@link makeNode}, then default-export it from a spec module.
 *
 * **Details**
 *
 * Codegen assigns the group a filename-derived name and assembles child groups
 * without evaluating schema factories. Each child keeps its own runtime and
 * middleware; the parent's middleware covers only its own functions.
 *
 * @category Models
 */
export interface GroupSpec<
  Runtime extends RuntimeAndFunctionType.Runtime,
  Name_ extends string,
  Functions_ extends FunctionSpec.AnyWithPropsWithRuntime<Runtime> = never,
  // Subgroups may be of any runtime, independent of this group's own runtime: a
  // group is only a namespace for its children, which are otherwise-independent
  // modules. Functions, by contrast, stay homogeneous (a Node group only accepts
  // Node actions)—`addFunction` keeps the `<Runtime>` bound below.
  Groups_ extends AnyWithProps = never,
  MiddlewareSpecs_ extends MiddlewareSpec.AnyMiddlewareSpec = never,
> {
  /**
   * Identifies a Confect group declaration.
   *
   * @category Models
   */
  readonly [TypeId]: TypeId;
  /**
   * The runtime required by this group's own functions.
   *
   * @category Models
   */
  readonly runtime: Runtime;
  /**
   * Whether this group's Convex queries and mutations opt into context reuse.
   *
   * @category Options
   */
  readonly experimental_reuseContext: boolean;
  /**
   * The codegen-assigned group segment; empty on a newly created group.
   *
   * @category Models
   */
  readonly name: Name_;
  /**
   * This group's own function declarations, keyed by local function name.
   *
   * @category Models
   */
  readonly functions: {
    [
      FunctionName in FunctionSpec.Name<
        FunctionSpec.AnyWithPropsWithRuntime<Runtime>
      >
    ]: FunctionSpec.WithName<Functions_, FunctionName>;
  };
  /**
   * Codegen-assembled child groups; each child may use a different runtime.
   *
   * @category Models
   */
  readonly groups: {
    [GroupName in Name<Groups_>]: WithName<Groups_, GroupName>;
  };
  /**
   * Group-level middleware declarations in attachment order.
   *
   * @category Middleware
   */
  readonly middlewareSpecs: ReadonlyArray<MiddlewareSpecs_>;
  /**
   * Group-level middleware declarations paired with their attachment options.
   *
   * @category Middleware
   */
  readonly middlewareAttachments: ReadonlyArray<
    MiddlewareAttachment.MiddlewareAttachment<MiddlewareSpecs_>
  >;
  /**
   * The union of this group's function types; not a runtime property.
   *
   * @category Models
   */
  readonly "~Functions": Functions_;
  /**
   * The union of child-group types; not a runtime property.
   *
   * @category Models
   */
  readonly "~Groups": Groups_;

  /**
   * Adds a function to the group without changing the original group. The
   * function must use the same runtime and have a kind covered by every group
   * middleware. Plain Convex functions cannot use Confect middleware.
   *
   * @category Combinators
   *
   * @param function_ - The function declaration to add.
   *
   * @returns A new group with the function; this group is unchanged.
   *
   * @throws If an optionless middleware key is attached to both the group and
   *   function.
   */
  addFunction<Function extends FunctionSpec.AnyWithPropsWithRuntime<Runtime>>(
    function_: Function &
      MiddlewareSpec.ValidateAddedFunction<Function, MiddlewareSpecs_>,
  ): GroupSpec<
    Runtime,
    Name_,
    Functions_ | Function,
    Groups_,
    MiddlewareSpecs_
  >;

  /**
   * Attaches middleware to this group's functions, not its child groups. Group
   * middleware runs in attachment order before function-level middleware. If a
   * group attachment requires a service, attach its provider earlier in the
   * group chain.
   *
   * @category Combinators
   *
   * @param middlewareSpec - A policy covering all function kinds in the group.
   * @param options - Its options schema's decoded value, required only when
   *   that schema exists.
   *
   * @returns A new group with the attachment; this group is unchanged.
   *
   * @throws For duplicate optionless keys within the group or across the
   *   group/function boundary. Options are checked without coercion during
   *   codegen and registration; equivalent repeated options are rejected then.
   */
  middleware<MiddlewareSpec_ extends MiddlewareSpec.AnyMiddlewareSpec>(
    middlewareSpec: MiddlewareSpec_ &
      MiddlewareSpec.ValidateAttach<
        MiddlewareSpec_,
        Functions_,
        MiddlewareSpecs_
      >,
    ...options: MiddlewareAttachment.Args<NoInfer<MiddlewareSpec_>>
  ): GroupSpec<
    Runtime,
    Name_,
    Functions_,
    Groups_,
    MiddlewareSpecs_ | MiddlewareSpec_
  >;
}

/**
 * @internal
 */
export interface Any {
  readonly [TypeId]: TypeId;
}

/**
 * @internal
 */
export interface AnyWithProps extends GroupSpec<
  RuntimeAndFunctionType.Runtime,
  string,
  FunctionSpec.AnyWithProps,
  AnyWithProps,
  MiddlewareSpec.AnyMiddlewareSpec
> {}

/**
 * @internal
 */
export type Name<Group extends AnyWithProps> = Group["name"];

/**
 * @internal
 */
export type Functions<Group extends AnyWithProps> = Group["~Functions"];

/**
 * @internal
 */
export type Groups<Group extends AnyWithProps> = Group["~Groups"];

/**
 * @internal
 */
export type MiddlewareSpecs<Group extends AnyWithProps> =
  Group["middlewareSpecs"][number];

/**
 * @internal
 */
export type GroupNames<Group extends AnyWithProps> = [Groups<Group>] extends [
  never,
]
  ? never
  : Name<Groups<Group>>;

/**
 * @internal
 */
export type WithName<
  Group extends AnyWithProps,
  Name_ extends Name<Group>,
> = Extract<Group, { readonly name: Name_ }>;

/**
 * Assigns a segment name to a leaf group created with {@link make} for typing
 * and refs.
 *
 * @internal
 */
export type NamedAt<Group extends Any, Name_ extends string> = Omit<
  Group,
  "name"
> & {
  readonly name: Name_;
};

/**
 * @internal
 */
export type AddGroups<
  Group extends AnyWithProps,
  ExtraGroups extends AnyWithProps,
> =
  Group extends GroupSpec<
    infer Runtime,
    string,
    infer Functions_,
    infer Groups_,
    infer MiddlewareSpecs_
  >
    ? GroupSpec<
        Runtime,
        Group["name"],
        Functions_,
        Exclude<Groups_, { readonly name: Name<ExtraGroups> }> | ExtraGroups,
        MiddlewareSpecs_
      >
    : never;

const Proto = {
  [TypeId]: TypeId,

  get middlewareSpecs() {
    return Array.map(this.middlewareAttachments, ({ spec }) => spec);
  },

  addFunction<Function extends FunctionSpec.AnyWithProps>(
    this: Any,
    function_: Function,
  ) {
    const this_ = this as AnyWithProps;

    const overlapping = Array.findFirst(
      function_.middlewareAttachments,
      ({ spec: functionMiddlewareSpec }) =>
        !("options" in functionMiddlewareSpec) &&
        Array.some(
          this_.middlewareAttachments,
          ({ spec: groupMiddlewareSpec }) =>
            groupMiddlewareSpec.key === functionMiddlewareSpec.key,
        ),
    );
    if (Option.isSome(overlapping)) {
      throw new Error(
        `Middleware "${overlapping.value.spec.key}" is attached to both function "${function_.name}" and its group`,
      );
    }

    return makeProto({
      runtime: this_.runtime,
      experimental_reuseContext: this_.experimental_reuseContext,
      name: this_.name,
      functions: Record.set(this_.functions, function_.name, function_),
      groups: this_.groups,
      middlewareAttachments: this_.middlewareAttachments,
    });
  },

  middleware<MiddlewareSpec_ extends MiddlewareSpec.AnyMiddlewareSpec>(
    this: Any,
    middlewareSpec: MiddlewareSpec_,
    ...options: ReadonlyArray<unknown>
  ) {
    const this_ = this as AnyWithProps;

    if (
      !("options" in middlewareSpec) &&
      Array.some(
        this_.middlewareAttachments,
        ({ spec }) => spec.key === middlewareSpec.key,
      )
    ) {
      throw new Error(
        `Middleware "${middlewareSpec.key}" is already attached to this group`,
      );
    }

    for (const function_ of Record.values(this_.functions)) {
      if (
        !("options" in middlewareSpec) &&
        Array.some(
          function_.middlewareAttachments,
          ({ spec }) => spec.key === middlewareSpec.key,
        )
      ) {
        throw new Error(
          `Middleware "${middlewareSpec.key}" is attached to both function "${function_.name}" and its group`,
        );
      }
    }

    return makeProto({
      runtime: this_.runtime,
      experimental_reuseContext: this_.experimental_reuseContext,
      name: this_.name,
      functions: this_.functions,
      groups: this_.groups,
      middlewareAttachments: [
        ...this_.middlewareAttachments,
        { spec: middlewareSpec, options: options[0] },
      ],
    });
  },
} satisfies ThisType<AnyWithProps>;

const makeProto = <
  Runtime extends RuntimeAndFunctionType.Runtime,
  Name_ extends string,
  Functions_ extends FunctionSpec.AnyWithPropsWithRuntime<Runtime>,
  Groups_ extends AnyWithProps,
  MiddlewareAttachments_ extends
    ReadonlyArray<MiddlewareAttachment.MiddlewareAttachment>,
>({
  runtime,
  experimental_reuseContext,
  name,
  functions,
  groups,
  middlewareAttachments,
}: {
  runtime: Runtime;
  experimental_reuseContext?: boolean | undefined;
  name: Name_;
  functions: Record.ReadonlyRecord<string, Functions_>;
  groups: Record.ReadonlyRecord<string, Groups_>;
  middlewareAttachments: MiddlewareAttachments_;
}): GroupSpec<
  Runtime,
  Name_,
  Functions_,
  Groups_,
  MiddlewareAttachments_[number]["spec"]
> =>
  Object.assign(Object.create(Proto), {
    runtime,
    experimental_reuseContext:
      experimental_reuseContext === undefined
        ? false
        : experimental_reuseContext,
    name,
    functions,
    groups,
    middlewareAttachments,
  }) as GroupSpec<
    Runtime,
    Name_,
    Functions_,
    Groups_,
    MiddlewareAttachments_[number]["spec"]
  >;

/**
 * Creates an empty group for queries, mutations, and actions in the Convex
 * runtime. Default-export the completed builder from a `*.spec.ts` module.
 *
 * **Gotchas**
 *
 * With experimental context reuse enabled, the same V8 context may serve
 * different users. Never retain request-specific data in module state. The name
 * `experimental_reuseContext` is reserved for the generated flag in an opted-in
 * group.
 *
 * **Example** (Grouping a public query in a spec module)
 *
 * ```ts
 * import { FunctionSpec, GroupSpec } from "@confect/core";
 * import * as Schema from "effect/Schema";
 *
 * export default GroupSpec.make().addFunction(
 *   FunctionSpec.publicQuery({
 *     name: "count",
 *     returns: () => Schema.Number,
 *   }),
 * );
 * ```
 *
 * @category Constructors
 *
 * @param options - Optional group configuration.
 * @param options.experimental_reuseContext - Enables experimental V8 context
 *   reuse for this group's queries and mutations. Defaults to false and does
 *   not affect actions or child groups.
 *
 * @returns A new unnamed group; codegen assigns the module's name.
 *
 * @see {@link makeNode} for a group of Node.js actions.
 */
export const make = (
  options: { readonly experimental_reuseContext?: boolean | undefined } = {},
): GroupSpec<"Convex", ""> =>
  makeProto({
    runtime: "Convex",
    experimental_reuseContext: options.experimental_reuseContext,
    name: "",
    functions: Record.empty(),
    groups: Record.empty(),
    middlewareAttachments: [],
  });

/**
 * Creates an empty group for Node.js actions. Add `publicNodeAction`,
 * `internalNodeAction`, or their plain Convex counterparts and default-export
 * the result from a Node spec module. Node groups do not support context
 * reuse.
 *
 * @category Constructors
 *
 * @returns A new unnamed Node group; codegen assigns the module's name.
 *
 * @see {@link make} for a Convex-runtime group.
 */
export const makeNode = (): GroupSpec<"Node", ""> =>
  makeProto({
    runtime: "Node",
    name: "",
    functions: Record.empty(),
    groups: Record.empty(),
    middlewareAttachments: [],
  });

/**
 * @internal
 */
export function withName<const Name_ extends string, Group extends Any>(
  name: Name_,
  group: Group,
): NamedAt<Group, Name_>;
/**
 * @internal
 */
export function withName(name: string, group: Any): AnyWithProps {
  validateConfectFunctionIdentifier(name);
  const group_ = group as AnyWithProps;

  if (group_.name === name) {
    return group_;
  }

  return makeProto({
    runtime: group_.runtime,
    experimental_reuseContext: group_.experimental_reuseContext,
    name,
    functions: group_.functions,
    groups: group_.groups,
    middlewareAttachments: group_.middlewareAttachments,
  });
}

/**
 * @internal
 */
export const addGroupsAt = (
  group: AnyWithProps,
  children: Record.ReadonlyRecord<string, AnyWithProps>,
): AnyWithProps =>
  makeProto({
    runtime: group.runtime,
    experimental_reuseContext: group.experimental_reuseContext,
    name: group.name,
    functions: group.functions,
    groups: Record.union(
      group.groups,
      Record.map(children, (child, name) => withName(name, child)),
      (_existing, incoming) => incoming,
    ),
    middlewareAttachments: group.middlewareAttachments,
  });

/**
 * @internal
 */
export const validateMiddleware = (
  group: AnyWithProps,
): Result.Result<void, MiddlewareAttachment.ValidationError> =>
  Result.gen(function* () {
    yield* MiddlewareAttachment.validateAll(
      group.middlewareAttachments,
      `group "${group.name}"`,
    );
    for (const function_ of Record.values(group.functions)) {
      yield* MiddlewareAttachment.validateAll(
        [...group.middlewareAttachments, ...function_.middlewareAttachments],
        `function "${function_.name}"`,
      );
    }
    for (const child of Record.values(group.groups))
      yield* validateMiddleware(child);
  });
