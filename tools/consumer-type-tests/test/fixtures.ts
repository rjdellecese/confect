import * as FunctionSpec from "@confect/core/FunctionSpec";
import * as GroupSpec from "@confect/core/GroupSpec";
import * as MiddlewareSpec from "@confect/core/MiddlewareSpec";
import * as Refs from "@confect/core/Refs";
import * as Spec from "@confect/core/Spec";
import * as Schema from "effect/Schema";

export const withoutError = FunctionSpec.publicQuery({
  name: "withoutError",
  returns: () => Schema.String,
});

export const withError = FunctionSpec.publicQuery({
  name: "withError",
  returns: () => Schema.String,
  error: () => Schema.FiniteFromString,
});

export const paginatedWithoutError = FunctionSpec.publicPaginatedQuery({
  name: "paginatedWithoutError",
  item: () => Schema.String,
});

export const paginatedWithError = FunctionSpec.publicPaginatedQuery({
  name: "paginatedWithError",
  item: () => Schema.String,
  error: () => Schema.FiniteFromString,
});

export class AccessDenied extends Schema.TaggedError<AccessDenied>()(
  "AccessDenied",
  {},
) {}

export class Authorize extends MiddlewareSpec.MiddlewareSpec<Authorize>()(
  "Authorize",
  {
    error: () => AccessDenied,
    functionTypes: { query: true, mutation: false, action: false },
  },
) {}

export class Observe extends MiddlewareSpec.MiddlewareSpec<Observe>()(
  "Observe",
  { functionTypes: { query: true, mutation: false, action: false } },
) {}

export const group = GroupSpec.makeAt("queries")
  .addFunction(withoutError)
  .addFunction(withError)
  .addFunction(paginatedWithoutError)
  .addFunction(paginatedWithError);

export const refs = Refs.make(Spec.make().add(group));
export const authorizedRefs = Refs.make(
  Spec.make().add(group.middleware(Authorize)),
);
export const observedRefs = Refs.make(
  Spec.make().add(group.middleware(Observe)),
);

export const functionMiddlewareRefs = Refs.make(
  Spec.make().add(
    GroupSpec.makeAt("queries").addFunction(withoutError.middleware(Authorize)),
  ),
);
