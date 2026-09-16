import * as FunctionSpec from "@confect/core/FunctionSpec";
import type * as MiddlewareSpec from "@confect/core/MiddlewareSpec";
import type * as Ref from "@confect/core/Ref";
import type { RegisteredQuery } from "convex/server";
import type * as Schema from "effect/Schema";
import { expectTypeOf } from "vitest";
import type {
  AccessDenied,
  Authorize,
  Observe,
  authorizedRefs,
  functionMiddlewareRefs,
  observedRefs,
  paginatedWithError,
  paginatedWithoutError,
  refs,
  withError,
  withoutError,
} from "./fixtures";

expectTypeOf<FunctionSpec.ErrorSchema<typeof withoutError>>().toBeNever();
expectTypeOf<FunctionSpec.Error<typeof withoutError>>().toBeNever();
expectTypeOf<FunctionSpec.EncodedError<typeof withoutError>>().toBeNever();
expectTypeOf<FunctionSpec.ErrorSchema<typeof withError>>().toEqualTypeOf<
  typeof Schema.FiniteFromString
>();
expectTypeOf<FunctionSpec.Error<typeof withError>>().toEqualTypeOf<number>();
expectTypeOf<
  FunctionSpec.EncodedError<typeof withError>
>().toEqualTypeOf<string>();

expectTypeOf<
  FunctionSpec.ErrorSchema<typeof paginatedWithoutError>
>().toBeNever();
expectTypeOf<FunctionSpec.Error<typeof paginatedWithoutError>>().toBeNever();
expectTypeOf<
  FunctionSpec.EncodedError<typeof paginatedWithoutError>
>().toBeNever();
expectTypeOf<
  FunctionSpec.ErrorSchema<typeof paginatedWithError>
>().toEqualTypeOf<typeof Schema.FiniteFromString>();
expectTypeOf<
  FunctionSpec.Error<typeof paginatedWithError>
>().toEqualTypeOf<number>();
expectTypeOf<
  FunctionSpec.EncodedError<typeof paginatedWithError>
>().toEqualTypeOf<string>();

const convexQuery =
  FunctionSpec.convexPublicQuery<
    RegisteredQuery<"public", {}, Promise<string>>
  >()("convexQuery");

type Mixed = typeof withoutError | typeof withError | typeof convexQuery;
expectTypeOf<FunctionSpec.ErrorSchema<Mixed>>().toEqualTypeOf<
  typeof Schema.FiniteFromString
>();
expectTypeOf<FunctionSpec.Error<Mixed>>().toEqualTypeOf<number>();
expectTypeOf<FunctionSpec.EncodedError<Mixed>>().toEqualTypeOf<string>();
expectTypeOf<FunctionSpec.ErrorSchema<typeof convexQuery>>().toBeNever();
expectTypeOf<FunctionSpec.Error<typeof convexQuery>>().toBeNever();
expectTypeOf<FunctionSpec.ErrorSchema<never>>().toBeNever();
expectTypeOf<FunctionSpec.ErrorSchema<FunctionSpec.AnyConfect>>().toEqualTypeOf<
  Schema.Codec<any, any>
>();
expectTypeOf<FunctionSpec.Error<FunctionSpec.AnyConfect>>().toBeAny();

expectTypeOf<Ref.Error<typeof refs.public.queries.withoutError>>().toBeNever();
expectTypeOf<
  Ref.Error<typeof refs.public.queries.withError>
>().toEqualTypeOf<number>();
expectTypeOf<
  Ref.Error<typeof refs.public.queries.paginatedWithoutError>
>().toBeNever();
expectTypeOf<
  Ref.Error<typeof refs.public.queries.paginatedWithError>
>().toEqualTypeOf<number>();
expectTypeOf<MiddlewareSpec.Error<typeof Observe>>().toBeNever();
expectTypeOf<
  MiddlewareSpec.Error<typeof Authorize>
>().toEqualTypeOf<AccessDenied>();
expectTypeOf<
  Ref.Error<typeof observedRefs.public.queries.withoutError>
>().toBeNever();
expectTypeOf<
  Ref.Error<typeof authorizedRefs.public.queries.withoutError>
>().toEqualTypeOf<AccessDenied>();
expectTypeOf<
  Ref.Error<typeof authorizedRefs.public.queries.withError>
>().toEqualTypeOf<number | AccessDenied>();
expectTypeOf<
  Ref.Error<typeof authorizedRefs.public.queries.paginatedWithoutError>
>().toEqualTypeOf<AccessDenied>();
expectTypeOf<
  Ref.Error<typeof authorizedRefs.public.queries.paginatedWithError>
>().toEqualTypeOf<number | AccessDenied>();

expectTypeOf<
  Ref.Error<typeof functionMiddlewareRefs.public.queries.withoutError>
>().toEqualTypeOf<AccessDenied>();
